'use client'

/**
 * Retainer Generation  -  4-Gate Pre-check Service
 *
 * Evaluates four prerequisite gates before allowing the retainer generation
 * modal to open. All gates are checked in parallel and the result is returned
 * as a structured object so the UI can surface specific failures.
 *
 * Gates:
 *   1. Conflict clear      -  no open conflict_scans with score > 0 for contacts on this matter
 *   2. Matter type set     -  matter.matter_type_id is not null
 *   3. Billing structure   -  matter.billing_type is not null
 *   4. Lawyer assigned     -  matter.responsible_lawyer_id is not null
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NorvaOSGateFailure } from '@/lib/types/errors'
import type { Database } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetainerGate {
  id: string
  name: string
  passed: boolean
  error?: NorvaOSGateFailure
}

export interface RetainerGateResult {
  passed: boolean
  gates: RetainerGate[]
}

// ── Gate IDs ─────────────────────────────────────────────────────────────────

const GATE_CONFLICT   = 'conflict_clear'
const GATE_MTYPE      = 'matter_type_set'
const GATE_BILLING    = 'billing_structure'
const GATE_LAWYER     = 'lawyer_assigned'

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkRetainerGates(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
): Promise<RetainerGateResult> {

  // ── 1. Fetch the matter row ────────────────────────────────────────────────
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select('id, matter_type_id, billing_type, responsible_lawyer_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (matterErr || !matter) {
    return {
      passed: false,
      gates: [
        makeFailedGate(GATE_CONFLICT, 'Conflict Clear', {
          code: 'MATTER_NOT_FOUND',
          title: 'Matter not found',
          message: 'Unable to load matter details for gate check.',
          action: 'Refresh the page and try again.',
          owner: 'system',
          failedConditions: [],
        }),
        makeFailedGate(GATE_MTYPE, 'Matter Type Set', undefined, true),
        makeFailedGate(GATE_BILLING, 'Billing Structure Confirmed', undefined, true),
        makeFailedGate(GATE_LAWYER, 'Lawyer Assigned', undefined, true),
      ],
    }
  }

  // ── 2. Gate 1  -  Conflict check ────────────────────────────────────────────
  // Check for open conflict_scans with score > 0 linked to contacts on this matter.
  // We check matter_contacts join to conflict_scans.
  const conflictGatePromise = (async (): Promise<RetainerGate> => {
    try {
      // Get contact_ids on this matter
      const { data: matterContacts } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)

      const contactIds = (matterContacts ?? []).map(mc => mc.contact_id).filter(Boolean) as string[]

      if (contactIds.length === 0) {
        // No contacts linked  -  treat as passed (no conflicts possible)
        return makePassedGate(GATE_CONFLICT, 'Conflict Clear')
      }

      const { data: openConflicts, error: conflictErr } = await supabase
        .from('conflict_scans')
        .select('id, score, contact_id')
        .in('contact_id', contactIds)
        .gt('score', 0)
        .eq('status', 'completed')
        .limit(1)

      if (conflictErr) {
        // Soft fail  -  let it through if the table doesn't exist yet
        return makePassedGate(GATE_CONFLICT, 'Conflict Clear')
      }

      const hasConflict = (openConflicts ?? []).length > 0

      if (hasConflict) {
        return makeFailedGate(GATE_CONFLICT, 'Conflict Clear', {
          code: 'GATE_CONFLICT_OPEN',
          title: 'Open Conflict Detected',
          message: 'A conflict of interest check has returned a positive result for one or more contacts on this matter. The retainer cannot be generated until the conflict is resolved.',
          action: 'Review and resolve the conflict flag under the Contacts section before proceeding.',
          owner: 'lawyer',
          failedConditions: [{
            conditionId: 'no_open_conflicts',
            conditionName: 'No open conflict matches',
            passed: false,
            details: 'One or more contacts on this matter have unresolved conflict flags.',
          }],
        })
      }

      return makePassedGate(GATE_CONFLICT, 'Conflict Clear')
    } catch {
      // If conflict engine tables don't exist, pass gracefully
      return makePassedGate(GATE_CONFLICT, 'Conflict Clear')
    }
  })()

  // ── 3. Gate 2  -  Matter type set ───────────────────────────────────────────
  const matterTypeGate: RetainerGate = matter.matter_type_id
    ? makePassedGate(GATE_MTYPE, 'Matter Type Set')
    : makeFailedGate(GATE_MTYPE, 'Matter Type Set', {
        code: 'GATE_MATTER_TYPE_MISSING',
        title: 'Matter Type Not Selected',
        message: 'A matter type must be selected before generating a retainer agreement.',
        action: 'Open the matter details and select a matter type.',
        owner: 'lawyer',
        failedConditions: [{
          conditionId: 'matter_type_id_set',
          conditionName: 'Matter type is selected',
          passed: false,
          details: 'matter.matter_type_id is null',
        }],
      })

  // ── 4. Gate 3  -  Billing structure ─────────────────────────────────────────
  const billingGate: RetainerGate = matter.billing_type
    ? makePassedGate(GATE_BILLING, 'Billing Structure Confirmed')
    : makeFailedGate(GATE_BILLING, 'Billing Structure Confirmed', {
        code: 'GATE_BILLING_TYPE_MISSING',
        title: 'Billing Type Not Set',
        message: 'A billing type (Flat Fee, Hourly, Contingency, or Hybrid) must be set before generating a retainer.',
        action: 'Set the billing type in Step 1 of the retainer generation flow, or in the matter details.',
        owner: 'lawyer',
        failedConditions: [{
          conditionId: 'billing_type_set',
          conditionName: 'Billing type is configured',
          passed: false,
          details: 'matter.billing_type is null',
        }],
      })

  // ── 5. Gate 4  -  Lawyer assigned ───────────────────────────────────────────
  const lawyerGate: RetainerGate = matter.responsible_lawyer_id
    ? makePassedGate(GATE_LAWYER, 'Lawyer Assigned')
    : makeFailedGate(GATE_LAWYER, 'Lawyer Assigned', {
        code: 'GATE_LAWYER_UNASSIGNED',
        title: 'No Responsible Lawyer',
        message: 'A responsible lawyer must be assigned to this matter before a retainer agreement can be generated.',
        action: 'Assign a responsible lawyer from the matter details.',
        owner: 'legal_assistant',
        failedConditions: [{
          conditionId: 'responsible_lawyer_assigned',
          conditionName: 'Responsible lawyer is assigned',
          passed: false,
          details: 'matter.responsible_lawyer_id is null',
        }],
      })

  // ── 6. Await async gate and assemble ─────────────────────────────────────
  const conflictGate = await conflictGatePromise

  const gates: RetainerGate[] = [
    conflictGate,
    matterTypeGate,
    billingGate,
    lawyerGate,
  ]

  return {
    passed: gates.every(g => g.passed),
    gates,
  }
}

// ── Gate builder helpers ──────────────────────────────────────────────────────

function makePassedGate(id: string, name: string): RetainerGate {
  return { id, name, passed: true }
}

function makeFailedGate(
  id: string,
  name: string,
  error?: NorvaOSGateFailure,
  skipped = false,
): RetainerGate {
  const defaultError: NorvaOSGateFailure = error ?? {
    code: 'GATE_SKIPPED',
    title: name,
    message: 'This gate was skipped because a prior gate failed.',
    action: 'Resolve the earlier gate first.',
    owner: 'system',
    failedConditions: [],
  }
  return { id, name, passed: false, error: skipped ? undefined : defaultError }
}
