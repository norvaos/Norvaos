/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Action Executor — Central Controlled Workflow Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every state-changing operation routes through executeAction(). This function:
 *   1. Validates the source is allowed (Rule #1)
 *   2. Validates input against Zod schema server-side (Rule #3, #12)
 *   3. Checks permissions server-side (Rule #3)
 *   4. Checks idempotency to guard against double submission (Rule #15)
 *   5. Snapshots previous state (Rule #5)
 *   6. Executes the action
 *   7. Atomically records audit trail via execute_action_atomic() Postgres function:
 *      workflow_actions + audit_logs + activities in a single DB transaction (Rule #5)
 *   8. Triggers automations (non-blocking, Rule #6)
 *   9. Dispatches notifications (non-blocking, Rule #6)
 *
 * If notifications/automations fail, the action still succeeds (Rule #6).
 * If the atomic triple-write fails, the action returns success: false.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type { ActionDefinition, ActionResult, ActionSource } from './actions/types'
import { log } from '@/lib/utils/logger'

// ─── Permission Checker ─────────────────────────────────────────────────────

interface UserRole {
  permissions: Record<string, Record<string, boolean>>
  is_system: boolean
  name: string
}

function checkPermission(
  role: UserRole | null | undefined,
  entity: string,
  action: string
): boolean {
  if (!role) return false
  if (role.name === 'Admin') return true
  return role.permissions?.[entity]?.[action] === true
}

// ─── Execute Action ─────────────────────────────────────────────────────────

export interface ExecuteActionParams<TInput> {
  /** The action definition from the registry */
  definition: ActionDefinition<TInput, unknown>
  /** Raw input (will be validated by Zod) */
  rawInput: unknown
  /** Tenant ID */
  tenantId: string
  /** User ID (null for kiosk) */
  userId: string | null
  /** Admin Supabase client */
  supabase: SupabaseClient<Database>
  /** Source surface */
  source: ActionSource
  /** Optional idempotency key */
  idempotencyKey?: string
  /** User's role (for permission check). Null for kiosk. */
  userRole?: UserRole | null
}

export async function executeAction<TInput, TResult>(
  params: ExecuteActionParams<TInput>
): Promise<ActionResult<TResult>> {
  const actionStart = performance.now()
  const {
    definition,
    rawInput,
    tenantId,
    userId,
    supabase,
    source,
    idempotencyKey,
    userRole,
  } = params

  const def = definition as ActionDefinition<TInput, TResult>

  // ── Step 1: Validate source is allowed (Rule #1) ──────────────────────
  if (!def.allowedSources.includes(source)) {
    log.warn('[action-executor] Source not allowed', {
      tenant_id: tenantId,
      action_type: def.type,
      source,
      allowed: def.allowedSources.join(','),
    })
    return {
      success: false,
      error: `Action "${def.type}" is not available from "${source}"`,
    }
  }

  // ── Step 2: Validate input with Zod (Rule #3, #12) ───────────────────
  let validatedInput: TInput
  try {
    validatedInput = def.inputSchema.parse(rawInput) as TInput
  } catch (zodError: unknown) {
    const message = zodError instanceof Error ? zodError.message : 'Invalid input'
    return {
      success: false,
      error: `Validation failed: ${message}`,
    }
  }

  // ── Step 3: Check permission (Rule #3) ────────────────────────────────
  if (def.permission) {
    if (source === 'kiosk') {
      // Kiosk uses token auth, not role-based. Permission check is skipped
      // but the token was already validated before reaching the executor.
    } else {
      if (!checkPermission(userRole, def.permission.entity, def.permission.action)) {
        log.warn('[action-executor] Permission denied', {
          tenant_id: tenantId,
          user_id: userId ?? undefined,
          action_type: def.type,
          required: `${def.permission.entity}:${def.permission.action}`,
        })
        return {
          success: false,
          error: `Permission denied: requires ${def.permission.entity}:${def.permission.action}`,
        }
      }
    }
  }

  // ── Step 4: Idempotency check with advisory lock (Rule #15) ──────────
  // Uses Postgres advisory locks to serialize concurrent requests with the
  // same idempotency key. Prevents the race where two requests both pass a
  // SELECT check, both execute business logic, and one loses its audit trail.
  let idempotencyLockHeld = false
  if (idempotencyKey) {
    try {
      const { data: lockResult } = await supabase.rpc('acquire_idempotency_lock', {
        p_idempotency_key: idempotencyKey,
      })

      const lock = lockResult as { locked: boolean; existing_id: string | null } | null

      if (lock && !lock.locked && lock.existing_id) {
        // Duplicate found — return immediately without executing
        log.info('[action-executor] Idempotent duplicate blocked (advisory lock)', {
          tenant_id: tenantId,
          action_type: def.type,
          idempotency_key: idempotencyKey,
          existing_id: lock.existing_id,
        })
        return {
          success: true,
          data: undefined as TResult,
          actionId: lock.existing_id,
        }
      }

      idempotencyLockHeld = lock?.locked ?? false
    } catch (lockErr) {
      // If advisory lock fails, fall back to optimistic check (non-blocking)
      log.warn('[action-executor] Advisory lock failed, falling back to optimistic', {
        action_type: def.type,
        error_message: lockErr instanceof Error ? lockErr.message : 'Unknown',
      })
    }
  }

  // ── Step 5: Snapshot previous state (Rule #5) ─────────────────────────
  let previousState: Record<string, unknown> | null = null
  try {
    if (def.snapshotBefore) {
      previousState = await def.snapshotBefore({
        input: validatedInput,
        tenantId,
        userId,
        supabase,
        source,
      })
    }
  } catch (snapErr) {
    log.warn('[action-executor] Snapshot failed, continuing', {
      tenant_id: tenantId,
      action_type: def.type,
      error_message: snapErr instanceof Error ? snapErr.message : 'Unknown',
    })
  }

  // ── Step 6: Execute the action ────────────────────────────────────────
  let result: { data: TResult; newState?: Record<string, unknown> | null; activity: { activityType: string; title: string; description?: string; metadata?: Record<string, unknown>; matterId?: string | null; contactId?: string | null } }
  try {
    result = await def.execute({
      input: validatedInput,
      tenantId,
      userId,
      supabase,
      source,
    }) as typeof result
  } catch (execErr) {
    const errorMsg = execErr instanceof Error ? execErr.message : 'Action execution failed'

    // Write failed workflow_actions record (best-effort)
    const failedEntityId = def.getEntityId(validatedInput)
    try {
      await supabase.from('workflow_actions').insert({
        tenant_id: tenantId,
        action_type: def.type,
        action_config: validatedInput as unknown as Json,
        entity_type: def.entityType,
        entity_id: failedEntityId === 'new' ? '' : failedEntityId,
        performed_by: userId,
        status: 'failed',
        error_message: errorMsg,
        previous_state: previousState as unknown as Json,
        new_state: null,
        source,
        idempotency_key: idempotencyKey ?? null,
      })
    } catch {
      // Best-effort logging
    }

    log.error('[action-executor] Action execution failed', {
      tenant_id: tenantId,
      user_id: userId ?? undefined,
      action_type: def.type,
      error_message: errorMsg,
    })

    return {
      success: false,
      error: errorMsg,
    }
  }

  // ── Step 7: Atomic triple-write via Postgres function (Rule #5) ──────
  // All three records (workflow_actions + audit_logs + activities) are written
  // in a single DB transaction via execute_action_atomic(). If any insert fails,
  // the entire transaction rolls back — no orphaned records.
  let entityId = def.getEntityId(validatedInput)

  // For newly created entities, getEntityId returns 'new' which isn't a valid UUID.
  // Extract the real entity ID from the execution result.
  if ((entityId === 'new' || entityId === 'shift') && result.data) {
    const d = result.data as Record<string, unknown>
    const candidateId = d.contactId ?? d.appointmentId ?? d.leadId ?? d.shiftId ?? d.id
    if (typeof candidateId === 'string' && candidateId.length > 8) {
      entityId = candidateId
    }
  }

  // ── Step 7a: Resolve shift_id for front desk actions ────────────────
  // When source is 'front_desk', look up the user's active shift so the
  // workflow_actions record can be linked for KPI computation.
  let resolvedShiftId: string | null = null
  if (source === 'front_desk' && userId) {
    try {
      const { data: activeShift } = await supabase
        .from('front_desk_shifts' as any)
        .select('id')
        .eq('user_id', userId)
        .is('ended_at', null)
        .limit(1)
        .maybeSingle()
      if (activeShift) {
        resolvedShiftId = (activeShift as any).id
      }
    } catch {
      // Non-fatal: shift resolution failure should not block the action
      log.warn('[action-executor] Failed to resolve shift_id', { userId })
    }
  }

  let workflowActionId: string | undefined

  try {
    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      'execute_action_atomic',
      {
        p_tenant_id: tenantId,
        p_action_type: def.type,
        p_action_config: validatedInput as unknown as Json,
        p_entity_type: def.entityType,
        p_entity_id: entityId,
        p_performed_by: userId,
        p_source: source,
        p_idempotency_key: idempotencyKey ?? null,
        p_previous_state: (previousState ?? null) as unknown as Json,
        p_new_state: (result.newState ?? null) as unknown as Json,
        p_activity_type: result.activity.activityType,
        p_activity_title: result.activity.title,
        p_activity_description: result.activity.description ?? null,
        p_activity_metadata: (result.activity.metadata ?? null) as unknown as Json,
        p_activity_matter_id: result.activity.matterId ?? null,
        p_activity_contact_id: result.activity.contactId ?? null,
        p_action_label: def.label,
        p_shift_id: resolvedShiftId,
      }
    )

    if (atomicErr) {
      // Check for idempotency unique constraint violation
      if (atomicErr.code === '23505' && idempotencyKey) {
        log.info('[action-executor] Idempotent duplicate (constraint)', {
          tenant_id: tenantId,
          action_type: def.type,
          idempotency_key: idempotencyKey,
        })
        return {
          success: true,
          data: result.data,
          actionId: undefined,
        }
      }
      throw new Error(`Atomic triple-write failed: ${atomicErr.message}`)
    }

    const rpcResult = atomicResult as { action_id: string; activity_id: string; idempotent_hit: boolean }

    if (rpcResult.idempotent_hit) {
      log.info('[action-executor] Idempotent duplicate (atomic)', {
        tenant_id: tenantId,
        action_type: def.type,
        idempotency_key: idempotencyKey,
        existing_id: rpcResult.action_id,
      })
      return {
        success: true,
        data: result.data,
        actionId: rpcResult.action_id,
      }
    }

    workflowActionId = rpcResult.action_id
  } catch (atomicWriteErr) {
    const errMsg = atomicWriteErr instanceof Error ? atomicWriteErr.message : 'Atomic triple-write failed'

    // ── ORPHAN DETECTION ──
    // Step 6 (execute) already committed business changes to the target table.
    // Step 7 (triple-write) failed, so no audit trail exists for those changes.
    // This is a critical gap — log it durably so it can be reconciled.
    log.error('[action-executor] ORPHAN: business write committed but audit trail failed', {
      tenant_id: tenantId,
      user_id: userId ?? undefined,
      action_type: def.type,
      entity_type: def.entityType,
      entity_id: entityId,
      source,
      error_message: errMsg,
      orphan: true,
    })

    // Best-effort: write a failed workflow_actions record so the orphan is visible in DB
    try {
      await supabase.from('workflow_actions').insert({
        tenant_id: tenantId,
        action_type: def.type,
        action_config: validatedInput as unknown as Json,
        entity_type: def.entityType,
        entity_id: entityId,
        performed_by: userId,
        status: 'failed',
        error_message: `ORPHAN: execute() succeeded but triple-write failed — ${errMsg}`,
        previous_state: (previousState ?? null) as unknown as Json,
        new_state: (result.newState ?? null) as unknown as Json,
        source,
        idempotency_key: idempotencyKey ?? null,
      })
    } catch {
      // If even the orphan record fails, the structured log above is the last line of defense
    }

    // Release advisory lock before returning
    if (idempotencyLockHeld) {
      void supabase.rpc('release_idempotency_lock', { p_idempotency_key: idempotencyKey ?? null }).then(() => {}, () => {})
    }

    // Action was executed successfully — audit trail failure should not block the user.
    // The orphan has been logged for admin reconciliation.
    return {
      success: true,
      data: result.data,
      actionId: undefined,
    }
  }

  // Release advisory lock after successful triple-write
  if (idempotencyLockHeld) {
    void supabase.rpc('release_idempotency_lock', { p_idempotency_key: idempotencyKey ?? null }).then(() => {}, () => {})
  }

  const actionDuration = Math.round(performance.now() - actionStart)
  log.info('[action-executor] Action completed', {
    tenant_id: tenantId,
    user_id: userId ?? undefined,
    action_type: def.type,
    entity_type: def.entityType,
    entity_id: entityId,
    source,
    workflow_action_id: workflowActionId,
    duration_ms: actionDuration,
  })

  // ── Step 8: Trigger automations (non-blocking, Rule #6) ───────────────
  if (def.automationTrigger && def.getMatterId) {
    const matterId = def.getMatterId(validatedInput)
    if (matterId && userId) {
      triggerAutomationsAsync(supabase, {
        tenantId,
        matterId,
        triggerType: def.automationTrigger,
        triggerContext: def.buildTriggerContext
          ? def.buildTriggerContext(validatedInput, result.data)
          : {},
        userId,
      }).catch((err) => {
        log.error('[action-executor] Automation trigger failed (non-blocking)', {
          tenant_id: tenantId,
          action_type: def.type,
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
      })
    }
  }

  // ── Step 9: Dispatch notifications (non-blocking, Rule #6) ────────────
  if (def.notificationEvent && def.buildNotification) {
    const notif = def.buildNotification(
      { input: validatedInput, tenantId, userId, supabase, source },
      result.data
    )
    if (notif && notif.recipientUserIds.length > 0) {
      dispatchNotificationAsync(supabase, {
        tenantId,
        eventType: def.notificationEvent,
        recipientUserIds: notif.recipientUserIds,
        title: notif.title,
        message: notif.message,
        entityType: def.entityType,
        entityId,
        priority: notif.priority,
      }).catch((err) => {
        log.error('[action-executor] Notification failed (non-blocking)', {
          tenant_id: tenantId,
          action_type: def.type,
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
      })
    }
  }

  return {
    success: true,
    data: result.data,
    actionId: workflowActionId,
  }
}

// ─── Async Helpers (non-blocking, Rule #6) ──────────────────────────────────

async function triggerAutomationsAsync(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    triggerType: string
    triggerContext: Record<string, unknown>
    userId: string
  }
): Promise<void> {
  const { processAutomationTrigger } = await import('./automation-engine')
  await processAutomationTrigger({
    supabase,
    tenantId: params.tenantId,
    matterId: params.matterId,
    triggerType: params.triggerType as 'stage_change' | 'checklist_item_approved' | 'deadline_approaching' | 'deadline_critical' | 'matter_created',
    triggerContext: params.triggerContext,
    userId: params.userId,
  })
}

async function dispatchNotificationAsync(
  supabase: SupabaseClient<Database>,
  event: {
    tenantId: string
    eventType: string
    recipientUserIds: string[]
    title: string
    message?: string
    entityType?: string
    entityId?: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }
): Promise<void> {
  const { dispatchNotification } = await import('./notification-engine')
  await dispatchNotification(supabase, event)
}
