import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { computePerFormProgress } from '@/lib/ircc/questionnaire-engine-db'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

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
      continue
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

/**
 * Flatten a nested profile object into dot-notation keys for answer records.
 * e.g. { personal: { family_name: 'Smith' } } → { 'personal.family_name': 'Smith' }
 */
function flattenForAnswers(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      Object.assign(result, flattenForAnswers(value as Record<string, unknown>, path))
    } else {
      result[path] = value
    }
  }
  return result
}

// ── POST /api/portal/[token]/ircc-forms/[formId]/save ───────────────────────

/**
 * Save answers for a specific form + update per-form status in session.progress.
 *
 * Body: { profile: Record<string, unknown>, complete?: boolean }
 *
 * - Deep merges profile into contacts.immigration_data
 * - Updates session.progress.forms[formId] with status + field counts
 * - If complete=true, marks this form as completed
 * - If ALL forms are now completed, auto-completes the session
 */
async function handlePost(
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

    // ── 1. Verify formId belongs to this matter's configured forms ────────
    const { data: matter } = await admin
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter?.matter_type_id) {
      return NextResponse.json({ error: 'No matter type configured' }, { status: 404 })
    }

    // Get ALL configured form IDs for this matter type (needed for all-complete check)
    const { data: streamForms } = await admin
      .from('ircc_stream_forms')
      .select('form_id')
      .eq('matter_type_id', matter.matter_type_id)
      .order('sort_order', { ascending: true })

    if (!streamForms || streamForms.length === 0) {
      return NextResponse.json({ error: 'No forms configured' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allFormIds = (streamForms as any[]).map((sf: any) => sf.form_id as string)

    // Verify this formId is in the configured list
    if (!allFormIds.includes(formId)) {
      return NextResponse.json(
        { error: 'Form not configured for this matter type' },
        { status: 404 },
      )
    }

    // ── 2. Fetch session ──────────────────────────────────────────────────
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id, contact_id, status, progress')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Backend lock: only block if per-form tracking shows ALL forms completed.
    // Legacy sessions have status='completed' but progress.forms={} (empty)  - 
    // those must be allowed through so the new per-form system can populate progress.
    if (session?.status === 'completed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const progressAny = (session.progress as any) ?? {}
      const formsData = progressAny.forms as Record<string, any> | undefined
      const hasPerFormTracking = formsData && Object.keys(formsData).length > 0
      const allPerFormCompleted = hasPerFormTracking &&
        allFormIds.every((fId) => formsData![fId]?.status === 'completed')

      if (allPerFormCompleted) {
        return NextResponse.json(
          { error: 'Questionnaire is completed and locked. Contact your lawyer to reopen.' },
          { status: 403 },
        )
      }
    }

    // ── 3. Determine contact_id ───────────────────────────────────────────
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

    // ── 4. Deep merge profile into contacts.immigration_data ──────────────
    const { data: contact } = await admin
      .from('contacts')
      .select('id, immigration_data')
      .eq('id', contactId)
      .single()

    const existing = (contact?.immigration_data as Record<string, unknown>) ?? {}
    const merged = deepMerge(existing, profile)

    const { error: updateError } = await admin
      .from('contacts')
      .update({ immigration_data: merged })
      .eq('id', contactId)

    if (updateError) {
      console.error('[portal-ircc-form-save] Update contact error:', updateError)
      return NextResponse.json({ error: 'Failed to save profile data' }, { status: 500 })
    }

    // ── 4b. Dual-write to matter_form_instances.answers (new engine) ─────
    // Finds or creates the form instance for this matter + form, then merges
    // the submitted profile fields into the instance's per-field answer map.
    // This is the PRIMARY write path for the new engine; contacts.immigration_data
    // above is kept as a transitional cache until all consumers are migrated.
    try {
      const { data: existingInstance } = await admin
        .from('matter_form_instances')
        .select('id, answers')
        .eq('matter_id', matterId)
        .eq('form_id', formId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingInstance) {
        const now = new Date().toISOString()
        const currentAnswers = (existingInstance.answers as Record<string, unknown>) ?? {}

        // Flatten the nested profile object into dot-notation answer records
        const flatProfile = flattenForAnswers(profile)
        const updatedAnswers = { ...currentAnswers }

        for (const [profilePath, value] of Object.entries(flatProfile)) {
          if (value === null || value === undefined) continue
          updatedAnswers[profilePath] = {
            value,
            source: 'client_portal',
            updated_at: now,
            stale: false,
          }
        }

        const instanceStatus = complete ? 'ready_for_review' : 'in_progress'

        await admin
          .from('matter_form_instances')
          .update({
            answers: updatedAnswers,
            status: instanceStatus,
            updated_at: now,
          })
          .eq('id', existingInstance.id)
      }
    } catch (instanceErr) {
      // Non-fatal  -  the contacts.immigration_data write already succeeded.
      // Log for debugging but don't fail the portal save.
      console.error('[portal-ircc-form-save] Instance dual-write error (non-fatal):', instanceErr)
    }

    // ── 5. Recompute per-form progress with updated profile ───────────────
    const updatedProfile = merged as Partial<IRCCProfile>
    const progressMap = await computePerFormProgress(allFormIds, updatedProfile, admin)

    // ── 6. Update session.progress with per-form status ───────────────────
    if (session) {
      const now = new Date().toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProgress = (session.progress as any) ?? {}
      const existingForms = existingProgress.forms ?? {}

      // Update THIS form's status
      const thisFormProgress = progressMap.get(formId) ?? { filled: 0, total: 0, percent: 0 }
      const existingFormData = existingForms[formId] ?? {}

      existingForms[formId] = {
        ...existingFormData,
        status: complete ? 'completed' : (thisFormProgress.filled > 0 ? 'in_progress' : 'not_started'),
        last_saved_at: now,
        ...(complete ? { completed_at: now } : {}),
        filled_fields: thisFormProgress.filled,
        total_fields: thisFormProgress.total,
      }

      // Check if ALL forms are now completed
      const allCompleted = allFormIds.every((fId) => {
        const formData = existingForms[fId]
        return formData?.status === 'completed'
      })

      const updatedProgressObj = {
        ...existingProgress,
        forms: existingForms,
      }

      // Update session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionUpdate: any = {
        progress: updatedProgressObj,
        updated_at: now,
      }

      // Auto-complete session if all forms are done
      if (allCompleted) {
        sessionUpdate.status = 'completed'
        sessionUpdate.completed_at = now
      }

      await admin
        .from('ircc_questionnaire_sessions')
        .update(sessionUpdate)
        .eq('id', session.id)

      // ── 6b. Update matter_intake.completion_pct ──────────────────────────
      // The new per-form portal system doesn't use the legacy completion_pct field,
      // but the immigration status engine reads it to gate the client_in_progress →
      // review_required transition. Derive it from per-form completion so the status
      // engine can advance the matter correctly.
      //   - All forms completed → 100%
      //   - Partial → round(completedForms / totalForms * 100)
      // Fire-and-forget: non-fatal if this fails  -  status sync below handles it.
      const newCompletionPct = allCompleted
        ? 100
        : allFormIds.length > 0
          ? Math.round((Object.values(existingForms).filter((f: any) => f?.status === 'completed').length / allFormIds.length) * 100)
          : 0

      void admin
        .from('matter_intake')
        .update({ completion_pct: newCompletionPct })
        .eq('matter_id', matterId)

      // ── 6c. Sync immigration intake status (fire-and-forget) ─────────────
      // Triggered so the status engine can advance the matter when questionnaire
      // is complete (e.g., client_in_progress → review_required → drafting_enabled).
      if (complete) {
        try {
          const { syncImmigrationIntakeStatus } = await import('@/lib/services/immigration-status-engine')
          const { createAdminClient: adminForSync } = await import('@/lib/supabase/admin')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void syncImmigrationIntakeStatus(adminForSync() as any, matterId, null).catch((err) => {
            console.error('[portal-ircc-form-save] Status sync failed (non-fatal):', err)
          })
        } catch {
          // Non-fatal  -  don't block the save response
        }
      }

      // ── 7. Log activity ─────────────────────────────────────────────────
      if (complete) {
        // Get form name for activity log
        const { data: formInfo } = await admin
          .from('ircc_forms')
          .select('form_code, form_name')
          .eq('id', formId)
          .single()

        const formLabel = formInfo
          ? `${formInfo.form_code}  -  ${formInfo.form_name}`
          : formId

        admin
          .from('activities')
          .insert({
            tenant_id: link.tenant_id,
            matter_id: matterId,
            activity_type: 'portal_ircc_form_completed',
            title: `Client completed ${formLabel} via portal`,
            description: allCompleted
              ? 'All IRCC forms have been completed through the document portal.'
              : `Client submitted ${formLabel} through the document portal.`,
          })
          .then(() => {})

        // If all forms completed, log the overall completion too
        if (allCompleted) {
          admin
            .from('activities')
            .insert({
              tenant_id: link.tenant_id,
              matter_id: matterId,
              activity_type: 'portal_ircc_questionnaire_completed',
              title: 'Client completed all IRCC forms via portal',
              description: 'All IRCC intake forms have been submitted through the document portal.',
            })
            .then(() => {})
        }
      }

      // Build response with updated per-form status + overall progress
      let totalFilled = 0
      let totalFields = 0
      let completedCount = 0

      for (const fId of allFormIds) {
        const fp = progressMap.get(fId) ?? { filled: 0, total: 0, percent: 0 }
        totalFilled += fp.filled
        totalFields += fp.total
        if (existingForms[fId]?.status === 'completed') {
          completedCount++
        }
      }

      const overallPercent = totalFields > 0
        ? Math.round((totalFilled / totalFields) * 100)
        : 0

      return NextResponse.json({
        success: true,
        form_status: existingForms[formId],
        overall: {
          total_forms: allFormIds.length,
          completed_forms: completedCount,
          overall_progress_percent: overallPercent,
          all_completed: allCompleted,
        },
        session_status: allCompleted ? 'completed' : session.status,
      })
    }

    // No session (edge case)  -  still return success for the profile save
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-ircc-form-save] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/ircc-forms/[formId]/save')
