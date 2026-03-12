/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Workflow Idempotency Ledger
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Mandatory infrastructure for ALL lead automation operations. Every operation
 * that can be triggered by retries, cron, webhooks, concurrent requests, or
 * user double-submission MUST go through this protection layer.
 *
 * Pattern: Attempt INSERT into lead_workflow_executions with a deterministic
 * execution_key. If unique constraint violation (23505), the operation has
 * already been executed — return skipped. Otherwise, execute the handler.
 *
 * Prevents: duplicate milestone creation, duplicate task completion, duplicate
 * stage transitions, duplicate closure records, duplicate conversions, and
 * duplicate reminder sends.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'

// ─── Execution Types ─────────────────────────────────────────────────────────

export type ExecutionType =
  | 'stage_advance'
  | 'milestone_creation'
  | 'task_completion'
  | 'closure'
  | 'conversion'
  | 'reminder_sent'
  | 'comm_event_processed'
  | 'reopen'
  | 'auto_closure'
  | 'cadence_task_creation'

export interface IdempotentResult<T = void> {
  executed: boolean
  skipped: boolean
  data?: T
}

// ─── Core Idempotent Executor ────────────────────────────────────────────────

/**
 * Execute a handler idempotently using the workflow execution ledger.
 *
 * 1. Attempts INSERT into lead_workflow_executions with deterministic key
 * 2. If unique constraint violation → operation already executed, return skipped
 * 3. If INSERT succeeds → execute handler, return executed
 * 4. If handler fails → the ledger entry remains (operation was attempted)
 *
 * This is mandatory infrastructure, not optional.
 */
export async function executeIdempotent<T = void>(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    leadId: string
    executionType: ExecutionType
    executionKey: string
    actorUserId?: string | null
    metadata?: Record<string, unknown>
    handler: () => Promise<T>
  }
): Promise<IdempotentResult<T>> {
  const { tenantId, leadId, executionType, executionKey, actorUserId, metadata, handler } = params

  // Step 1: Attempt ledger insert
  const { error: insertError } = await supabase
    .from('lead_workflow_executions')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      execution_type: executionType,
      execution_key: executionKey,
      actor_user_id: actorUserId ?? null,
      metadata: (metadata ?? null) as Json,
    })

  // Step 2: Check for duplicate (unique constraint violation)
  if (insertError) {
    if (insertError.code === '23505') {
      // Already executed — idempotency protection fired
      return { executed: false, skipped: true }
    }
    // Unexpected error — let it propagate
    throw new Error(`Idempotency ledger insert failed: ${insertError.message}`)
  }

  // Step 3: Execute handler
  const data = await handler()
  return { executed: true, skipped: false, data }
}

// ─── Key Generation Helpers ──────────────────────────────────────────────────

/**
 * Generate deterministic execution keys for each operation type.
 * Keys must be globally unique within a tenant.
 */
export const idempotencyKeys = {
  /** Stage advance: one per lead per target stage per time bucket (prevents rapid re-advance) */
  stageAdvance: (leadId: string, toStage: string): string =>
    `stage:${leadId}:${toStage}`,

  /** Milestone group creation: one per lead per group type per stage */
  milestoneCreation: (leadId: string, groupType: string, fromStage: string): string =>
    `milestone:${leadId}:${groupType}:${fromStage}`,

  /** Task auto-completion: one per task per triggering event */
  taskCompletion: (taskId: string, triggerEventId: string): string =>
    `task_complete:${taskId}:${triggerEventId}`,

  /** Manual task completion: one per task (can only be completed once) */
  taskManualCompletion: (taskId: string): string =>
    `task_manual:${taskId}`,

  /** Lead closure: one per lead per closure attempt */
  closure: (leadId: string, closedStage: string): string =>
    `closure:${leadId}:${closedStage}`,

  /** Lead conversion to matter: one per lead (can only convert once) */
  conversion: (leadId: string): string =>
    `conversion:${leadId}`,

  /** Reminder sent: one per lead per reminder type per date */
  reminderSent: (leadId: string, reminderType: string, dateKey: string): string =>
    `reminder:${leadId}:${reminderType}:${dateKey}`,

  /** Communication event processing: one per event ID */
  commEventProcessed: (eventId: string): string =>
    `comm_processed:${eventId}`,

  /** Lead reopen: unique per closure record being reversed */
  reopen: (leadId: string, closureRecordId: string): string =>
    `reopen:${leadId}:${closureRecordId}`,

  /** Auto-closure check: one per lead per date (daily cron safety) */
  autoClosure: (leadId: string, dateKey: string): string =>
    `auto_closure:${leadId}:${dateKey}`,

  /** Cadence task creation: one per lead per cadence step */
  cadenceTask: (leadId: string, cadenceType: string, stepIndex: number): string =>
    `cadence_task:${leadId}:${cadenceType}:${stepIndex}`,
} as const

/**
 * Get today's date key for idempotency (YYYY-MM-DD in tenant timezone).
 */
export function todayDateKey(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}
