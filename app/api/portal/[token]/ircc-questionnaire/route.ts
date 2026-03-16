import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { countClientVisibleFields } from '@/lib/ircc/questionnaire-engine-db'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

// 30 requests per minute per IP — prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Flatten a nested object into dot-notation keys.
 * e.g. { personal: { family_name: 'Smith' } } → { 'personal.family_name': 'Smith' }
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v as Record<string, unknown>, path, out)
    } else {
      out[path] = v
    }
  }
  return out
}

// ── Deep Merge Helper ────────────────────────────────────────────────────────

/**
 * Deep merge two objects. Arrays are replaced, not concatenated.
 * Null/undefined values in source do NOT overwrite existing values.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = target[key]

    if (sourceVal === undefined || sourceVal === null) {
      continue // Don't overwrite with empty values
    }

    if (
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      result[key] = sourceVal
    }
  }

  return result
}

// ── GET /api/portal/[token]/ircc-questionnaire ───────────────────────────────

/**
 * Check if an IRCC questionnaire session exists for this portal link's matter.
 * Returns session status and existing profile data.
 *
 * Single source of truth: Settings → Matter Type → ircc_stream_forms → ircc_form_fields.
 * The DB-driven questionnaire is always preferred. Session form_codes are refreshed
 * from the current configuration when they become stale.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
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

    const admin = createAdminClient()

    const matterId = link.matter_id

    // ── 1. Fetch matter type ────────────────────────────────────────────────
    const { data: matter } = await admin
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    const matterTypeId = matter?.matter_type_id ?? null

    // ── 2. Determine current form configuration from DB ─────────────────────
    // Single source of truth: ircc_stream_forms → ircc_form_fields
    let useDbQuestionnaire = false
    let formIds: string[] = []
    let currentFormCodes: string[] = []

    if (matterTypeId) {
      // Primary source: ircc_stream_forms (Settings → Matter Type → Forms)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: streamForms } = await (admin as any)
        .from('ircc_stream_forms')
        .select('form_id, ircc_forms!inner(form_code)')
        .eq('matter_type_id', matterTypeId)
        .order('sort_order', { ascending: true })

      if (streamForms && streamForms.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formIds = (streamForms as any[]).map((sf: any) => sf.form_id as string)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentFormCodes = (streamForms as any[]).map((sf: any) => sf.ircc_forms?.form_code).filter(Boolean) as string[]

        // Check if any have client-visible fields
        const clientFieldCount = await countClientVisibleFields(formIds, admin)
        if (clientFieldCount > 0) {
          useDbQuestionnaire = true
        }
      }

      // Legacy fallback: check ircc_question_set_codes on matter type
      if (currentFormCodes.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mtData } = await (admin as any)
          .from('matter_types')
          .select('ircc_question_set_codes')
          .eq('id', matterTypeId)
          .single()

        currentFormCodes = (mtData?.ircc_question_set_codes ?? []) as string[]
      }
    }

    // ── 3. Find or create session ────────────────────────────────────────────
    let session: {
      id: string
      status: string
      contact_id: string
      form_codes: string[]
      completed_at: string | null
    } | null = null

    const { data: existingSession } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id, status, contact_id, form_codes, completed_at, progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session = existingSession as any

    // Determine contact_id: from session, or fall back to matter_people
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

    // Auto-create session if none exists and forms are configured
    if (!session && contactId && currentFormCodes.length > 0) {
      const { data: newSession } = await admin
        .from('ircc_questionnaire_sessions')
        .insert({
          tenant_id: link.tenant_id,
          contact_id: contactId,
          matter_id: matterId,
          form_codes: currentFormCodes,
          status: 'in_progress',
          portal_link_id: link.id,
        })
        .select('id, status, contact_id, form_codes, completed_at')
        .single()

      if (newSession) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session = newSession as any
      }
    }

    // ── 4. Refresh stale session form_codes ───────────────────────────────────
    // If the session's form_codes don't match current config, update them.
    // Keeps session form_codes in sync with Settings → Matter Type → Forms.
    if (session && currentFormCodes.length > 0 && session.status !== 'completed') {
      const sessionCodes = session.form_codes ?? []
      const codesMatch =
        sessionCodes.length === currentFormCodes.length &&
        sessionCodes.every((c: string, i: number) => c === currentFormCodes[i])

      if (!codesMatch) {
        await admin
          .from('ircc_questionnaire_sessions')
          .update({
            form_codes: currentFormCodes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id)

        session = { ...session, form_codes: currentFormCodes }
      }
    }

    // ── 5. Fetch profile ──────────────────────────────────────────────────────
    // Only return immigration_data if this session has had explicit portal saves.
    // This prevents stale profile data from a previous matter pre-filling a new
    // matter's portal forms ("someone else's information" bug).
    // Exceptions: completed sessions always show the profile (read-only view).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionProgress = (session as any)?.progress as Record<string, unknown> | null | undefined
    const sessionHasSaves =
      session?.status === 'completed' ||
      sessionProgress?.has_portal_saves === true ||
      (sessionProgress?.forms && Object.keys(sessionProgress.forms as object).length > 0)

    let profile: Record<string, unknown> | null = null
    if (contactId && sessionHasSaves) {
      const { data: contact } = await admin
        .from('contacts')
        .select('id, immigration_data')
        .eq('id', contactId)
        .single()

      profile = (contact?.immigration_data as Record<string, unknown>) ?? null
    }

    // ── 6. Return response ────────────────────────────────────────────────────
    // ALWAYS return current form_codes from DB — never use stale session form_codes.
    // If the matter type has no forms configured, return null so the portal
    // shows "no questionnaire available" instead of wrong/stale questions.
    return NextResponse.json({
      has_ircc: !!session,
      status: session?.status ?? null,
      form_codes: currentFormCodes.length > 0 ? currentFormCodes : null,
      completed_at: session?.completed_at ?? null,
      profile,
      contact_id: contactId,
      use_db_questionnaire: useDbQuestionnaire,
      form_ids: formIds,
    })
  } catch (error) {
    console.error('[portal-ircc-questionnaire] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/portal/[token]/ircc-questionnaire ──────────────────────────────

/**
 * Save IRCC questionnaire profile data from the portal.
 *
 * Body: { profile: Record<string, unknown>, complete?: boolean }
 *
 * - Merges profile into the contact's immigration_data JSONB field
 * - If complete=true, also marks the session as completed
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
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

    const admin = createAdminClient()

    const matterId = link.matter_id

    // Parse body
    const body = await request.json()
    const { profile, complete } = body as {
      profile: Record<string, unknown>
      complete?: boolean
    }

    if (!profile || typeof profile !== 'object') {
      return NextResponse.json(
        { error: 'profile object is required' },
        { status: 400 },
      )
    }

    // Look up the session to get the contact_id
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id, contact_id, status, progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Backend lock: reject updates if session is already completed
    if (session?.status === 'completed' && !complete) {
      return NextResponse.json(
        { error: 'Questionnaire is completed and locked. Contact your lawyer to reopen.' },
        { status: 403 },
      )
    }

    // Determine contact_id
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

    if (!contactId) {
      return NextResponse.json(
        { error: 'No contact found for this matter' },
        { status: 404 },
      )
    }

    // Get existing immigration_data and deep merge
    const { data: contact } = await admin
      .from('contacts')
      .select('id, immigration_data')
      .eq('id', contactId)
      .single()

    const existing =
      (contact?.immigration_data as Record<string, unknown>) ?? {}
    const merged = deepMerge(existing, profile)

    // Update the contact's immigration_data
    const { error: updateError } = await admin
      .from('contacts')
      .update({
        immigration_data: merged as unknown as import('@/lib/types/database').Json,
      })
      .eq('id', contactId)

    if (updateError) {
      console.error(
        '[portal-ircc-questionnaire] Update contact error:',
        updateError,
      )
      return NextResponse.json(
        { error: 'Failed to save profile data' },
        { status: 500 },
      )
    }

    // Mark session as having portal saves — prevents stale contact immigration_data
    // from pre-filling this session on subsequent GET requests.
    if (session && !complete) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProgress = (session as any).progress as Record<string, unknown> | null ?? {}
      if (!existingProgress.has_portal_saves) {
        void admin
          .from('ircc_questionnaire_sessions')
          .update({
            progress: { ...existingProgress, has_portal_saves: true },
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id)
      }
    }

    // Record profile field history (fire-and-forget)
    try {
      const oldFlat = flattenObject(existing)
      const newFlat = flattenObject(merged)
      const allPaths = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])
      const historyRows: {
        tenant_id: string
        contact_id: string
        profile_path: string
        old_value: unknown
        new_value: unknown
        changed_by: string
      }[] = []
      for (const path of allPaths) {
        if (JSON.stringify(oldFlat[path]) !== JSON.stringify(newFlat[path])) {
          historyRows.push({
            tenant_id: link.tenant_id,
            contact_id: contactId,
            profile_path: path,
            old_value: oldFlat[path] ?? null,
            new_value: newFlat[path] ?? null,
            changed_by: 'portal',
          })
        }
      }
      if (historyRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (admin as any).from('profile_field_history').insert(historyRows)
      }
    } catch {
      // History is non-critical — never block the main save
    }

    // If completing, mark the session as completed
    if (complete && session) {
      const { error: sessionError } = await admin
        .from('ircc_questionnaire_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      if (sessionError) {
        console.error(
          '[portal-ircc-questionnaire] Session update error:',
          sessionError,
        )
      }

      // Log activity (fire-and-forget)
      admin
        .from('activities')
        .insert({
          tenant_id: link.tenant_id,
          matter_id: matterId,
          activity_type: 'portal_ircc_questionnaire_completed',
          title: 'Client completed IRCC questionnaire via portal',
          description:
            'Client submitted the IRCC intake questionnaire through the document portal.',
        })
        .then(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-ircc-questionnaire] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/ircc-questionnaire')
export const POST = withTiming(handlePost, 'POST /api/portal/[token]/ircc-questionnaire')
