/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Intake Status Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * System-driven state machine for the 10 immigration intake statuses.
 * Computes the correct status from current matter data, then persists and logs.
 *
 * Status progression:
 *   not_issued → issued → client_in_progress → review_required →
 *   deficiency_outstanding ↔ review_required → intake_complete →
 *   drafting_enabled → lawyer_review → ready_for_filing → filed
 *
 * Design:
 *   - Pure computation separated from side effects
 *   - Never downgrades past 'filed'
 *   - Deficiency can regress from any pre-filed status
 *   - Called after every intake mutation (save, review, upload, etc.)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import {
  getPlaybook,
  type ImmigrationIntakeStatus,
} from '@/lib/config/immigration-playbooks'
import type { ReadinessMatrix } from '@/lib/services/readiness-matrix-engine'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatusTransition {
  previousStatus: string
  newStatus: string
  changed: boolean
  blockedReasons: string[]
}

interface StatusComputeContext {
  intake: {
    immigration_intake_status: string
    completion_pct: number
    contradiction_flags: unknown
    contradiction_override_at: string | null
    lawyer_review_status: string
    program_category: string | null
  }
  documentSlots: Array<{
    slot_slug: string
    status: string
    is_required: boolean
    is_active: boolean
    person_id?: string | null
    person_role?: string | null
  }>
  formPackVersions: Array<{
    pack_type: string
    status: string
    is_stale: boolean
  }>
  hasPortalLinkOrRequest: boolean
  hasClientActivity: boolean
  /** Pre-computed readiness matrix for filing enforcement */
  readinessMatrix?: ReadinessMatrix | null
}

interface ContradictionFlag {
  key: string
  severity: 'warning' | 'blocking'
  message: string
  detected_at?: string
}

// ── Status Computation (Pure) ────────────────────────────────────────────────

/**
 * Compute what the immigration intake status should be based on current data.
 * Pure function  -  no DB calls, no side effects.
 */
export function computeStatus(ctx: StatusComputeContext): {
  status: ImmigrationIntakeStatus
  blockedReasons: string[]
} {
  const currentStatus = ctx.intake.immigration_intake_status
  const blockedReasons: string[] = []

  // Never downgrade past 'filed'
  if (currentStatus === 'filed') {
    return { status: 'filed', blockedReasons: [] }
  }

  const playbook = getPlaybook(ctx.intake.program_category)
  if (!playbook) {
    return { status: 'not_issued' as ImmigrationIntakeStatus, blockedReasons: ['No playbook found for this matter type'] }
  }

  // Parse contradiction flags
  const contradictions = parseContradictions(ctx.intake.contradiction_flags)
  const hasBlockingContradictions = contradictions.some(
    (c) => c.severity === 'blocking'
  ) && !ctx.intake.contradiction_override_at
  const contradictionOverrideStale = hasStaleOverride(contradictions, ctx.intake.contradiction_override_at)

  // Active document slots
  const activeSlots = ctx.documentSlots.filter((s) => s.is_active)

  // Per-slug mandatory checks: for each mandatory slug, at least one active slot
  // with that slug must satisfy the condition. This handles duplicate slots
  // (e.g. a template-backed slot + an on-demand PUT slot for the same document)
  // without requiring ALL of them to be accepted.
  const mandatorySlugs = playbook.mandatoryDocumentSlugs
  const allMandatoryUploaded = mandatorySlugs.length > 0 &&
    mandatorySlugs.every((slug) =>
      activeSlots.some((s) => s.is_required && s.slot_slug === slug && s.status !== 'empty')
    )
  const allMandatoryAccepted = mandatorySlugs.length > 0 &&
    mandatorySlugs.every((slug) =>
      activeSlots.some((s) => s.is_required && s.slot_slug === slug && s.status === 'accepted')
    )
  const hasDeficientDocs = activeSlots.some(
    (s) => s.status === 'needs_re_upload' || s.status === 'rejected'
  )
  const hasPendingReview = activeSlots.some((s) => s.status === 'pending_review')

  // Check for deficiency: rejected/needs_re_upload docs or blocking contradictions
  if (hasDeficientDocs || (hasBlockingContradictions && !contradictionOverrideStale)) {
    if (currentStatus !== 'not_issued' && currentStatus !== 'issued') {
      if (hasDeficientDocs) {
        const rejected = activeSlots.filter((s) => s.status === 'rejected')
        const needsReUpload = activeSlots.filter((s) => s.status === 'needs_re_upload')
        if (rejected.length > 0) blockedReasons.push(`${rejected.length} document(s) rejected  -  awaiting re-upload`)
        if (needsReUpload.length > 0) blockedReasons.push(`${needsReUpload.length} document(s) flagged for re-upload`)
      }
      if (hasBlockingContradictions) {
        const blockingCount = contradictions.filter((c) => c.severity === 'blocking').length
        blockedReasons.push(`${blockingCount} blocking contradiction(s)  -  resolve or override in Readiness Hub`)
      }
      return { status: 'deficiency_outstanding', blockedReasons }
    }
  }

  // Step 1: not_issued → issued (portal link or document request sent)
  if (!ctx.hasPortalLinkOrRequest) {
    return { status: 'not_issued', blockedReasons: ['No document request or portal link sent'] }
  }

  // Step 2: issued → client_in_progress (client has started)
  if (!ctx.hasClientActivity) {
    return { status: 'issued', blockedReasons: ['Client has not yet uploaded documents or completed questionnaire sections'] }
  }

  // Step 3: client_in_progress → review_required
  const questionnaireReady = ctx.intake.completion_pct >= playbook.formGenerationRules.minQuestionnairePct
  if (!allMandatoryUploaded || !questionnaireReady) {
    if (!allMandatoryUploaded) blockedReasons.push('Not all mandatory documents have been uploaded')
    if (!questionnaireReady) blockedReasons.push(`Questionnaire completion is ${ctx.intake.completion_pct}% (minimum: ${playbook.formGenerationRules.minQuestionnairePct}%)`)
    return { status: 'client_in_progress', blockedReasons }
  }

  // Step 4: review_required → intake_complete
  if (!allMandatoryAccepted || hasPendingReview) {
    if (!allMandatoryAccepted) blockedReasons.push('Not all mandatory documents have been accepted')
    if (hasPendingReview) blockedReasons.push('Documents are pending staff review')
    return { status: 'review_required', blockedReasons }
  }

  // Step 5: intake_complete → drafting_enabled
  const genRules = playbook.formGenerationRules
  // Per-slug: at least one accepted slot per required slug (handles duplicate slots)
  const genRequiredDocsAccepted = genRules.requiredDocumentSlugs.every((slug) =>
    activeSlots.some((s) => s.slot_slug === slug && s.status === 'accepted')
  )
  const questionnaireMinMet = ctx.intake.completion_pct >= genRules.minQuestionnairePct
  const noContradictionBlock = !genRules.requireNoUnresolvedContradictions || !hasBlockingContradictions

  if (!genRequiredDocsAccepted || !questionnaireMinMet || !noContradictionBlock) {
    if (!genRequiredDocsAccepted) blockedReasons.push('Documents required for form generation are not yet accepted')
    if (!questionnaireMinMet) blockedReasons.push(`Questionnaire completion is ${ctx.intake.completion_pct}% (minimum: ${genRules.minQuestionnairePct}% required for drafting)`)
    if (!noContradictionBlock) blockedReasons.push('Contradictions must be resolved before drafting')
    return { status: 'intake_complete', blockedReasons }
  }

  // If no form packs required, skip drafting_enabled → straight to lawyer_review or ready
  if (playbook.formPackTypes.length === 0) {
    if (playbook.lawyerReviewRequired) {
      if (ctx.intake.lawyer_review_status === 'approved') {
        return { status: 'ready_for_filing', blockedReasons: [] }
      }
      if (ctx.intake.lawyer_review_status === 'changes_requested') {
        return { status: 'deficiency_outstanding', blockedReasons: ['Lawyer has requested changes'] }
      }
      return { status: 'lawyer_review', blockedReasons: ['Awaiting lawyer review'] }
    }
    return { status: 'ready_for_filing', blockedReasons: [] }
  }

  // Step 6: drafting_enabled → lawyer_review (all form packs generated)
  const activeFormPacks = ctx.formPackVersions.filter(
    (v) => v.status !== 'superseded' && !v.is_stale
  )
  const allPacksGenerated = playbook.formPackTypes.every((pt) =>
    activeFormPacks.some((v) => v.pack_type === pt)
  )

  if (!allPacksGenerated) {
    const missingPacks = playbook.formPackTypes.filter(
      (pt) => !activeFormPacks.some((v) => v.pack_type === pt)
    )
    // Check if any packs exist but are stale (excluded from activeFormPacks)
    const stalePacks = ctx.formPackVersions.filter(
      (v) => v.is_stale && v.status !== 'superseded'
    )
    const stalePackTypes = [...new Set(stalePacks.map((v) => v.pack_type))]
    const trulyMissing = missingPacks.filter((pt) => !stalePackTypes.includes(pt))

    if (trulyMissing.length > 0 && stalePackTypes.length > 0) {
      blockedReasons.push(`Form packs: ${trulyMissing.join(', ')} not generated; ${stalePackTypes.join(', ')} outdated`)
    } else if (trulyMissing.length > 0) {
      blockedReasons.push(`Form packs not yet generated: ${trulyMissing.join(', ')}`)
    } else if (stalePackTypes.length > 0) {
      blockedReasons.push(`Form packs outdated (need regeneration): ${stalePackTypes.join(', ')}`)
    } else {
      blockedReasons.push(`Form packs not yet generated: ${missingPacks.join(', ')}`)
    }
    return { status: 'drafting_enabled', blockedReasons }
  }

  // Step 7: lawyer_review → ready_for_filing
  if (playbook.lawyerReviewRequired) {
    if (ctx.intake.lawyer_review_status === 'approved') {
      // Check filing readiness rules
      const filingBlocks = checkFilingReadiness(playbook, ctx, activeSlots, activeFormPacks, contradictions, hasBlockingContradictions)
      if (filingBlocks.length > 0) {
        return { status: 'lawyer_review', blockedReasons: filingBlocks }
      }
      return { status: 'ready_for_filing', blockedReasons: [] }
    }
    if (ctx.intake.lawyer_review_status === 'changes_requested') {
      return { status: 'deficiency_outstanding', blockedReasons: ['Lawyer has requested changes'] }
    }
    return { status: 'lawyer_review', blockedReasons: ['Awaiting lawyer review'] }
  }

  // No lawyer review required  -  check filing readiness directly
  const filingBlocks = checkFilingReadiness(playbook, ctx, activeSlots, activeFormPacks, contradictions, hasBlockingContradictions)
  if (filingBlocks.length > 0) {
    return { status: 'drafting_enabled', blockedReasons: filingBlocks }
  }

  return { status: 'ready_for_filing', blockedReasons: [] }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseContradictions(flags: unknown): ContradictionFlag[] {
  if (!Array.isArray(flags)) return []
  return flags.filter(
    (f): f is ContradictionFlag =>
      typeof f === 'object' && f !== null && 'key' in f && 'severity' in f
  )
}

function hasStaleOverride(contradictions: ContradictionFlag[], overrideAt: string | null): boolean {
  if (!overrideAt) return false
  // If any contradiction was detected after the override, override is stale
  return contradictions.some(
    (c) => c.severity === 'blocking' && new Date(c.detected_at ?? 0) > new Date(overrideAt)
  )
}

function checkFilingReadiness(
  playbook: ReturnType<typeof getPlaybook> & object,
  ctx: StatusComputeContext,
  activeSlots: StatusComputeContext['documentSlots'],
  activeFormPacks: StatusComputeContext['formPackVersions'],
  contradictions: ContradictionFlag[],
  hasBlockingContradictions: boolean,
): string[] {
  const blocks: string[] = []
  const rules = playbook.filingReadinessRules

  if (rules.requireAllMandatoryDocsAccepted) {
    // Per-slug: satisfied if at least one accepted slot exists for each mandatory slug
    const unacceptedSlugs = playbook.mandatoryDocumentSlugs.filter((slug) =>
      !activeSlots.some((s) => s.is_required && s.slot_slug === slug && s.status === 'accepted')
    )
    if (unacceptedSlugs.length > 0) {
      blocks.push(`${unacceptedSlugs.length} mandatory document(s) not yet accepted`)
    }
  }

  if (rules.requireAllFormPacksGenerated && playbook.formPackTypes.length > 0) {
    const missing = playbook.formPackTypes.filter(
      (pt) => !activeFormPacks.some((v) => v.pack_type === pt)
    )
    if (missing.length > 0) {
      blocks.push(`Form packs missing or stale: ${missing.join(', ')}`)
    }
  }

  if (rules.requireNoActiveContradictions && hasBlockingContradictions) {
    blocks.push('Unresolved blocking contradictions')
  }

  if (rules.requireNoPendingReviews) {
    const pending = activeSlots.filter((s) => s.status === 'pending_review')
    if (pending.length > 0) {
      blocks.push(`${pending.length} document(s) still pending review`)
    }
  }

  // Check readiness matrix filing blockers + threshold
  const matrix = ctx.readinessMatrix
  if (matrix) {
    if (matrix.filingBlockers.length > 0) {
      const labels = matrix.filingBlockers.slice(0, 3).map((b) => b.label)
      blocks.push(
        `${matrix.filingBlockers.length} readiness matrix filing blocker(s): ${labels.join(', ')}${matrix.filingBlockers.length > 3 ? '…' : ''}`
      )
    }
    if (!matrix.meetsThreshold) {
      blocks.push(
        `Overall readiness is ${matrix.overallPct}%  -  minimum threshold is ${playbook.readinessThreshold ?? 85}%`
      )
    }
  }

  return blocks
}

// ── Sync (DB) ────────────────────────────────────────────────────────────────

/**
 * Compute the correct immigration intake status and persist it.
 * Logs an activity when the status changes.
 *
 * Safe to call after any mutation that touches intake data, documents,
 * questionnaire responses, or form packs.
 */
export async function syncImmigrationIntakeStatus(
  supabase: SupabaseClient<Database>,
  matterId: string,
  userId: string | null
): Promise<StatusTransition> {
  // 1. Fetch matter_intake
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (!intake) {
    return { previousStatus: 'unknown', newStatus: 'unknown', changed: false, blockedReasons: ['No intake record found'] }
  }

  // 2. Fetch document slots (including person fields for readiness matrix)
  // Also select slot_slug directly: on-demand PUT slots have slot_template_id = null,
  // so the template-lookup path gives '' for them  -  fall back to the direct column.
  const { data: slots } = await supabase
    .from('document_slots')
    .select('slot_template_id, slot_slug, status, is_required, is_active, person_id, person_role')
    .eq('matter_id', matterId)

  // Get slot slugs from templates (for template-backed slots)
  const slotTemplateIds = (slots ?? [])
    .map((s) => s.slot_template_id)
    .filter((id): id is string => !!id)

  let slotSlugs: Record<string, string> = {}
  if (slotTemplateIds.length > 0) {
    const { data: templates } = await supabase
      .from('document_slot_templates')
      .select('id, slot_slug')
      .in('id', slotTemplateIds)
    if (templates) {
      slotSlugs = Object.fromEntries(templates.map((t) => [t.id, t.slot_slug]))
    }
  }

  const documentSlots = (slots ?? []).map((s) => ({
    // Template-backed: resolve via slugMap. On-demand PUT: fall back to direct slot_slug column.
    slot_slug: slotSlugs[s.slot_template_id ?? ''] || s.slot_slug || '',
    status: s.status,
    is_required: s.is_required,
    is_active: s.is_active,
    person_id: (s.person_id ?? null) as string | null,
    person_role: (s.person_role ?? null) as string | null,
  }))

  // 3. Fetch form pack versions
  const { data: formPacks } = await supabase
    .from('form_pack_versions')
    .select('pack_type, status, is_stale')
    .eq('matter_id', matterId)

  // 4. Check if portal link or document request exists
  const { count: portalCount } = await supabase
    .from('portal_links')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', matterId)

  const { count: requestCount } = await supabase
    .from('document_requests')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', matterId)

  // 5. Check if client has any activity (uploads or questionnaire saves)
  const hasUploads = documentSlots.some((s) => s.status !== 'empty')
  const hasClientActivity = hasUploads || intake.completion_pct > 0

  // If client has activity, a portal link MUST have existed (client can't upload without one).
  // This serves as a fallback when the portal_links query returns 0 due to client/RLS differences.
  const hasPortalLinkOrRequest = (portalCount ?? 0) > 0 || (requestCount ?? 0) > 0 || hasClientActivity

  // 5b. Compute readiness matrix for filing enforcement
  let readinessMatrix: ReadinessMatrix | null = null
  const playbook = getPlaybook(intake.program_category)

  if (playbook?.questionnaireFieldRules && playbook.questionnaireFieldRules.length > 0) {
    try {
      // Fetch profile for matrix evaluation.
      // Try matter_contacts (CRM link) first, then fall back to matter_people
      // (portal/immigration link)  -  immigration matters link the client via
      // matter_people.contact_id, not necessarily matter_contacts.is_primary.
      let resolvedContactId: string | null = null

      const { data: primaryContact } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle()

      resolvedContactId = primaryContact?.contact_id ?? null

      if (!resolvedContactId) {
        const { data: clientPerson } = await supabase
          .from('matter_people')
          .select('contact_id')
          .eq('matter_id', matterId)
          .in('person_role', ['client', 'principal_applicant'])
          .not('contact_id', 'is', null)
          .limit(1)
          .maybeSingle()
        resolvedContactId = (clientPerson?.contact_id as string | null) ?? null
      }

      let profile: Record<string, unknown> | null = null
      if (resolvedContactId) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('immigration_data')
          .eq('id', resolvedContactId)
          .single()
        profile = (contact?.immigration_data as Record<string, unknown>) ?? null
      }

      const { data: matrixPeople } = await supabase
        .from('matter_people')
        .select('id, person_role, first_name, last_name, criminal_charges, inadmissibility_flag, is_active')
        .eq('matter_id', matterId)
        .eq('is_active', true)

      const { data: immRow } = await supabase
        .from('matter_immigration')
        .select('*')
        .eq('matter_id', matterId)
        .maybeSingle()

      const { computeReadinessMatrix } = await import('@/lib/services/readiness-matrix-engine')

      readinessMatrix = computeReadinessMatrix({
        playbook,
        profile,
        people: (matrixPeople ?? []).map((p) => ({
          id: p.id as string,
          person_role: p.person_role as string,
          first_name: p.first_name as string | null,
          last_name: p.last_name as string | null,
          criminal_charges: (p.criminal_charges ?? false) as boolean,
          inadmissibility_flag: (p.inadmissibility_flag ?? false) as boolean,
          is_active: p.is_active as boolean,
        })),
        documentSlots: documentSlots.map((s) => ({
          slot_slug: s.slot_slug,
          status: s.status,
          is_required: s.is_required,
          is_active: s.is_active,
          person_id: s.person_id ?? null,
          person_role: s.person_role ?? null,
        })),
        immigration: immRow ?? null,
      })
    } catch (err) {
      // Fail-closed: matrix failure must block status transition.
      // A swallowed error would let a matter reach ready_for_filing without validation.
      console.error('[status-engine] Readiness matrix computation failed for filing check:', err)
      throw err
    }
  }

  // 6. Compute new status
  const { status: newStatus, blockedReasons } = computeStatus({
    intake: {
      immigration_intake_status: intake.immigration_intake_status ?? 'not_issued',
      completion_pct: intake.completion_pct,
      contradiction_flags: intake.contradiction_flags,
      contradiction_override_at: intake.contradiction_override_at,
      lawyer_review_status: intake.lawyer_review_status ?? 'not_required',
      program_category: intake.program_category,
    },
    documentSlots,
    formPackVersions: (formPacks ?? []).map((v) => ({
      pack_type: v.pack_type,
      status: v.status,
      is_stale: v.is_stale,
    })),
    hasPortalLinkOrRequest,
    hasClientActivity,
    readinessMatrix,
  })

  const previousStatus = intake.immigration_intake_status ?? 'not_issued'
  const changed = previousStatus !== newStatus

  // 7. Persist if changed
  if (changed) {
    await supabase
      .from('matter_intake')
      .update({
        immigration_intake_status: newStatus,
        imm_status_changed_at: new Date().toISOString(),
        imm_status_changed_by: userId,
      })
      .eq('id', intake.id)

    // Log activity
    await supabase.from('activities').insert({
      tenant_id: intake.tenant_id,
      matter_id: matterId,
      user_id: userId,
      activity_type: 'immigration_status_change',
      title: `Immigration status: ${newStatus.replace(/_/g, ' ')}`,
      description: `Immigration intake status changed from "${previousStatus}" to "${newStatus}"`,
      metadata: {
        previous_status: previousStatus,
        new_status: newStatus,
        blocked_reasons: blockedReasons,
      } as unknown as Json,
    })
  }

  return { previousStatus, newStatus, changed, blockedReasons }
}
