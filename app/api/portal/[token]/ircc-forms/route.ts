import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { computePerFormProgress } from '@/lib/ircc/questionnaire-engine-db'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── GET /api/portal/[token]/ircc-forms ──────────────────────────────────────

/**
 * Returns all IRCC forms for this portal link's matter with per-form progress.
 *
 * Source of truth: ircc_stream_forms → ircc_forms → ircc_form_fields.
 * Per-form status tracked in ircc_questionnaire_sessions.progress JSONB.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = await rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    const matterId = link.matter_id

    // ── 1. Fetch matter type ──────────────────────────────────────────────
    const { data: matter } = await admin
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter?.matter_type_id) {
      return NextResponse.json({ forms: [], overall: { total_forms: 0, completed_forms: 0, overall_progress_percent: 0 }, session_status: null })
    }

    // ── 2. Fetch configured forms from ircc_stream_forms ──────────────────
    const { data: streamForms } = await admin
      .from('ircc_stream_forms')
      .select('form_id, sort_order, is_required, ircc_forms!inner(form_code, form_name)')
      .eq('matter_type_id', matter.matter_type_id)
      .order('sort_order', { ascending: true })

    if (!streamForms || streamForms.length === 0) {
      return NextResponse.json({ forms: [], overall: { total_forms: 0, completed_forms: 0, overall_progress_percent: 0 }, session_status: null })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formRecords = streamForms as any[]
    const formIds = formRecords.map((sf: any) => sf.form_id as string)

    // ── 3. Fetch session + per-form progress from session.progress ─────────
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id, status, progress, completed_at, contact_id')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionProgress = (session?.progress as any)?.forms ?? {}

    // ── 4. Fetch contact profile for live progress computation ────────────
    let contactId: string | null = session?.contact_id ?? null

    if (!contactId) {
      const { data: primaryPerson } = await admin
        .from('matter_people')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('person_role', 'client')
        .limit(1)
        .maybeSingle()

      contactId = primaryPerson?.contact_id ?? null
    }

    // Only load profile if this session has had explicit saves, to prevent
    // stale immigration_data from a previous matter pre-filling a new matter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionProgressData = (session?.progress as any) as Record<string, unknown> | null | undefined
    const sessionHasSaves =
      session?.status === 'completed' ||
      sessionProgressData?.has_portal_saves === true ||
      (sessionProgressData?.forms && Object.keys(sessionProgressData.forms as object).length > 0)

    let existingProfile: Partial<IRCCProfile> = {}
    if (contactId && sessionHasSaves) {
      const { data: contact } = await admin
        .from('contacts')
        .select('immigration_data')
        .eq('id', contactId)
        .single()

      existingProfile = (contact?.immigration_data as Partial<IRCCProfile>) ?? {}
    }

    // ── 5. Compute live per-form progress ─────────────────────────────────
    const progressMap = await computePerFormProgress(formIds, existingProfile, admin)

    // ── 6. Build per-form response ────────────────────────────────────────
    let completedForms = 0
    let totalWeightedProgress = 0
    let totalWeightedFields = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forms = formRecords.map((sf: any) => {
      const formId = sf.form_id as string
      const formCode = sf.ircc_forms?.form_code ?? ''
      const formName = sf.ircc_forms?.form_name ?? formCode
      const sortOrder = sf.sort_order ?? 0
      const isRequired = sf.is_required ?? true

      // Get persisted per-form status from session.progress
      const savedStatus = sessionProgress[formId] ?? {}
      const liveProgress = progressMap.get(formId) ?? { filled: 0, total: 0, percent: 0 }

      // Determine status: persisted status wins for 'completed', else compute from progress
      let status: 'not_started' | 'in_progress' | 'completed' = 'not_started'
      if (savedStatus.status === 'completed') {
        status = 'completed'
        completedForms++
      } else if (liveProgress.filled > 0) {
        status = 'in_progress'
      }

      // Use live progress for percentage (always up-to-date)
      const progressPercent = liveProgress.percent

      // Aggregate for overall progress
      totalWeightedProgress += liveProgress.filled
      totalWeightedFields += liveProgress.total

      return {
        form_id: formId,
        form_code: formCode,
        form_name: formName,
        sort_order: sortOrder,
        is_required: isRequired,
        status,
        progress_percent: progressPercent,
        filled_fields: liveProgress.filled,
        total_fields: liveProgress.total,
        completed_at: savedStatus.completed_at ?? null,
        last_saved_at: savedStatus.last_saved_at ?? null,
      }
    })

    const overallPercent = totalWeightedFields > 0
      ? Math.round((totalWeightedProgress / totalWeightedFields) * 100)
      : 0

    return NextResponse.json({
      forms,
      overall: {
        total_forms: forms.length,
        completed_forms: completedForms,
        overall_progress_percent: overallPercent,
      },
      session_status: session?.status ?? null,
    })
  } catch (error) {
    console.error('[portal-ircc-forms] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/ircc-forms')
