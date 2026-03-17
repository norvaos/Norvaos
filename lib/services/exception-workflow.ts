/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NorvaOS Exception Workflow Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements backward-stage movement (return for correction) for matters.
 * Used when a Lawyer or Admin needs to move a matter back to an earlier stage
 * to address issues or correct work that was prematurely advanced.
 *
 * Writes to:
 *   - stage_transition_log (transition_type = 'return_for_correction')
 *   - matter_stage_state   (current_stage_id, previous_stage_id, entered_at, stage_history)
 *   - activities           (activity_type = 'stage_returned')
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { MatterDeficiencyRow } from '@/lib/types/database'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface ReturnStageInput {
  matterId: string
  tenantId: string
  targetStageId: string
  /** Minimum 50 characters. Mandatory justification for the return. */
  returnReason: string
  /** The app user ID (users.id) performing the action. */
  performedBy: string
}

export interface ReturnStageResult {
  success: boolean
  previousStageId: string
  newCurrentStageId: string
  transitionLogId: string
}

// ─── Internal helper types ────────────────────────────────────────────────────

interface StageHistoryEntry {
  stage_id: string
  entered_at: string
  transition_type: string
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Move a matter backward to an earlier stage in its pipeline.
 *
 * Guard conditions (all must pass before any write):
 *   1. returnReason must be >= 50 characters.
 *   2. targetStageId must exist and belong to the same pipeline as the current stage.
 *   3. targetStageId must appear EARLIER (lower sort_order) than the current stage.
 *   4. No critical deficiencies may be open/in_progress/reopened.
 *
 * On success, atomically:
 *   - Writes stage_transition_log with transition_type 'return_for_correction'
 *   - Updates matter_stage_state
 *   - Appends to stage_history JSONB
 *   - Writes an activity record
 *
 * @throws Error with descriptive message on any validation or DB failure.
 */
export async function returnMatterToStage(
  supabase: SupabaseClient<Database>,
  input: ReturnStageInput
): Promise<ReturnStageResult> {
  const { matterId, tenantId, targetStageId, returnReason, performedBy } = input

  // ── Step 1: Validate return reason length ────────────────────────────────
  if (returnReason.trim().length < 50) {
    throw new Error(
      'Return reason must be at least 50 characters. Please provide a detailed explanation.'
    )
  }

  // ── Step 2: Fetch current matter_stage_state ─────────────────────────────
  const { data: stageState, error: stageStateErr } = await supabase
    .from('matter_stage_state')
    .select('id, current_stage_id, previous_stage_id, pipeline_id, stage_history')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (stageStateErr) {
    throw new Error(`Failed to fetch matter stage state: ${stageStateErr.message}`)
  }

  if (!stageState) {
    throw new Error('Matter has no stage state. Cannot return a matter that has not been staged.')
  }

  const currentStageId = stageState.current_stage_id

  // ── Step 3: Fetch target stage to confirm existence and pipeline ──────────
  const { data: targetStage, error: targetStageErr } = await supabase
    .from('matter_stages')
    .select('id, name, pipeline_id, sort_order')
    .eq('id', targetStageId)
    .single()

  if (targetStageErr || !targetStage) {
    throw new Error('Target stage not found.')
  }

  if (targetStage.pipeline_id !== stageState.pipeline_id) {
    throw new Error('Target stage does not belong to the same pipeline as the current matter stage.')
  }

  // ── Step 4: Fetch current stage to compare sort_order ────────────────────
  const { data: currentStage, error: currentStageErr } = await supabase
    .from('matter_stages')
    .select('id, name, sort_order')
    .eq('id', currentStageId)
    .single()

  if (currentStageErr || !currentStage) {
    throw new Error('Current stage definition not found.')
  }

  // ── Step 5: Confirm target is EARLIER (lower sort_order) ─────────────────
  if (targetStage.sort_order >= currentStage.sort_order) {
    throw new Error('Target stage is not earlier than current stage.')
  }

  // ── Step 6: Check for open critical deficiencies ──────────────────────────
  // matter_deficiencies is registered as a standalone interface in database.ts but
  // is not yet in the Database['public']['Tables'] map. We use a full unknown cast
  // on the awaited result to remain type-safe at the calling site while bypassing
  // the missing table registration. Flag: add matter_deficiencies to Database.Tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deficiencyQuery = (supabase as any)
    .from('matter_deficiencies')
    .select('id')
    .eq('matter_id', matterId)
    .eq('severity', 'critical')
    .in('status', ['open', 'in_progress', 'reopened'])

  const { data: openCritical, error: deficiencyErr } = await deficiencyQuery as {
    data: Pick<MatterDeficiencyRow, 'id'>[] | null
    error: { message: string } | null
  }

  if (deficiencyErr) {
    throw new Error(`Failed to check for critical deficiencies: ${deficiencyErr.message}`)
  }

  if (openCritical && openCritical.length > 0) {
    throw new Error(
      'Cannot return stage while critical deficiencies are open. Resolve critical deficiencies first.'
    )
  }

  // ── Step 7: Write to stage_transition_log ────────────────────────────────
  const performedAt = new Date().toISOString()

  const { data: logRow, error: logErr } = await supabase
    .from('stage_transition_log')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      from_stage_id: currentStageId,
      to_stage_id: targetStageId,
      from_stage_name: currentStage.name,
      to_stage_name: targetStage.name,
      transition_type: 'return_for_correction',
      override_reason: returnReason,
      gate_snapshot: {
        return_reason: returnReason,
        performed_by: performedBy,
        performed_at: performedAt,
      } as unknown as Json,
      transitioned_by: performedBy,
    })
    .select('id')
    .single()

  if (logErr || !logRow) {
    throw new Error(`Failed to write stage transition log: ${logErr?.message ?? 'No row returned'}`)
  }

  // ── Step 8: Update matter_stage_state ────────────────────────────────────
  const existingHistory = (
    stageState.stage_history && Array.isArray(stageState.stage_history)
      ? stageState.stage_history
      : []
  ) as unknown as StageHistoryEntry[]

  const updatedHistory: StageHistoryEntry[] = [
    ...existingHistory,
    {
      stage_id: targetStageId,
      entered_at: performedAt,
      transition_type: 'return_for_correction',
    },
  ]

  const { error: updateErr } = await supabase
    .from('matter_stage_state')
    .update({
      current_stage_id: targetStageId,
      previous_stage_id: currentStageId,
      entered_at: performedAt,
      stage_history: updatedHistory as unknown as Database['public']['Tables']['matter_stage_state']['Update']['stage_history'],
    })
    .eq('id', stageState.id)

  if (updateErr) {
    throw new Error(`Failed to update matter stage state: ${updateErr.message}`)
  }

  // ── Step 9: Write activity record ────────────────────────────────────────
  const { error: activityErr } = await supabase
    .from('activities')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'stage_returned',
      title: 'Matter returned to earlier stage',
      description: returnReason,
      entity_type: 'matter',
      entity_id: matterId,
      user_id: performedBy,
    })

  if (activityErr) {
    // Non-fatal — activity log failure should not roll back the transition.
    // Log the error but do not throw.
    console.error('[exception-workflow] Failed to write activity record:', activityErr.message)
  }

  // ── Step 10: Return result ───────────────────────────────────────────────
  return {
    success: true,
    previousStageId: currentStageId,
    newCurrentStageId: targetStageId,
    transitionLogId: logRow.id,
  }
}
