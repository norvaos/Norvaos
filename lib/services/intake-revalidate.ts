// ============================================================================
// Universal Enforcement Engine — Shared Intake Revalidation
// Extracted from validate-intake/route.ts so that save-intake, people CRUD,
// and any future mutation that touches intake data can trigger a single
// consistent revalidation + risk-score refresh.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { validateIntake } from '@/lib/services/validation-engine'
import { calculateRisk } from '@/lib/services/risk-engine'
import type { PersonData } from '@/lib/services/validation-engine'
import { regenerateDocumentSlots } from '@/lib/services/document-slot-engine'
import { regenerateFormInstances } from '@/lib/services/form-instance-engine'
import { evaluateContradictions } from '@/lib/services/contradiction-engine'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'
import { checkAndMarkStalePacks } from '@/lib/services/stale-draft-engine'
import { getPlaybook } from '@/lib/config/immigration-playbooks'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RevalidateResult {
  success: boolean
  validation: {
    hardStops: number
    redFlags: number
    isValid: boolean
    issues: Array<{
      code: string
      message: string
      severity: string
      field: string
      scoreImpact?: number
    }>
  }
  risk: {
    score: number
    level: string
    breakdown: {
      baseScore: number
      complexityScore: number
      redFlagScore: number
      totalBeforeCap: number
    }
  }
  completionPct: number
  intakeStatus: string
}

// ─── Default (empty) result ──────────────────────────────────────────────────

function defaultResult(): RevalidateResult {
  return {
    success: false,
    validation: {
      hardStops: 0,
      redFlags: 0,
      isValid: false,
      issues: [],
    },
    risk: {
      score: 0,
      level: 'low',
      breakdown: {
        baseScore: 0,
        complexityScore: 0,
        redFlagScore: 0,
        totalBeforeCap: 0,
      },
    },
    completionPct: 0,
    intakeStatus: 'incomplete',
  }
}

// ─── Completion Percentage ───────────────────────────────────────────────────

function computeCompletionPct(intake: any, people: any[]): number {
  const sections: boolean[] = []

  // Intake-level fields
  sections.push(!!intake.processing_stream)
  sections.push(!!intake.program_category)
  sections.push(!!intake.jurisdiction)

  // PA exists
  const pa = people.find((p: any) => p.person_role === 'principal_applicant')
  sections.push(!!pa)

  if (pa) {
    // PA required fields
    sections.push(!!pa.first_name)
    sections.push(!!pa.last_name)
    sections.push(!!pa.date_of_birth)
    sections.push(!!pa.nationality)
    sections.push(!!pa.immigration_status)
    sections.push(pa.currently_in_canada !== null)
    sections.push(!!pa.country_of_residence)
    sections.push(!!pa.marital_status)
    sections.push(!!pa.email || !!pa.phone)
  }

  // All non-PA people must have first_name + last_name
  const others = people.filter((p: any) => p.person_role !== 'principal_applicant')
  for (const person of others) {
    sections.push(!!person.first_name && !!person.last_name)
  }

  const filled = sections.filter(Boolean).length
  return Math.round((filled / Math.max(sections.length, 1)) * 100)
}

// ─── Map DB rows → PersonData[] ─────────────────────────────────────────────

function mapPeopleToPersonData(people: any[]): PersonData[] {
  return people.map((p: any) => ({
    id: p.id,
    person_role: p.person_role,
    first_name: p.first_name,
    last_name: p.last_name,
    immigration_status: p.immigration_status,
    status_expiry_date: p.status_expiry_date,
    marital_status: p.marital_status,
    currently_in_canada: p.currently_in_canada,
    country_of_residence: p.country_of_residence,
    criminal_charges: p.criminal_charges ?? false,
    criminal_details: p.criminal_details,
    inadmissibility_flag: p.inadmissibility_flag ?? false,
    inadmissibility_details: p.inadmissibility_details,
    number_of_dependents: p.number_of_dependents ?? 0,
    travel_history_flag: p.travel_history_flag ?? false,
    employer_name: p.employer_name,
    work_permit_type: p.work_permit_type,
    previous_marriage: p.previous_marriage ?? false,
    relationship_to_pa: p.relationship_to_pa,
  }))
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Revalidate an intake record: run validation + risk engines, compute
 * completion percentage, determine status, and persist the results.
 *
 * Safe to call after any mutation that touches matter_intake or matter_people.
 */
export async function revalidateIntake(
  supabase: SupabaseClient<Database>,
  matterId: string
): Promise<RevalidateResult> {
  // 1. Fetch matter_intake
  const { data: intake, error: intakeErr } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (intakeErr || !intake) {
    return defaultResult()
  }

  // 2. Fetch active matter_people ordered by sort_order
  const { data: people } = await supabase
    .from('matter_people')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('sort_order')

  const peopleList = people ?? []
  const personData = mapPeopleToPersonData(peopleList)

  // 3. Run validation engine
  const validationResult = validateIntake({
    intake: {
      processing_stream: intake.processing_stream,
      program_category: intake.program_category,
      jurisdiction: intake.jurisdiction,
    },
    people: personData,
  })

  // 4. Run risk engine
  const riskResult = calculateRisk({
    intake: {
      processing_stream: intake.processing_stream,
      program_category: intake.program_category,
      jurisdiction: intake.jurisdiction,
    },
    people: personData,
    validationResult,
  })

  // 5. Compute completion percentage
  const completionPct = computeCompletionPct(intake, peopleList)

  // 6. Determine intake status
  let intakeStatus = 'incomplete'
  if (completionPct >= 100 && validationResult.isValid) {
    intakeStatus = 'validated'
  } else if (completionPct >= 100) {
    intakeStatus = 'complete'
  }

  // Never downgrade a locked intake
  if (intake.intake_status === 'locked') {
    intakeStatus = 'locked'
  }

  // 7. Persist results back to matter_intake
  const { error: updateErr } = await supabase
    .from('matter_intake')
    .update({
      intake_status: intakeStatus,
      completion_pct: completionPct,
      risk_score: riskResult.score,
      risk_level: riskResult.level,
      red_flags: validationResult.redFlags.map((rf) => ({
        code: rf.code,
        message: rf.message,
        field: rf.field,
        scoreImpact: rf.scoreImpact,
      })),
      risk_calculated_at: new Date().toISOString(),
    })
    .eq('id', intake.id)

  if (updateErr) {
    console.error('[REVALIDATE] Failed to update intake:', updateErr)
  }

  // 8. Regenerate document slots — deterministic recomputation from current Core Data
  try {
    // Fetch matter_type_id and case_type_id for slot generation scope
    const { data: matterRow } = await supabase
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    let caseTypeId: string | null = null
    if (!matterRow?.matter_type_id) {
      const { data: immRow } = await supabase
        .from('matter_immigration')
        .select('case_type_id')
        .eq('matter_id', matterId)
        .maybeSingle()
      caseTypeId = immRow?.case_type_id ?? null
    }

    if (matterRow?.matter_type_id || caseTypeId) {
      await regenerateDocumentSlots({
        supabase,
        tenantId: intake.tenant_id,
        matterId,
        matterTypeId: matterRow?.matter_type_id ?? null,
        caseTypeId,
      })

      // 8b. Regenerate form instances — same deterministic recomputation for forms
      await regenerateFormInstances({
        supabase,
        tenantId: intake.tenant_id,
        matterId,
        matterTypeId: matterRow?.matter_type_id ?? null,
        caseTypeId,
      })
    }
  } catch (err) {
    // Non-blocking — slot/form regeneration failure should not fail intake revalidation
    console.error('[REVALIDATE] Failed to regenerate document slots/form instances:', err)
  }

  // 9. Immigration sequence control (non-blocking)
  try {
    const playbook = getPlaybook(intake.program_category)
    if (playbook) {
      // 9a. Evaluate contradictions
      const { data: documentSlots } = await supabase
        .from('document_slots')
        .select('id, status, is_required, is_active, person_id, category')
        .eq('matter_id', matterId)
        .eq('is_active', true)

      // Fetch slot slugs for contradiction context
      const slotTemplateIds = (documentSlots ?? [])
        .map((s: any) => s.slot_template_id)
        .filter((id: unknown): id is string => !!id)
      let slotSlugMap: Record<string, string> = {}
      if (slotTemplateIds.length > 0) {
        const { data: templates } = await supabase
          .from('document_slot_templates')
          .select('id, slot_slug')
          .in('id', slotTemplateIds)
        if (templates) {
          slotSlugMap = Object.fromEntries(templates.map((t: any) => [t.id, t.slot_slug]))
        }
      }

      // Fetch matter_immigration for prior refusal checks
      const { data: immigration } = await supabase
        .from('matter_immigration')
        .select('prior_refusals, prior_refusal_details, has_criminal_record, criminal_record_details, spouse_included')
        .eq('matter_id', matterId)
        .maybeSingle()

      const contradictionFlags = evaluateContradictions({
        people: peopleList.map((p: any) => ({
          id: p.id,
          person_role: p.person_role,
          first_name: p.first_name,
          last_name: p.last_name,
          date_of_birth: p.date_of_birth,
          nationality: p.nationality,
          passport_number: p.passport_number,
          passport_expiry: p.passport_expiry,
          marital_status: p.marital_status,
          number_of_dependents: p.number_of_dependents ?? 0,
          criminal_charges: p.criminal_charges ?? false,
          criminal_details: p.criminal_details,
          inadmissibility_flag: p.inadmissibility_flag ?? false,
          inadmissibility_details: p.inadmissibility_details,
          immigration_status: p.immigration_status,
          status_expiry_date: p.status_expiry_date,
          is_active: p.is_active,
        })),
        immigration: immigration ?? null,
        documentSlots: (documentSlots ?? []).map((s: any) => ({
          slot_slug: slotSlugMap[s.slot_template_id ?? ''] ?? '',
          status: s.status,
          is_required: s.is_required,
          is_active: s.is_active,
          person_id: s.person_id,
          category: s.category,
        })),
        playbook,
      })

      // Persist contradiction flags
      await supabase
        .from('matter_intake')
        .update({ contradiction_flags: contradictionFlags as any })
        .eq('id', intake.id)

      // 9b. Sync immigration intake status
      await syncImmigrationIntakeStatus(supabase, matterId, null)

      // 9c. Check for stale form packs
      await checkAndMarkStalePacks(supabase, matterId, 'questionnaire_update')

      // 9d. Evaluate lawyer review triggers from readiness matrix
      if (playbook.lawyerReviewTriggers && playbook.lawyerReviewTriggers.length > 0) {
        const { evaluateLawyerReviewTriggers } = await import('@/lib/services/readiness-matrix-engine')

        const paRow = peopleList.find((p: any) => p.person_role === 'principal_applicant' && p.is_active)
        const triggerResults = evaluateLawyerReviewTriggers(
          playbook.lawyerReviewTriggers,
          paRow ?? null,
          immigration ?? null,
        )

        if (triggerResults.length > 0) {
          const currentLawyerStatus = intake.lawyer_review_status ?? 'not_required'
          if (currentLawyerStatus === 'not_required') {
            await supabase
              .from('matter_intake')
              .update({ lawyer_review_status: 'pending' })
              .eq('id', intake.id)

            await supabase.from('activities').insert({
              tenant_id: intake.tenant_id,
              matter_id: matterId,
              user_id: null,
              activity_type: 'lawyer_review_auto_triggered',
              title: 'Lawyer review automatically triggered',
              description: triggerResults.map((t) => t.message).join('; '),
            })
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking — immigration sequence control failure should not fail revalidation
    console.error('[REVALIDATE] Immigration sequence control error:', err)
  }

  // 10. Return structured result
  return {
    success: true,
    validation: {
      hardStops: validationResult.hardStops.length,
      redFlags: validationResult.redFlags.length,
      isValid: validationResult.isValid,
      issues: [...validationResult.hardStops, ...validationResult.redFlags],
    },
    risk: {
      score: riskResult.score,
      level: riskResult.level,
      breakdown: riskResult.breakdown,
    },
    completionPct,
    intakeStatus,
  }
}
