/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Readiness — TanStack Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single hook that aggregates all immigration readiness data for the hub.
 * Combines: intake status, document slots, form pack readiness,
 * contradictions, lawyer review, and next recommended action.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPlaybook, IMMIGRATION_INTAKE_STATUS_ORDER } from '@/lib/config/immigration-playbooks'
import type { ImmigrationPlaybook, ImmigrationIntakeStatus } from '@/lib/config/immigration-playbooks'
import type { ContradictionFlag } from '@/lib/services/contradiction-engine'
import { computeReadinessMatrix } from '@/lib/services/readiness-matrix-engine'
import type { ReadinessMatrix } from '@/lib/services/readiness-matrix-engine'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImmigrationReadinessData {
  /** Current immigration intake status */
  intakeStatus: ImmigrationIntakeStatus
  /** When status was last changed */
  statusChangedAt: string | null
  /** Playbook for this matter type (null if non-immigration) */
  playbook: ImmigrationPlaybook | null

  /** Questionnaire / intake completion */
  questionnaire: {
    completionPct: number
    minimumPct: number
  }

  /** Document metrics */
  documents: {
    totalSlots: number
    mandatorySlots: number
    uploaded: number
    accepted: number
    pendingReview: number
    needsReUpload: number
    rejected: number
    empty: number
  }

  /** Form pack status */
  formPacks: {
    required: string[]
    generated: string[]
    stale: string[]
    allReady: boolean
  }

  /** Contradiction flags */
  contradictions: {
    flags: ContradictionFlag[]
    blockingCount: number
    warningCount: number
    overridden: boolean
    overrideBy: string | null
    overrideAt: string | null
  }

  /** Lawyer review */
  lawyerReview: {
    status: string
    required: boolean
    reviewedBy: string | null
    reviewedAt: string | null
    notes: string | null
  }

  /** System-computed blockers preventing next status */
  blockedReasons: string[]

  /** System-recommended next action */
  nextAction: string | null

  /** Portal per-form completion status (null if no portal forms configured) */
  portalForms: {
    totalForms: number
    completedForms: number
    forms: Array<{
      form_id: string
      form_code: string
      form_name: string
      status: 'not_started' | 'in_progress' | 'completed'
      progress_percent: number
      completed_at: string | null
    }>
  } | null

  /** Readiness matrix with 6 domains (null if playbook lacks matrix rules) */
  readinessMatrix: ReadinessMatrix | null

  /** Eligibility verification gate (funnel step 1) */
  eligibility: {
    verifiedAt: string | null
    verifiedBy: string | null
    outcome: 'pass' | 'fail' | null
  }
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const readinessKeys = {
  all: ['immigration-readiness'] as const,
  detail: (matterId: string) => ['immigration-readiness', matterId] as const,
}

// ── Main Hook ────────────────────────────────────────────────────────────────

export function useImmigrationReadiness(matterId: string | null | undefined) {
  return useQuery({
    queryKey: readinessKeys.detail(matterId ?? ''),
    queryFn: async (): Promise<ImmigrationReadinessData | null> => {
      if (!matterId) return null
      const supabase = createClient()

      // Parallel fetches
      const [intakeRes, slotsRes, templateRes, formPacksRes, matterRes, peopleRes, immigrationRes] = await Promise.all([
        supabase
          .from('matter_intake')
          .select('*')
          .eq('matter_id', matterId)
          .maybeSingle(),
        supabase
          .from('document_slots')
          .select('slot_template_id, slot_slug, status, is_required, is_active, person_id, person_role')
          .eq('matter_id', matterId)
          .eq('is_active', true),
        supabase
          .from('document_slot_templates')
          .select('id, slot_slug')
          .eq('is_active', true),
        supabase
          .from('form_pack_versions')
          .select('pack_type, status, is_stale, version_number')
          .eq('matter_id', matterId),
        supabase
          .from('matters')
          .select('matter_type_id')
          .eq('id', matterId)
          .single(),
        // For readiness matrix: people + immigration
        supabase
          .from('matter_people')
          .select('id, person_role, first_name, last_name, criminal_charges, inadmissibility_flag, is_active')
          .eq('matter_id', matterId)
          .eq('is_active', true),
        supabase
          .from('matter_immigration')
          .select('*')
          .eq('matter_id', matterId)
          .maybeSingle(),
      ])

      const intake = intakeRes.data
      if (!intake) return null

      // Resolve playbook
      const playbook = getPlaybook(intake.program_category)

      // Map slot slugs
      const slugMap: Record<string, string> = {}
      if (templateRes.data) {
        for (const t of templateRes.data) {
          slugMap[t.id] = t.slot_slug
        }
      }

      const slots = (slotsRes.data ?? []).map((s) => ({
        // Prefer template-derived slug; fall back to direct slot_slug column (on-demand PUT slots)
        slug: slugMap[s.slot_template_id ?? ''] || s.slot_slug || '',
        status: s.status,
        is_required: s.is_required,
      }))

      // Document metrics
      const mandatorySlugs = playbook?.mandatoryDocumentSlugs ?? []
      const mandatorySlots = slots.filter((s) =>
        s.is_required && mandatorySlugs.includes(s.slug)
      )

      const documents = {
        totalSlots: slots.length,
        mandatorySlots: mandatorySlots.length,
        uploaded: slots.filter((s) => s.status !== 'empty').length,
        accepted: slots.filter((s) => s.status === 'accepted').length,
        pendingReview: slots.filter((s) => s.status === 'pending_review').length,
        needsReUpload: slots.filter((s) => s.status === 'needs_re_upload').length,
        rejected: slots.filter((s) => s.status === 'rejected').length,
        empty: slots.filter((s) => s.status === 'empty').length,
      }

      // Form pack status
      const formPackVersions = formPacksRes.data ?? []
      const requiredPacks = playbook?.formPackTypes ?? []
      const activePacks = formPackVersions.filter(
        (v) => v.status !== 'superseded' && !v.is_stale
      )
      const generatedPacks = [...new Set(activePacks.map((v) => v.pack_type))]
      const stalePacks = [...new Set(
        formPackVersions
          .filter((v) => v.is_stale && v.status !== 'superseded')
          .map((v) => v.pack_type)
      )]

      const formPacks = {
        required: requiredPacks,
        generated: generatedPacks,
        stale: stalePacks,
        allReady: requiredPacks.length === 0 ||
          requiredPacks.every((pt) => generatedPacks.includes(pt)),
      }

      // Contradictions
      const rawFlags = Array.isArray(intake.contradiction_flags)
        ? (intake.contradiction_flags as unknown as ContradictionFlag[])
        : []
      const contradictions = {
        flags: rawFlags,
        blockingCount: rawFlags.filter((f) => f.severity === 'blocking').length,
        warningCount: rawFlags.filter((f) => f.severity === 'warning').length,
        overridden: !!intake.contradiction_override_at,
        overrideBy: intake.contradiction_override_by,
        overrideAt: intake.contradiction_override_at,
      }

      // Readiness matrix — compute before blocked reasons so we can pass it
      let readinessMatrix: ReadinessMatrix | null = null
      if (playbook?.questionnaireFieldRules && playbook.questionnaireFieldRules.length > 0) {
        // Fetch profile data: try matter_contacts (CRM link) first,
        // then fall back to matter_people (portal/immigration link).
        // Immigration matters link their client via matter_people.contact_id;
        // matter_contacts may not have an is_primary row for these matters.
        let profile: Record<string, unknown> | null = null
        let resolvedContactId: string | null = null

        const { data: primaryContact } = await supabase
          .from('matter_contacts')
          .select('contact_id')
          .eq('matter_id', matterId)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle()

        resolvedContactId = primaryContact?.contact_id ?? null

        // Fallback: matter_people (client or principal_applicant role)
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

        if (resolvedContactId) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('immigration_data')
            .eq('id', resolvedContactId)
            .single()
          profile = (contact?.immigration_data as Record<string, unknown>) ?? null
        }

        // Build slot data with slugs for matrix evaluation.
        // Template-backed slots: resolved via slugMap (slot_template_id → slug).
        // On-demand PUT slots: slot_template_id is null, so fall back to direct slot_slug column.
        const matrixSlots = (slotsRes.data ?? []).map((s) => ({
          slot_slug: slugMap[s.slot_template_id ?? ''] || s.slot_slug || '',
          status: s.status as string,
          is_required: s.is_required as boolean,
          is_active: s.is_active as boolean,
          person_id: (s.person_id ?? null) as string | null,
          person_role: (s.person_role ?? null) as string | null,
        }))

        readinessMatrix = computeReadinessMatrix({
          playbook,
          profile,
          people: (peopleRes.data ?? []).map((p) => ({
            id: p.id as string,
            person_role: p.person_role as string,
            first_name: p.first_name as string | null,
            last_name: p.last_name as string | null,
            criminal_charges: (p.criminal_charges ?? false) as boolean,
            inadmissibility_flag: (p.inadmissibility_flag ?? false) as boolean,
            is_active: p.is_active as boolean,
          })),
          documentSlots: matrixSlots,
          immigration: immigrationRes.data ?? null,
        })
      }

      // Blocked reasons — compute with matrix awareness
      const blockedReasons = computeBlockedReasons(
        intake,
        documents,
        formPacks,
        contradictions,
        playbook ?? null,
        readinessMatrix,
      )

      // Next action — matrix-aware guidance
      const nextAction = computeNextAction(
        intake.immigration_intake_status ?? 'not_issued',
        documents,
        formPacks,
        contradictions,
        playbook ?? null,
        readinessMatrix,
      )

      // ── Portal per-form completion status ───────────────────────────────
      // Always derives from ircc_stream_forms (configured forms for this matter
      // type), overlaid with session.progress.forms for per-form status. This
      // means portalForms is non-null even before the client starts — the admin
      // sees all forms as 'not_started' rather than a blank FormPacksGate.
      let portalForms: ImmigrationReadinessData['portalForms'] = null

      if (matterRes.data?.matter_type_id) {
        // Fetch configured forms for this matter type (ordered)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: streamForms } = await (supabase as any)
          .from('ircc_stream_forms')
          .select('form_id, sort_order, ircc_forms(form_code, form_name)')
          .eq('matter_type_id', matterRes.data.matter_type_id)
          .order('sort_order', { ascending: true })

        if (streamForms && (streamForms as any[]).length > 0) {
          // Fetch session progress for per-form status overlay
          const { data: irccSession } = await supabase
            .from('ircc_questionnaire_sessions')
            .select('progress')
            .eq('matter_id', matterId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formsProgress = (irccSession?.progress as any)?.forms as Record<string, any> | undefined

          let completedCount = 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formsList = (streamForms as any[]).map((sf: any) => {
            const fId = sf.form_id as string
            const entry = formsProgress?.[fId]
            const status = (entry?.status ?? 'not_started') as 'not_started' | 'in_progress' | 'completed'
            if (status === 'completed') completedCount++

            const filled = entry?.filled_fields ?? 0
            const total = entry?.total_fields ?? 1
            const percent = total > 0 ? Math.round((filled / total) * 100) : 0

            return {
              form_id: fId,
              form_code: (sf.ircc_forms as any)?.form_code ?? fId.slice(0, 8),
              form_name: (sf.ircc_forms as any)?.form_name ?? 'Unknown Form',
              status,
              progress_percent: percent,
              completed_at: entry?.completed_at ?? null,
            }
          })

          portalForms = {
            totalForms: formsList.length,
            completedForms: completedCount,
            forms: formsList,
          }
        }
      }

      const result: ImmigrationReadinessData = {
        intakeStatus: (intake.immigration_intake_status ?? 'not_issued') as ImmigrationIntakeStatus,
        statusChangedAt: intake.imm_status_changed_at,
        playbook: playbook ?? null,
        questionnaire: {
          completionPct: intake.completion_pct,
          minimumPct: playbook?.formGenerationRules.minQuestionnairePct ?? 80,
        },
        documents,
        formPacks,
        contradictions,
        lawyerReview: {
          status: intake.lawyer_review_status ?? 'not_required',
          required: playbook?.lawyerReviewRequired ?? false,
          reviewedBy: intake.lawyer_review_by,
          reviewedAt: intake.lawyer_review_at,
          notes: intake.lawyer_review_notes,
        },
        blockedReasons,
        nextAction,
        portalForms,
        readinessMatrix,
        eligibility: {
          verifiedAt: intake.eligibility_verified_at ?? null,
          verifiedBy: intake.eligibility_verified_by ?? null,
          outcome: (intake.eligibility_outcome as 'pass' | 'fail' | null) ?? null,
        },
      }

      // ── Auto-heal: status stuck at not_issued despite portal link / activity ──
      // validate-intake rewrites completion_pct + runs the status engine.
      // We await it so the result object can be updated in the same query cycle.
      if (result.intakeStatus === 'not_issued') {
        try {
          const validateRes = await fetch(`/api/matters/${matterId}/validate-intake`, { method: 'POST' })
          if (validateRes.ok) {
            const { data: healedIntake } = await supabase
              .from('matter_intake')
              .select('immigration_intake_status, completion_pct, imm_status_changed_at')
              .eq('matter_id', matterId)
              .maybeSingle()
            if (healedIntake && healedIntake.immigration_intake_status && healedIntake.immigration_intake_status !== 'not_issued') {
              result.intakeStatus = healedIntake.immigration_intake_status as ImmigrationIntakeStatus
              result.questionnaire.completionPct = healedIntake.completion_pct
              result.statusChangedAt = healedIntake.imm_status_changed_at
            }
          }
        } catch {
          // Non-fatal: return stale result — user can click Recalculate Status to fix
        }
      }

      // ── Auto-heal: stale completion_pct / missing program_category ───────────
      // Two failure modes keep a matter stuck in an early status:
      //   1. completion_pct never written back by the per-form portal → status engine
      //      can't advance past client_in_progress.
      //   2. program_category null in matter_intake → getPlaybook() returns undefined
      //      → computeStatus always returns 'not_issued' (infinite validate-intake loop).
      //
      // Trigger: status is early (not_issued or client_in_progress) AND completion=0.
      // sync-intake-status fixes both before re-running the engine.
      if (
        (result.intakeStatus === 'not_issued' || result.intakeStatus === 'client_in_progress') &&
        result.questionnaire.completionPct === 0
      ) {
        try {
          const syncRes = await fetch(`/api/matters/${matterId}/sync-intake-status`, { method: 'POST' })
          if (syncRes.ok) {
            const syncData = await syncRes.json() as { changed: boolean; new_status: string }
            if (syncData.changed) {
              // Re-fetch intake to pick up updated status + completion_pct
              const { data: healedIntake } = await supabase
                .from('matter_intake')
                .select('immigration_intake_status, completion_pct, imm_status_changed_at')
                .eq('matter_id', matterId)
                .maybeSingle()
              if (healedIntake) {
                result.intakeStatus = (healedIntake.immigration_intake_status ?? 'client_in_progress') as ImmigrationIntakeStatus
                result.questionnaire.completionPct = healedIntake.completion_pct
                result.statusChangedAt = healedIntake.imm_status_changed_at
              }
            }
          }
        } catch {
          // Non-fatal: return stale result — user can click Recalculate Status to fix
        }
      }

      return result
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

// ── Eligibility Verification Mutation (Funnel Gate) ─────────────────────────

export function useVerifyEligibility() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      outcome: 'pass' | 'fail'
      userId: string
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('matter_intake')
        .update({
          eligibility_verified_at: now,
          eligibility_verified_by: params.userId,
          eligibility_outcome: params.outcome,
        })
        .eq('matter_id', params.matterId)

      if (error) throw error

      // Log activity
      const { data: intake } = await supabase
        .from('matter_intake')
        .select('tenant_id')
        .eq('matter_id', params.matterId)
        .single()

      if (intake) {
        await supabase.from('activities').insert({
          tenant_id: intake.tenant_id,
          matter_id: params.matterId,
          user_id: params.userId,
          activity_type: 'eligibility_verification',
          title: params.outcome === 'pass'
            ? 'Eligibility verified — passed'
            : 'Eligibility verified — failed',
          description: params.outcome === 'pass'
            ? 'Client passed eligibility verification — workspace unlocked'
            : 'Client failed eligibility verification — matter blocked',
        })
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(vars.matterId) })
      toast.success(
        vars.outcome === 'pass'
          ? 'Eligibility verified — workspace unlocked'
          : 'Eligibility failed — matter flagged',
      )
    },
    onError: (error: Error) => {
      console.error('[useVerifyEligibility] mutation failed:', error.message)
      toast.error('Failed to record eligibility verification')
    },
  })
}

// ── Lawyer Review Mutations ──────────────────────────────────────────────────

export function useSubmitLawyerReview() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      action: 'approved' | 'changes_requested'
      notes?: string
      userId: string
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('matter_intake')
        .update({
          lawyer_review_status: params.action,
          lawyer_review_by: params.userId,
          lawyer_review_at: now,
          lawyer_review_notes: params.notes ?? null,
        })
        .eq('matter_id', params.matterId)

      if (error) throw error

      // Log activity
      const { data: intake } = await supabase
        .from('matter_intake')
        .select('tenant_id')
        .eq('matter_id', params.matterId)
        .single()

      if (intake) {
        await supabase.from('activities').insert({
          tenant_id: intake.tenant_id,
          matter_id: params.matterId,
          user_id: params.userId,
          activity_type: 'lawyer_review',
          title: params.action === 'approved'
            ? 'Lawyer review approved'
            : 'Lawyer review: changes requested',
          description: params.action === 'approved'
            ? 'Lawyer review approved — matter is ready for filing'
            : 'Lawyer review requested changes',
        })
      }

      // Trigger server-side status engine to transition immigration_intake_status
      // (lawyer_review → ready_for_filing or deficiency_outstanding)
      await syncIntakeStatusWithRetry(params.matterId)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(vars.matterId) })
    },
    onError: (error: Error) => {
      console.error('[useSubmitLawyerReview] mutation failed:', error.message)
    },
  })
}

export function useOverrideContradictions() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      reason: string
      userId: string
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('matter_intake')
        .update({
          contradiction_override_by: params.userId,
          contradiction_override_at: now,
          contradiction_override_reason: params.reason,
        })
        .eq('matter_id', params.matterId)

      if (error) throw error

      const { data: intake } = await supabase
        .from('matter_intake')
        .select('tenant_id')
        .eq('matter_id', params.matterId)
        .single()

      if (intake) {
        await supabase.from('activities').insert({
          tenant_id: intake.tenant_id,
          matter_id: params.matterId,
          user_id: params.userId,
          activity_type: 'contradiction_override',
          title: 'Contradictions overridden',
          description: `Contradictions overridden: ${params.reason}`,
        })
      }

      // Trigger server-side status engine to re-evaluate intake status
      await syncIntakeStatusWithRetry(params.matterId)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(vars.matterId) })
    },
    onError: (error: Error) => {
      console.error('[useOverrideContradictions] mutation failed:', error.message)
    },
  })
}

/**
 * Trigger the server-side status engine with retry logic.
 *
 * Retries up to 3 times with exponential backoff (200ms, 800ms, 3200ms).
 * On final failure, logs error but does NOT throw — the primary mutation
 * (lawyer review / contradiction override) has already succeeded. The
 * status will self-correct on the next page load or readiness cache refresh.
 */
async function syncIntakeStatusWithRetry(matterId: string, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`/api/matters/${matterId}/validate-intake`, { method: 'POST' })
      if (res.ok) return // Success — done
      // Non-OK response: retry if attempts remain
      if (attempt === maxRetries) {
        console.error(`[syncIntakeStatus] Failed after ${maxRetries} attempts for matter ${matterId} (status ${res.status})`)
      }
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[syncIntakeStatus] Network error after ${maxRetries} attempts for matter ${matterId}:`, err)
      }
    }
    // Exponential backoff: 200ms, 800ms, 3200ms
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(4, attempt - 1)))
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeBlockedReasons(
  intake: { immigration_intake_status: string | null; completion_pct: number },
  docs: ImmigrationReadinessData['documents'],
  packs: ImmigrationReadinessData['formPacks'],
  contradictions: ImmigrationReadinessData['contradictions'],
  playbook: ImmigrationPlaybook | null,
  matrix: ReadinessMatrix | null,
): string[] {
  const reasons: string[] = []
  if (!playbook) return reasons

  const status = intake.immigration_intake_status ?? 'not_issued'

  if (status === 'client_in_progress') {
    if (docs.empty > 0) {
      // Use specific names from matrix when available, otherwise fall back to count
      const docBlockers = matrix?.allBlockers.filter((b) => b.type === 'document') ?? []
      if (docBlockers.length > 0) {
        reasons.push(`${docBlockers.length} document(s) not yet uploaded:`)
        for (const b of docBlockers.slice(0, 5)) {
          reasons.push(`  → ${b.label}${b.person_name ? ` (${b.person_name})` : ''}`)
        }
        if (docBlockers.length > 5) {
          reasons.push(`  → …and ${docBlockers.length - 5} more`)
        }
      } else {
        reasons.push(`${docs.empty} document(s) not yet uploaded`)
      }
    }
    if (intake.completion_pct < playbook.formGenerationRules.minQuestionnairePct) {
      reasons.push(`Questionnaire at ${intake.completion_pct}% (need ${playbook.formGenerationRules.minQuestionnairePct}%)`)
    }
  }

  if (status === 'review_required') {
    if (docs.pendingReview > 0) reasons.push(`${docs.pendingReview} document(s) pending review`)
    const unacceptedMandatory = docs.mandatorySlots - docs.accepted
    if (unacceptedMandatory > 0) {
      const docBlockers = matrix?.allBlockers.filter((b) => b.type === 'document') ?? []
      if (docBlockers.length > 0) {
        reasons.push(`${docBlockers.length} mandatory document(s) not yet accepted:`)
        for (const b of docBlockers.slice(0, 5)) {
          reasons.push(`  → ${b.label}${b.person_name ? ` (${b.person_name})` : ''}`)
        }
        if (docBlockers.length > 5) {
          reasons.push(`  → …and ${docBlockers.length - 5} more`)
        }
      } else {
        reasons.push(`${unacceptedMandatory} mandatory document(s) not yet accepted`)
      }
    }
  }

  if (status === 'deficiency_outstanding') {
    if (docs.needsReUpload > 0) reasons.push(`${docs.needsReUpload} document(s) flagged for re-upload`)
    if (docs.rejected > 0) reasons.push(`${docs.rejected} document(s) rejected`)
    if (contradictions.blockingCount > 0 && !contradictions.overridden) {
      reasons.push(`${contradictions.blockingCount} blocking contradiction(s) — resolve or override`)
    }
    // Surface specific document names from matrix
    if (matrix && (docs.needsReUpload > 0 || docs.rejected > 0)) {
      const docBlockers = matrix.allBlockers.filter((b) => b.type === 'document')
      if (docBlockers.length > 0) {
        for (const b of docBlockers.slice(0, 5)) {
          reasons.push(`  → ${b.label}${b.person_name ? ` (${b.person_name})` : ''}`)
        }
        if (docBlockers.length > 5) {
          reasons.push(`  → …and ${docBlockers.length - 5} more`)
        }
      }
    }
  }

  if (status === 'intake_complete') {
    // Matter has cleared review but is blocked from drafting
    if (intake.completion_pct < (playbook.formGenerationRules.minQuestionnairePct ?? 80)) {
      reasons.push(`Questionnaire at ${intake.completion_pct}% — need ${playbook.formGenerationRules.minQuestionnairePct ?? 80}% to enable drafting`)
    }
    // Check if required generation docs are accepted
    const genSlugs = playbook.formGenerationRules.requiredDocumentSlugs ?? []
    if (genSlugs.length > 0) {
      reasons.push('Required documents for form generation must all be accepted')
    }
  }

  if (status === 'drafting_enabled') {
    const missingPacks = packs.required.filter((pt) => !packs.generated.includes(pt))
    if (missingPacks.length > 0) reasons.push(`Generate form packs: ${missingPacks.join(', ')}`)
    if (packs.stale.length > 0) reasons.push(`Outdated form packs: ${packs.stale.join(', ')}`)
  }

  // Matrix-derived blockers — specific items with person names
  if (matrix) {
    if (status === 'drafting_enabled' && matrix.draftingBlockers.length > 0) {
      for (const b of matrix.draftingBlockers.slice(0, 5)) {
        reasons.push(`Drafting blocked: ${b.label}${b.person_name ? ` (${b.person_name})` : ''}`)
      }
      if (matrix.draftingBlockers.length > 5) {
        reasons.push(`…and ${matrix.draftingBlockers.length - 5} more drafting blocker(s)`)
      }
    }
    if (['lawyer_review', 'ready_for_filing'].includes(status) && matrix.filingBlockers.length > 0) {
      for (const b of matrix.filingBlockers.slice(0, 5)) {
        reasons.push(`Filing blocked: ${b.label}${b.person_name ? ` (${b.person_name})` : ''}`)
      }
      if (matrix.filingBlockers.length > 5) {
        reasons.push(`…and ${matrix.filingBlockers.length - 5} more filing blocker(s)`)
      }
    }
    if (!matrix.meetsThreshold) {
      reasons.push(`Overall readiness at ${matrix.overallPct}% (need ${playbook.readinessThreshold ?? 85}%)`)
    }
  }

  return reasons
}

function computeNextAction(
  status: string,
  docs: ImmigrationReadinessData['documents'],
  packs: ImmigrationReadinessData['formPacks'],
  contradictions: ImmigrationReadinessData['contradictions'],
  playbook: ImmigrationPlaybook | null,
  matrix: ReadinessMatrix | null,
): string | null {
  if (!playbook) return null

  switch (status) {
    case 'not_issued':
      return 'Send document request to client to open intake portal'
    case 'issued':
      return 'Follow up with client — intake has not been started yet'
    case 'client_in_progress': {
      const missingQCount = matrix?.allBlockers.filter((b) => b.type === 'question').length ?? 0
      const missingDCount = matrix?.allBlockers.filter((b) => b.type === 'document').length ?? 0
      const parts: string[] = []
      if (missingQCount > 0) parts.push(`${missingQCount} questionnaire field${missingQCount > 1 ? 's' : ''}`)
      if (missingDCount > 0) parts.push(`${missingDCount} document${missingDCount > 1 ? 's' : ''}`)
      return parts.length > 0
        ? `Client intake in progress — still needs ${parts.join(' and ')}`
        : 'Client intake in progress — follow up if no recent activity'
    }
    case 'review_required':
      if (docs.pendingReview > 0) return `Accept or reject ${docs.pendingReview} pending document${docs.pendingReview > 1 ? 's' : ''}`
      return 'Accept remaining mandatory documents to advance intake'
    case 'deficiency_outstanding':
      if (contradictions.blockingCount > 0) return 'Resolve blocking contradictions or override with business reason'
      return 'Request client to re-upload deficient documents'
    case 'intake_complete':
      return 'All mandatory documents accepted — drafting will auto-enable when readiness threshold is met'
    case 'drafting_enabled': {
      // Matrix-aware: surface specific blockers first
      if (matrix && matrix.draftingBlockers.length > 0) {
        const first = matrix.draftingBlockers[0]
        const more = matrix.draftingBlockers.length > 1 ? ` (+${matrix.draftingBlockers.length - 1} more)` : ''
        return `Resolve drafting blocker: ${first.label}${first.person_name ? ` (${first.person_name})` : ''}${more}`
      }
      if (matrix && !matrix.meetsThreshold) {
        // Find weakest domain to guide action
        const weakest = Object.values(matrix.domains)
          .filter((d) => d.totalRules > 0)
          .sort((a, b) => a.completionPct - b.completionPct)[0]
        if (weakest) {
          const weakestMissing = weakest.blockers.length
          return `Increase readiness to ${playbook.readinessThreshold ?? 85}% (currently ${matrix.overallPct}%) — start with ${weakest.label} (${weakestMissing} item${weakestMissing !== 1 ? 's' : ''} missing)`
        }
        return `Increase readiness to ${playbook.readinessThreshold ?? 85}% (currently ${matrix.overallPct}%)`
      }
      const missingPacks = packs.required.filter((pt) => !packs.generated.includes(pt))
      if (missingPacks.length > 0) return `Generate immigration form pack${missingPacks.length > 1 ? 's' : ''}: ${missingPacks.join(', ')}`
      if (packs.stale.length > 0) return `Regenerate outdated form pack${packs.stale.length > 1 ? 's' : ''}: ${packs.stale.join(', ')}`
      return 'All form packs generated — route to lawyer for review'
    }
    case 'lawyer_review': {
      if (matrix && matrix.filingBlockers.length > 0) {
        const first = matrix.filingBlockers[0]
        return `Resolve filing blocker before approval: ${first.label}${first.person_name ? ` (${first.person_name})` : ''}`
      }
      return 'Lawyer review required — approve or request changes'
    }
    case 'ready_for_filing':
      return 'All checks passed — file the application with IRCC'
    case 'filed':
      return null
    default:
      return null
  }
}

// ── Sync Intake Status Mutation ──────────────────────────────────────────────

/**
 * Manually triggers a full immigration intake status re-computation.
 * Recalculates completion_pct from portal session progress before syncing,
 * so matters completed via the new per-form portal system are handled correctly.
 */
export function useSyncIntakeStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (matterId: string) => {
      const res = await fetch(`/api/matters/${matterId}/sync-intake-status`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Status sync failed')
      }
      return res.json() as Promise<{
        success: boolean
        previous_status: string
        new_status: string
        changed: boolean
        blocked_reasons: string[]
      }>
    },
    onSuccess: (data, matterId) => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(matterId) })
      if (data.changed) {
        toast.success(`Status advanced to: ${data.new_status.replace(/_/g, ' ')}`)
      } else if (data.blocked_reasons?.length > 0) {
        toast.warning(`Status unchanged (${data.new_status.replace(/_/g, ' ')}): ${data.blocked_reasons[0]}`)
      } else {
        toast.info(`Status is current: ${data.new_status.replace(/_/g, ' ')}`)
      }
    },
  })
}
