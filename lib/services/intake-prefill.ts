/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Intake Pre-Fill Service — "Never Ask the Same Question Twice"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When a matter was created from a lead, the lead_intake_snapshot on
 * matter_intake contains all previously collected answers (front desk
 * screening, intake profile data, and form submissions).
 *
 * This service extracts those answers and returns a flat key→value map
 * that intake forms can use to pre-fill fields, skip already-answered
 * questions, or display "previously collected" badges.
 *
 * Usage:
 *   const prefill = await getIntakePrefill(supabase, matterId)
 *   // prefill.answers  → Record<string, unknown>  (question_id → answer)
 *   // prefill.metadata → { source: 'lead', leadId, snapshotDate }
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntakePrefillResult {
  /** Flat map of field_key/question_id → previously collected answer */
  answers: Record<string, unknown>
  /** Fields that were already collected and should not be re-asked */
  collectedFieldKeys: string[]
  /** Source metadata for audit trail */
  metadata: {
    source: 'lead' | 'none'
    originatingLeadId: string | null
    snapshotCreatedAt: string | null
  }
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Retrieve all previously collected intake answers for a matter.
 * Returns a flat answer map that forms can use for pre-filling.
 */
export async function getIntakePrefill(
  supabase: SupabaseClient<Database>,
  matterId: string
): Promise<IntakePrefillResult> {
  const empty: IntakePrefillResult = {
    answers: {},
    collectedFieldKeys: [],
    metadata: { source: 'none', originatingLeadId: null, snapshotCreatedAt: null },
  }

  // Fetch the lead_intake_snapshot from matter_intake
  const { data: matterIntake } = await supabase
    .from('matter_intake')
    .select('lead_intake_snapshot')
    .eq('matter_id', matterId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = (matterIntake as any)?.lead_intake_snapshot as Record<string, unknown> | null
  if (!snapshot) return empty

  const answers: Record<string, unknown> = {}

  // 1. Extract front desk screening answers
  const screening = snapshot.screening_answers as Record<string, unknown> | undefined
  if (screening && typeof screening === 'object') {
    for (const [key, value] of Object.entries(screening)) {
      if (value !== null && value !== undefined && value !== '') {
        answers[key] = value
      }
    }
  }

  // 2. Extract intake profile custom data
  const profile = snapshot.intake_profile as Record<string, unknown> | undefined
  if (profile) {
    const profileCustom = profile.custom_intake_data as Record<string, unknown> | undefined
    if (profileCustom && typeof profileCustom === 'object') {
      for (const [key, value] of Object.entries(profileCustom)) {
        if (value !== null && value !== undefined && value !== '' && !(key in answers)) {
          answers[key] = value
        }
      }
    }

    // Map well-known profile fields to standard keys
    const wellKnownMappings: Record<string, string> = {
      jurisdiction: 'jurisdiction',
      urgency_level: 'urgency_level',
      preferred_contact_method: 'preferred_contact_method',
      intake_summary: 'intake_summary',
    }

    for (const [profileKey, answerKey] of Object.entries(wellKnownMappings)) {
      const value = profile[profileKey]
      if (value !== null && value !== undefined && value !== '' && !(answerKey in answers)) {
        answers[answerKey] = value
      }
    }
  }

  // 3. Extract answers from form submissions (newest first, no overwrites)
  const submissions = snapshot.form_submissions as Array<Record<string, unknown>> | undefined
  if (Array.isArray(submissions)) {
    for (const sub of submissions) {
      const subAnswers = sub.answers as Record<string, unknown> | undefined
      if (subAnswers && typeof subAnswers === 'object') {
        for (const [key, value] of Object.entries(subAnswers)) {
          if (value !== null && value !== undefined && value !== '' && !(key in answers)) {
            answers[key] = value
          }
        }
      }
    }
  }

  return {
    answers,
    collectedFieldKeys: Object.keys(answers),
    metadata: {
      source: 'lead',
      originatingLeadId: (snapshot.originating_lead_id as string) ?? null,
      snapshotCreatedAt: (snapshot.snapshot_created_at as string) ?? null,
    },
  }
}

/**
 * Check if a specific field was already collected during the lead phase.
 * Useful for conditional field visibility in intake forms.
 */
export function isFieldAlreadyCollected(
  prefill: IntakePrefillResult,
  fieldKey: string
): boolean {
  return fieldKey in prefill.answers && prefill.answers[fieldKey] !== null
}

/**
 * Filter a list of intake questions to only those not yet answered.
 * Returns the questions that still need to be asked.
 */
export function filterUnansweredQuestions<T extends { field_key?: string; id?: string }>(
  questions: T[],
  prefill: IntakePrefillResult
): T[] {
  return questions.filter((q) => {
    const key = q.field_key || q.id
    return !key || !isFieldAlreadyCollected(prefill, key)
  })
}
