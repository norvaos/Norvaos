/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Closure / Reopen Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles lead closure (creates closure records, skips remaining tasks, creates
 * closure milestone groups, marks lead closed) and reopening (creates reopen
 * records, applies task strategy, preserves closure history).
 *
 * All operations are idempotent. Closure history is never deleted.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import {
  LEAD_STAGES,
  STAGE_LABELS,
  isClosedStage,
  type LeadStage,
} from '@/lib/config/lead-workflow-definitions'
import { executeIdempotent, idempotencyKeys } from './lead-idempotency'
import { advanceLeadStage } from './lead-stage-engine'
import { skipAllRemainingTasksForLead } from './lead-milestone-engine'
import { recalculateLeadSummary } from './lead-summary-recalculator'

// ─── Close Lead ──────────────────────────────────────────────────────────────

export interface CloseLeadParams {
  supabase: SupabaseClient<Database>
  leadId: string
  tenantId: string
  closedStage: LeadStage
  reasonCode: string
  reasonText?: string
  closedBy: string
}

export interface CloseLeadResult {
  success: boolean
  error?: string
  closureRecordId?: string
}

/**
 * Close a lead with a structured closure record.
 *
 * 1. Validates the target stage is a closed stage
 * 2. Creates closure record (idempotent)
 * 3. Skips all remaining milestone tasks
 * 4. Advances stage to the closed stage (with skipGuards  -  closure engine does its own validation)
 * 5. Updates lead.closure_record_id and lead.is_closed
 * 6. Logs activity
 * 7. Recalculates summary
 */
export async function closeLead(params: CloseLeadParams): Promise<CloseLeadResult> {
  const { supabase, leadId, tenantId, closedStage, reasonCode, reasonText, closedBy } = params

  // Validate closed stage
  if (!isClosedStage(closedStage)) {
    return { success: false, error: `"${closedStage}" is not a valid closure stage` }
  }

  // Idempotent closure
  const result = await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'closure',
    executionKey: idempotencyKeys.closure(leadId, closedStage),
    actorUserId: closedBy,
    handler: async () => {
      // 1. Create closure record
      const { data: closureRecord, error: closureErr } = await supabase
        .from('lead_closure_records')
        .insert({
          tenant_id: tenantId,
          lead_id: leadId,
          closed_stage: closedStage,
          reason_code: reasonCode,
          reason_text: reasonText ?? null,
          closed_by: closedBy,
        })
        .select('id')
        .single()

      if (closureErr || !closureRecord) {
        throw new Error(`Failed to create closure record: ${closureErr?.message}`)
      }

      // 2. Skip all remaining tasks
      await skipAllRemainingTasksForLead(
        supabase,
        leadId,
        tenantId,
        `Lead closed: ${STAGE_LABELS[closedStage] ?? closedStage}`
      )

      // 3. Advance stage (skipGuards because closure engine validates independently)
      await advanceLeadStage({
        supabase,
        leadId,
        tenantId,
        targetStage: closedStage,
        actorUserId: closedBy,
        actorType: 'user',
        reason: reasonText ?? reasonCode,
        skipGuards: true,
      })

      // 4. Update lead with closure record reference
      await supabase
        .from('leads')
        .update({
          closure_record_id: closureRecord.id,
          is_closed: true,
        })
        .eq('id', leadId)
        .eq('tenant_id', tenantId)

      // 5. Log closure activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'lead_closed',
        title: `Lead closed: ${STAGE_LABELS[closedStage] ?? closedStage}`,
        description: `Reason: ${reasonCode}${reasonText ? `  -  ${reasonText}` : ''}`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: closedBy,
        metadata: {
          closed_stage: closedStage,
          reason_code: reasonCode,
          reason_text: reasonText,
          closure_record_id: closureRecord.id,
        } as unknown as Json,
      })

      // 6. Recalculate summary
      await recalculateLeadSummary(supabase, leadId, tenantId)

      return closureRecord.id
    },
  })

  if (result.skipped) {
    return { success: true } // Already closed  -  idempotency
  }

  return { success: true, closureRecordId: result.data }
}

// ─── Reopen Lead ─────────────────────────────────────────────────────────────

export interface ReopenLeadParams {
  supabase: SupabaseClient<Database>
  leadId: string
  tenantId: string
  targetStage: LeadStage
  reason: string
  taskStrategy: 'restore' | 'reopen' | 'regenerate'
  reopenedBy: string
}

export interface ReopenLeadResult {
  success: boolean
  error?: string
  reopenRecordId?: string
}

/**
 * Reopen a closed lead with controlled task strategy.
 *
 * 1. Validates the lead is currently closed
 * 2. Creates reopen record (idempotent per closure being reversed)
 * 3. Applies task strategy (restore/reopen/regenerate)
 * 4. Advances stage to the target stage
 * 5. Clears closure state
 * 6. Logs activity
 * 7. Preserves all closure history
 */
export async function reopenLead(params: ReopenLeadParams): Promise<ReopenLeadResult> {
  const { supabase, leadId, tenantId, targetStage, reason, taskStrategy, reopenedBy } = params

  // Validate target is not a closed stage
  if (isClosedStage(targetStage)) {
    return { success: false, error: 'Cannot reopen to a closed stage' }
  }

  // Get current lead state
  const { data: lead } = await supabase
    .from('leads')
    .select('current_stage, is_closed, closure_record_id')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead not found' }
  if (!lead.is_closed) return { success: false, error: 'Lead is not currently closed' }

  const closureRecordId = lead.closure_record_id ?? ''
  const fromStage = lead.current_stage ?? 'unknown'

  // Idempotent per closure record
  const result = await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'reopen',
    executionKey: idempotencyKeys.reopen(leadId, closureRecordId),
    actorUserId: reopenedBy,
    handler: async () => {
      // 1. Create reopen record
      const { data: reopenRecord, error: reopenErr } = await supabase
        .from('lead_reopen_records')
        .insert({
          tenant_id: tenantId,
          lead_id: leadId,
          reopened_from_stage: fromStage,
          reopened_to_stage: targetStage,
          reopened_by: reopenedBy,
          reopen_reason: reason,
          task_reopen_strategy: taskStrategy,
          closure_record_id: closureRecordId || null,
        })
        .select('id')
        .single()

      if (reopenErr || !reopenRecord) {
        throw new Error(`Failed to create reopen record: ${reopenErr?.message}`)
      }

      // 2. Apply task strategy
      await applyTaskStrategy(supabase, leadId, tenantId, targetStage, taskStrategy, reopenedBy)

      // 3. Clear closure state and advance to target stage
      await supabase
        .from('leads')
        .update({
          is_closed: false,
          closure_record_id: null,
        })
        .eq('id', leadId)
        .eq('tenant_id', tenantId)

      // 4. Advance stage (skipGuards  -  reopen engine validates independently)
      await advanceLeadStage({
        supabase,
        leadId,
        tenantId,
        targetStage,
        actorUserId: reopenedBy,
        actorType: 'user',
        reason: `Reopened: ${reason}`,
        skipGuards: true,
      })

      // 5. Log activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'lead_reopened',
        title: `Lead reopened to "${STAGE_LABELS[targetStage] ?? targetStage}"`,
        description: `Reopened from "${STAGE_LABELS[fromStage as LeadStage] ?? fromStage}". Strategy: ${taskStrategy}. Reason: ${reason}`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: reopenedBy,
        metadata: {
          from_stage: fromStage,
          to_stage: targetStage,
          task_strategy: taskStrategy,
          reason,
          reopen_record_id: reopenRecord.id,
          closure_record_id: closureRecordId,
        } as unknown as Json,
      })

      // 6. Recalculate summary
      await recalculateLeadSummary(supabase, leadId, tenantId)

      return reopenRecord.id
    },
  })

  if (result.skipped) {
    return { success: true } // Already reopened
  }

  return { success: true, reopenRecordId: result.data }
}

// ─── Task Strategy Application ───────────────────────────────────────────────

async function applyTaskStrategy(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  targetStage: LeadStage,
  strategy: 'restore' | 'reopen' | 'regenerate',
  actorUserId: string
): Promise<void> {
  switch (strategy) {
    case 'restore':
      // Restore skipped tasks back to their previous status (not_started)
      await supabase
        .from('lead_milestone_tasks')
        .update({
          status: 'not_started',
          skip_reason: null,
          completed_at: null,
          completed_by: null,
          completion_source: null,
        })
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .eq('status', 'skipped')

      // Reopen closed milestone groups
      await supabase
        .from('lead_milestone_groups')
        .update({ status: 'in_progress', completed_at: null, completed_by: null })
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .eq('status', 'closed')
      break

    case 'reopen':
      // Only reopen tasks that were skipped during closure (not previously completed)
      await supabase
        .from('lead_milestone_tasks')
        .update({
          status: 'not_started',
          skip_reason: null,
          completed_at: null,
          completed_by: null,
          completion_source: null,
        })
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .eq('status', 'skipped')
        .like('skip_reason', 'Lead closed%')

      await supabase
        .from('lead_milestone_groups')
        .update({ status: 'in_progress', completed_at: null, completed_by: null })
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .eq('status', 'closed')
      break

    case 'regenerate':
      // Close all existing groups and let stage engine create fresh ones
      await supabase
        .from('lead_milestone_groups')
        .update({ status: 'closed', completion_source: 'system' })
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .not('status', 'eq', 'completed')

      // Note: the stage engine will create new milestone groups for the target stage
      // via createMilestoneGroupsForStage()  -  but since the idempotency key includes
      // the stage name, we need to make the key unique for regeneration.
      // The stage advance call in reopenLead() handles this.
      break
  }
}
