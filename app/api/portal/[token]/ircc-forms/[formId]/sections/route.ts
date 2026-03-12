import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { buildClientQuestionnaireFromDB } from '@/lib/ircc/questionnaire-engine-db'
import type { IRCCProfile } from '@/lib/types/ircc-profile'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Token Validation Helper ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateToken(admin: any, token: string) {
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, metadata, expires_at, is_active')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 404 }) }
  }

  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Link expired' }, { status: 410 }) }
  }

  return { link }
}

// ── GET /api/portal/[token]/ircc-forms/[formId]/sections ────────────────────

/**
 * Returns questionnaire sections for a SINGLE form.
 *
 * Calls buildClientQuestionnaireFromDB with a single-element formId array.
 * The existing engine already works with single formId — no changes needed.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string; formId: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token, formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    // Validate token
    const result = await validateToken(admin, token)
    if (result.error) return result.error
    const { link } = result

    const matterId = link.matter_id

    // ── 1. Verify formId belongs to this matter's configured forms ────────
    const { data: matter } = await admin
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter?.matter_type_id) {
      return NextResponse.json({ error: 'No matter type configured' }, { status: 404 })
    }

    const { data: streamForm } = await admin
      .from('ircc_stream_forms')
      .select('form_id')
      .eq('matter_type_id', matter.matter_type_id)
      .eq('form_id', formId)
      .maybeSingle()

    if (!streamForm) {
      return NextResponse.json(
        { error: 'Form not configured for this matter type' },
        { status: 404 },
      )
    }

    // ── 2. Fetch contact profile ──────────────────────────────────────────
    let contactId: string | null = null

    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('contact_id, status, progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    contactId = session?.contact_id ?? null

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
    const sectionSessionProgress = (session?.progress as any) as Record<string, unknown> | null | undefined
    const sectionSessionHasSaves =
      session?.status === 'completed' ||
      sectionSessionProgress?.has_portal_saves === true ||
      (sectionSessionProgress?.forms && Object.keys(sectionSessionProgress.forms as object).length > 0)

    let existingProfile: Partial<IRCCProfile> = {}
    if (contactId && sectionSessionHasSaves) {
      const { data: contact } = await admin
        .from('contacts')
        .select('immigration_data')
        .eq('id', contactId)
        .single()

      existingProfile = (contact?.immigration_data as Partial<IRCCProfile>) ?? {}
    }

    // ── 3. Build questionnaire for this single form ───────────────────────
    const questionnaire = await buildClientQuestionnaireFromDB(
      [formId],
      existingProfile,
      admin,
    )

    return NextResponse.json(questionnaire)
  } catch (error) {
    console.error('[portal-ircc-form-sections] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/ircc-forms/[formId]/sections')
