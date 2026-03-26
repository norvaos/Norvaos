/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Action-Driven Workflow  -  Core Type Definitions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every state-changing operation in the controlled workflow system is defined
 * as an ActionDefinition. The Action Executor uses these definitions to:
 *   1. Validate inputs (Zod, server-side  -  Rule #3)
 *   2. Check permissions (server-side  -  Rule #3)
 *   3. Execute the state change within a transaction (Rule #6)
 *   4. Write triple records: workflow_actions + audit_logs + activities (Rule #5)
 *   5. Trigger automations and notifications (non-blocking)
 *
 * No direct state changes outside the Action Executor. (Rule #1)
 */

import type { z, ZodType } from 'zod/v4'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Source Surfaces ────────────────────────────────────────────────────────

export type ActionSource = 'kiosk' | 'front_desk' | 'command_centre' | 'dashboard' | 'api'

// ─── Action Context ─────────────────────────────────────────────────────────

export interface ActionContext<TInput = unknown> {
  /** Validated input (already passed Zod schema) */
  input: TInput
  /** Tenant ID (always present) */
  tenantId: string
  /** User ID from users table (null for kiosk/anonymous) */
  userId: string | null
  /** Admin Supabase client  -  bypasses RLS for controlled writes */
  supabase: SupabaseClient<Database>
  /** Which surface initiated this action */
  source: ActionSource
}

// ─── Action Definition ──────────────────────────────────────────────────────

export interface ActionDefinition<TInput = unknown, TResult = unknown> {
  /** Unique action type key (e.g. 'mark_contacted', 'log_call') */
  type: string

  /** Human-readable label for audit trail */
  label: string

  /** Zod schema for server-side input validation (Rule #3, #12) */
  inputSchema: ZodType<TInput>

  /**
   * Required permission as entity:action pair.
   * Null for kiosk/public actions that use token auth instead.
   */
  permission: { entity: string; action: string } | null

  /** Which surfaces can invoke this action (Rule #1) */
  allowedSources: ActionSource[]

  /**
   * Entity type for the workflow_actions record.
   * E.g. 'lead', 'matter', 'contact', 'check_in'
   */
  entityType: string

  /**
   * Extract the entity ID from the validated input.
   * Used for workflow_actions.entity_id and activity logging.
   */
  getEntityId: (input: TInput) => string

  /**
   * Optional: Snapshot the entity's current state before execution.
   * Stored in workflow_actions.previous_state (Rule #5).
   * Returns null if snapshot is not needed.
   */
  snapshotBefore?: (ctx: ActionContext<TInput>) => Promise<Record<string, unknown> | null>

  /**
   * The core execution function.
   * Runs within the transaction boundary (Rule #6).
   * Must NOT call external services (notifications, automations) directly.
   * Return the result data + the new state snapshot.
   */
  execute: (ctx: ActionContext<TInput>) => Promise<ActionExecuteResult<TResult>>

  /**
   * Optional automation trigger type (maps to automation_rules.trigger_type).
   * If set, processAutomationTrigger() is called after commit (non-blocking).
   */
  automationTrigger?: string

  /**
   * Optional automation trigger context builder.
   * Called only if automationTrigger is set.
   */
  buildTriggerContext?: (input: TInput, result: TResult) => Record<string, unknown>

  /**
   * Optional notification event type.
   * If set, dispatchNotification() is called after commit (non-blocking).
   */
  notificationEvent?: string

  /**
   * Optional notification builder.
   * Called only if notificationEvent is set.
   */
  buildNotification?: (ctx: ActionContext<TInput>, result: TResult) => {
    recipientUserIds: string[]
    title: string
    message?: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  } | null

  /**
   * Optional: matter ID extractor for automation trigger.
   * Needed because automations are matter-scoped.
   */
  getMatterId?: (input: TInput) => string | null
}

// ─── Action Execute Result ──────────────────────────────────────────────────

export interface ActionExecuteResult<TResult = unknown> {
  /** The result data to return to the caller */
  data: TResult
  /** State snapshot after execution (Rule #5: workflow_actions.new_state) */
  newState?: Record<string, unknown> | null
  /** Activity log entry details */
  activity: {
    activityType: string
    title: string
    description?: string
    metadata?: Record<string, unknown>
    /** Matter ID for the activity (may differ from entity_id) */
    matterId?: string | null
    /** Contact ID for the activity */
    contactId?: string | null
  }
}

// ─── Action Result (returned to caller) ─────────────────────────────────────

export interface ActionResult<TResult = unknown> {
  success: boolean
  data?: TResult
  error?: string
  /** workflow_actions.id for traceability */
  actionId?: string
}

// ─── Type helper for extracting input type from an ActionDefinition ─────────

export type ActionInput<T> = T extends ActionDefinition<infer I, unknown> ? I : never
export type ActionOutput<T> = T extends ActionDefinition<unknown, infer O> ? O : never
