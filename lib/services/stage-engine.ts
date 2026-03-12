import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { calculateCompletionScore } from './checklist-engine'
import { processAutomationTrigger } from './automation-engine'
import { sendStageChangeEmail } from './email-service'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ─── Gating Rule Types ────────────────────────────────────────────────────────

interface GatingRuleChecklistComplete {
  type: 'require_checklist_complete'
}

interface GatingRuleRequireDeadlines {
  type: 'require_deadlines'
  deadline_type_names: string[]
}

interface GatingRuleRequirePreviousStage {
  type: 'require_previous_stage'
  stage_name: string
}

interface GatingRuleRequireIntakeComplete {
  type: 'require_intake_complete'
  minimum_status?: 'complete' | 'validated'
}

interface GatingRuleRequireRiskReview {
  type: 'require_risk_review'
  block_levels?: string[]
}

interface GatingRuleRequireDocumentSlotsComplete {
  type: 'require_document_slots_complete'
}

interface GatingRuleRequireNoContradictions {
  type: 'require_no_contradictions'
  severity?: 'blocking'
}

interface GatingRuleRequireImmIntakeStatus {
  type: 'require_imm_intake_status'
  minimum_status: string
}

export type GatingRule =
  | GatingRuleChecklistComplete
  | GatingRuleRequireDeadlines
  | GatingRuleRequirePreviousStage
  | GatingRuleRequireIntakeComplete
  | GatingRuleRequireRiskReview
  | GatingRuleRequireDocumentSlotsComplete
  | GatingRuleRequireNoContradictions
  | GatingRuleRequireImmIntakeStatus

// ─── Result Types ─────────────────────────────────────────────────────────────

interface AdvanceSuccess {
  success: true
  stageName: string
}

interface AdvanceFailure {
  success: false
  error: string
  failedRules?: string[]
}

type AdvanceResult = AdvanceSuccess | AdvanceFailure

interface StageEngineParams {
  supabase: SupabaseClient<Database>
  matterId: string
  tenantId: string
  targetStageId: string
  userId: string
  /**
   * When true, the stage engine skips its own activity log insert.
   * Used when the caller (e.g. action executor) handles activity creation
   * via the atomic triple-write to avoid duplicate activity records.
   * Phase 7 Fix 5a.
   */
  skipActivityLog?: boolean
}

// ─── Generic Stage Advancement ────────────────────────────────────────────────

/**
 * Advance a matter through the generic stage pipeline (matter_stages + matter_stage_state).
 * Used for Real Estate and any non-immigration practice area.
 *
 * Validates gating rules, updates state, logs activity, triggers automations.
 */
export async function advanceGenericStage(params: StageEngineParams): Promise<AdvanceResult> {
  const { supabase, matterId, tenantId, targetStageId, userId } = params

  // 1. Fetch target stage definition
  const { data: targetStage, error: stageErr } = await supabase
    .from('matter_stages')
    .select('*')
    .eq('id', targetStageId)
    .single()

  if (stageErr || !targetStage) {
    return { success: false, error: 'Target stage not found' }
  }

  // 2. Fetch current stage state
  const { data: currentState } = await supabase
    .from('matter_stage_state')
    .select('*')
    .eq('matter_id', matterId)
    .eq('pipeline_id', targetStage.pipeline_id)
    .maybeSingle()

  // 3. If state exists, validate same pipeline
  if (currentState && currentState.pipeline_id !== targetStage.pipeline_id) {
    return { success: false, error: 'Target stage is not in the same pipeline' }
  }

  // 4. Evaluate gating rules (with default baseline for enforcement-enabled types)
  const rawGatingRules = (Array.isArray(targetStage.gating_rules) ? targetStage.gating_rules : []) as unknown as GatingRule[]
  const effectiveRules = await getEffectiveGatingRules(supabase, matterId, rawGatingRules, targetStage.sort_order)

  if (effectiveRules.length > 0) {
    const gateResult = await evaluateGatingRules(supabase, matterId, tenantId, effectiveRules, currentState?.stage_history)
    if (!gateResult.passed) {
      // Log the blocked attempt
      await logActivity(supabase, {
        tenantId,
        matterId,
        activityType: 'stage_change_blocked',
        title: `Stage advancement to "${targetStage.name}" blocked`,
        description: gateResult.failedRules.join('; '),
        userId,
      })
      return { success: false, error: gateResult.failedRules.join('. '), failedRules: gateResult.failedRules }
    }
  }

  // 5. Build updated stage history
  const existingHistory = (
    currentState?.stage_history && Array.isArray(currentState.stage_history)
      ? currentState.stage_history
      : []
  ) as Record<string, unknown>[]

  // Mark exit time on previous entry
  if (existingHistory.length > 0) {
    const lastEntry = existingHistory[existingHistory.length - 1]
    if (!lastEntry.exited_at) {
      lastEntry.exited_at = new Date().toISOString()
    }
  }

  const updatedHistory = [
    ...existingHistory,
    {
      stage_id: targetStageId,
      stage_name: targetStage.name,
      entered_at: new Date().toISOString(),
      user_id: userId,
    },
  ]

  // 6. Upsert matter_stage_state
  if (currentState) {
    const { error: updateErr } = await supabase
      .from('matter_stage_state')
      .update({
        current_stage_id: targetStageId,
        previous_stage_id: currentState.current_stage_id,
        entered_at: new Date().toISOString(),
        stage_history: updatedHistory as unknown as Database['public']['Tables']['matter_stage_state']['Update']['stage_history'],
      })
      .eq('id', currentState.id)

    if (updateErr) {
      return { success: false, error: `Failed to update stage state: ${updateErr.message}` }
    }
  } else {
    const { error: insertErr } = await supabase
      .from('matter_stage_state')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        pipeline_id: targetStage.pipeline_id,
        current_stage_id: targetStageId,
        entered_at: new Date().toISOString(),
        stage_history: updatedHistory as unknown as Database['public']['Tables']['matter_stage_state']['Insert']['stage_history'],
      })

    if (insertErr) {
      return { success: false, error: `Failed to create stage state: ${insertErr.message}` }
    }
  }

  // 7. Auto-close matter if terminal + auto_close
  if (targetStage.is_terminal && targetStage.auto_close_matter) {
    await supabase
      .from('matters')
      .update({
        status: 'closed_won',
        date_closed: new Date().toISOString().split('T')[0],
      })
      .eq('id', matterId)
      .eq('tenant_id', tenantId)
  }

  // 8. Log activity (skipped when caller handles via atomic triple-write)
  if (!params.skipActivityLog) {
    await logActivity(supabase, {
      tenantId,
      matterId,
      activityType: 'stage_change',
      title: `Stage advanced to "${targetStage.name}"`,
      description: currentState
        ? `Moved from previous stage`
        : `Initial stage set to "${targetStage.name}"`,
      userId,
      metadata: {
        target_stage_id: targetStageId,
        target_stage_name: targetStage.name,
        previous_stage_id: currentState?.current_stage_id ?? null,
      },
    })
  }

  // 9. Notify matter stakeholders
  await notifyStageChange(supabase, {
    tenantId,
    matterId,
    newStageName: targetStage.name,
    clientLabel: targetStage.client_label ?? null,
    notifyClient: targetStage.notify_client_on_stage_change ?? false,
    previousStageId: currentState?.current_stage_id ?? null,
    userId,
  })

  // 10. Trigger automations
  await processAutomationTrigger({
    supabase,
    tenantId,
    matterId,
    triggerType: 'stage_change',
    triggerContext: {
      to_stage_id: targetStageId,
      to_stage_name: targetStage.name,
      from_stage_id: currentState?.current_stage_id ?? null,
      pipeline_id: targetStage.pipeline_id,
    },
    userId,
  })

  // 11. Auto-create tasks from workflow templates bound to this stage
  await applyStageWorkflowTemplates(supabase, {
    tenantId,
    matterId,
    targetStageId,
    userId,
  })

  return { success: true, stageName: targetStage.name }
}

// ─── Immigration Stage Advancement ────────────────────────────────────────────

/**
 * Advance an immigration matter's stage (matter_immigration + case_stage_definitions).
 * Refactored from the client-side useAdvanceStage() in lib/queries/immigration.ts.
 *
 * Validates checklist completion, updates stage + history, creates auto-tasks, logs activity.
 */
export async function advanceImmigrationStage(params: StageEngineParams): Promise<AdvanceResult> {
  const { supabase, matterId, tenantId, targetStageId, userId } = params

  // 1. Fetch the target stage definition
  const { data: newStage, error: stageError } = await supabase
    .from('case_stage_definitions')
    .select('*')
    .eq('id', targetStageId)
    .single()

  if (stageError || !newStage) {
    return { success: false, error: 'Target immigration stage not found' }
  }

  // 2. If requires_checklist_complete, validate all required items
  if (newStage.requires_checklist_complete) {
    const { data: checklistItems, error: checklistError } = await supabase
      .from('matter_checklist_items')
      .select('*')
      .eq('matter_id', matterId)
      .eq('is_required', true)

    if (checklistError) {
      return { success: false, error: 'Failed to verify checklist status' }
    }

    const score = calculateCompletionScore(checklistItems ?? [])
    if (!score.isComplete) {
      await logActivity(supabase, {
        tenantId,
        matterId,
        activityType: 'stage_change_blocked',
        title: `Stage advancement to "${newStage.name}" blocked`,
        description: `Missing required checklist items: ${score.missingRequired.join(', ')}`,
        userId,
      })
      return {
        success: false,
        error: `All required checklist items must be approved before advancing to "${newStage.name}". Missing: ${score.missingRequired.join(', ')}`,
        failedRules: score.missingRequired.map((name) => `Required: ${name}`),
      }
    }
  }

  // 3. Fetch current matter_immigration to get existing stage_history
  const { data: currentMatterImm, error: currentError } = await supabase
    .from('matter_immigration')
    .select('stage_history, current_stage_id')
    .eq('matter_id', matterId)
    .single()

  if (currentError || !currentMatterImm) {
    return { success: false, error: 'Immigration record not found for this matter' }
  }

  // 4. Build updated stage_history (mark exit time on previous entry)
  const existingHistory = (
    Array.isArray(currentMatterImm.stage_history) ? currentMatterImm.stage_history : []
  ) as Record<string, unknown>[]

  // Mark exit time on the previous stage entry
  if (existingHistory.length > 0) {
    const lastEntry = existingHistory[existingHistory.length - 1]
    if (!lastEntry.exited_at) {
      lastEntry.exited_at = new Date().toISOString()
    }
  }

  const updatedHistory = [
    ...existingHistory,
    {
      stage_id: targetStageId,
      stage_name: newStage.name,
      entered_at: new Date().toISOString(),
      entered_by: userId,
    },
  ]

  // 5. Update matter_immigration
  const { error: updateError } = await supabase
    .from('matter_immigration')
    .update({
      current_stage_id: targetStageId,
      stage_entered_at: new Date().toISOString(),
      stage_history: updatedHistory as unknown as Database['public']['Tables']['matter_immigration']['Update']['stage_history'],
    })
    .eq('matter_id', matterId)

  if (updateError) {
    return { success: false, error: `Failed to update stage: ${updateError.message}` }
  }

  // 6. Create auto-tasks (idempotent)
  interface AutoTask {
    title: string
    description?: string
    priority?: string
    due_days_offset?: number
    assigned_to?: string
  }

  const autoTasks = (Array.isArray(newStage.auto_tasks) ? newStage.auto_tasks : []) as unknown as AutoTask[]

  for (const task of autoTasks) {
    // Idempotency: check if this auto-task already exists
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('matter_id', matterId)
      .eq('title', task.title)
      .eq('created_via', 'automation')
      .limit(1)

    if (existingTask && existingTask.length > 0) continue

    const dueDate = new Date()
    if (task.due_days_offset) {
      dueDate.setDate(dueDate.getDate() + task.due_days_offset)
    }

    await supabase.from('tasks').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      title: task.title,
      description: task.description ?? null,
      priority: task.priority ?? 'medium',
      due_date: dueDate.toISOString().split('T')[0],
      assigned_to: task.assigned_to ?? null,
      created_by: userId,
      created_via: 'automation',
      status: 'not_started',
    })
  }

  // 7. Auto-initialize checklist if not already done (first stage entry)
  await autoInitializeChecklist(supabase, tenantId, matterId, newStage.case_type_id)

  // 8. Log activity (skipped when caller handles via atomic triple-write)
  if (!params.skipActivityLog) {
    await logActivity(supabase, {
      tenantId,
      matterId,
      activityType: 'stage_change',
      title: `Stage advanced to "${newStage.name}"`,
      description: `Immigration case stage updated`,
      userId,
      metadata: {
        target_stage_id: targetStageId,
        target_stage_name: newStage.name,
        previous_stage_id: currentMatterImm.current_stage_id,
        auto_tasks_created: autoTasks.length,
      },
    })
  }

  // 9. Notify matter stakeholders (responsible + originating lawyer)
  await notifyStageChange(supabase, {
    tenantId,
    matterId,
    newStageName: newStage.name,
    clientLabel: newStage.client_label ?? null,
    notifyClient: newStage.notify_client_on_stage_change ?? false,
    previousStageId: currentMatterImm.current_stage_id,
    userId,
  })

  // 10. Trigger automations
  await processAutomationTrigger({
    supabase,
    tenantId,
    matterId,
    triggerType: 'stage_change',
    triggerContext: {
      to_stage_id: targetStageId,
      to_stage_name: newStage.name,
      from_stage_id: currentMatterImm.current_stage_id,
      case_type_id: newStage.case_type_id,
    },
    userId,
  })

  return { success: true, stageName: newStage.name }
}

// ─── Gating Rule Evaluator ────────────────────────────────────────────────────

export async function evaluateGatingRules(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
  rules: GatingRule[],
  stageHistory?: unknown
): Promise<{ passed: boolean; failedRules: string[] }> {
  const failedRules: string[] = []

  for (const rule of rules) {
    switch (rule.type) {
      case 'require_checklist_complete': {
        const { data: items } = await supabase
          .from('matter_checklist_items')
          .select('*')
          .eq('matter_id', matterId)
          .eq('is_required', true)

        if (items && items.length > 0) {
          const score = calculateCompletionScore(items)
          if (!score.isComplete) {
            failedRules.push(
              `Required checklist items incomplete (${score.requiredApproved}/${score.required}): ${score.missingRequired.slice(0, 3).join(', ')}${score.missingRequired.length > 3 ? '...' : ''}`
            )
          }
        }
        break
      }

      case 'require_deadlines': {
        const requiredNames = rule.deadline_type_names
        const { data: deadlines } = await supabase
          .from('matter_deadlines')
          .select('deadline_type, title')
          .eq('matter_id', matterId)
          .eq('tenant_id', tenantId)

        const existingTypes = new Set(
          (deadlines ?? []).flatMap((d) => [d.deadline_type, d.title])
        )

        for (const name of requiredNames) {
          if (!existingTypes.has(name)) {
            failedRules.push(`Required deadline missing: "${name}"`)
          }
        }
        break
      }

      case 'require_previous_stage': {
        const history = (Array.isArray(stageHistory) ? stageHistory : []) as { stage_name?: string }[]
        const wasReached = history.some((entry) => entry.stage_name === rule.stage_name)
        if (!wasReached) {
          failedRules.push(`Stage "${rule.stage_name}" must be completed first`)
        }
        break
      }

      case 'require_intake_complete': {
        const { data: intake } = await supabase
          .from('matter_intake')
          .select('intake_status')
          .eq('matter_id', matterId)
          .maybeSingle()

        const minStatus = rule.minimum_status ?? 'validated'
        const statusOrder = ['incomplete', 'complete', 'validated', 'locked']
        const currentIdx = statusOrder.indexOf(intake?.intake_status ?? 'incomplete')
        const requiredIdx = statusOrder.indexOf(minStatus)

        if (currentIdx < requiredIdx) {
          failedRules.push(
            `Core Data Card must be ${minStatus} before advancing. Current status: ${intake?.intake_status ?? 'not started'}`
          )
        }
        break
      }

      case 'require_risk_review': {
        const { data: riskIntake } = await supabase
          .from('matter_intake')
          .select('risk_level, risk_override_level, risk_override_at')
          .eq('matter_id', matterId)
          .maybeSingle()

        const blockLevels = rule.block_levels ?? ['critical']
        const effectiveLevel = riskIntake?.risk_override_level ?? riskIntake?.risk_level

        if (effectiveLevel && blockLevels.includes(effectiveLevel)) {
          const hasOverride = !!riskIntake?.risk_override_at
          if (!hasOverride) {
            failedRules.push(
              `Risk level is "${effectiveLevel}". Lawyer review and override required before advancing.`
            )
          }
        }
        break
      }

      case 'require_document_slots_complete': {
        const { data: requiredSlots } = await supabase
          .from('document_slots')
          .select('id, slot_name, status')
          .eq('matter_id', matterId)
          .eq('is_active', true)
          .eq('is_required', true)

        if (requiredSlots && requiredSlots.length > 0) {
          const unaccepted = requiredSlots.filter((s) => s.status !== 'accepted')
          if (unaccepted.length > 0) {
            const missingNames = unaccepted.slice(0, 3).map((s) => s.slot_name).join(', ')
            const suffix = unaccepted.length > 3 ? '...' : ''
            failedRules.push(
              `Required documents not yet accepted (${requiredSlots.length - unaccepted.length}/${requiredSlots.length}): ${missingNames}${suffix}`
            )
          }
        }
        break
      }

      case 'require_no_contradictions': {
        const { data: intakeForContra } = await supabase
          .from('matter_intake')
          .select('contradiction_flags, contradiction_override_at')
          .eq('matter_id', matterId)
          .maybeSingle()

        if (intakeForContra) {
          const flags = Array.isArray(intakeForContra.contradiction_flags)
            ? intakeForContra.contradiction_flags
            : []
          const blockingSeverity = (rule as GatingRuleRequireNoContradictions).severity ?? 'blocking'
          const blockingFlags = flags.filter(
            (f: any) => typeof f === 'object' && f?.severity === blockingSeverity
          )
          if (blockingFlags.length > 0 && !intakeForContra.contradiction_override_at) {
            failedRules.push(
              `${blockingFlags.length} blocking contradiction(s) must be resolved or overridden before advancing.`
            )
          }
        }
        break
      }

      case 'require_imm_intake_status': {
        const { IMMIGRATION_INTAKE_STATUS_ORDER } = await import('@/lib/config/immigration-playbooks')
        const requiredStatus = (rule as GatingRuleRequireImmIntakeStatus).minimum_status
        const requiredIdx = IMMIGRATION_INTAKE_STATUS_ORDER.indexOf(requiredStatus as any)

        const { data: intakeForStatus } = await supabase
          .from('matter_intake')
          .select('immigration_intake_status')
          .eq('matter_id', matterId)
          .maybeSingle()

        const actualStatus = intakeForStatus?.immigration_intake_status ?? 'not_issued'
        const actualIdx = IMMIGRATION_INTAKE_STATUS_ORDER.indexOf(actualStatus as any)

        if (requiredIdx >= 0 && actualIdx < requiredIdx) {
          failedRules.push(
            `Immigration intake status must be at least "${requiredStatus}". Current: "${actualStatus}".`
          )
        }
        break
      }
    }
  }

  return { passed: failedRules.length === 0, failedRules }
}

// ─── Default Baseline Gating Resolution ──────────────────────────────────────

/**
 * Resolves the effective gating rules for a stage.
 * - If the stage has explicit gating_rules → returns them as-is.
 * - If gating_rules is empty AND the matter's type has enforcement_enabled = true
 *   AND the stage is past the early-work threshold (sort_order >= 2) →
 *   injects default baseline: require_intake_complete (minimum: complete).
 * - Early stages (sort_order 0–1) are never blocked by default baseline,
 *   allowing initial consult / intake call work without friction.
 * - Otherwise returns [] (ungated).
 *
 * Both advanceGenericStage() and the check-gating API route call this function,
 * ensuring enforcement cannot be bypassed by stages that lack explicit configuration.
 */
export async function getEffectiveGatingRules(
  supabase: SupabaseClient<Database>,
  matterId: string,
  stageGatingRules: GatingRule[],
  stageSortOrder?: number
): Promise<GatingRule[]> {
  if (stageGatingRules.length > 0) return stageGatingRules

  // Early stages (sort_order 0–1) are intentionally ungated by default
  // to allow initial consult / intake call stage work without blocking.
  if (stageSortOrder !== undefined && stageSortOrder < 2) return []

  // No explicit rules — check if matter type has enforcement enabled
  const { data: matter } = await supabase
    .from('matters')
    .select('matter_type_id')
    .eq('id', matterId)
    .single()

  if (matter?.matter_type_id) {
    const { data: matterType } = await supabase
      .from('matter_types')
      .select('enforcement_enabled')
      .eq('id', matter.matter_type_id)
      .single()

    if (matterType?.enforcement_enabled) {
      // Default baseline: require intake complete for mid+ stages on enforcement-enabled types
      return [{ type: 'require_intake_complete', minimum_status: 'complete' } as GatingRule]
    }
  }

  return []
}

// ─── Activity Logger Helper ───────────────────────────────────────────────────

async function logActivity(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    activityType: string
    title: string
    description: string
    userId: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await supabase.from('activities').insert({
    tenant_id: params.tenantId,
    matter_id: params.matterId,
    activity_type: params.activityType,
    title: params.title,
    description: params.description,
    entity_type: 'matter',
    entity_id: params.matterId,
    user_id: params.userId,
    metadata: (params.metadata ?? {}) as Json,
  })
}

// ─── Stage Change Notification ───────────────────────────────────────────────

/**
 * Notify matter stakeholders when a stage changes.
 * Creates in-app notifications for:
 *   1. The responsible lawyer (if different from the user who made the change)
 *   2. The originating lawyer (if different from both)
 * Also queues a client-facing notification record that can later be sent via
 * email/SMS when those channels are enabled.
 */
async function notifyStageChange(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    newStageName: string
    clientLabel?: string | null
    notifyClient?: boolean
    previousStageId: string | null
    userId: string
  }
): Promise<void> {
  try {
    const { tenantId, matterId, newStageName, clientLabel, notifyClient, userId } = params

    // Use client_label for client-facing communications (falls back to internal name)
    const clientFacingName = clientLabel || newStageName

    // Fetch matter details for notification context
    const { data: matter } = await supabase
      .from('matters')
      .select('title, responsible_lawyer_id, originating_lawyer_id')
      .eq('id', matterId)
      .single()

    if (!matter) return

    const recipientIds = new Set<string>()

    // Add responsible lawyer (if not the one who made the change)
    if (matter.responsible_lawyer_id && matter.responsible_lawyer_id !== userId) {
      recipientIds.add(matter.responsible_lawyer_id)
    }

    // Add originating lawyer (if different from both)
    if (matter.originating_lawyer_id && matter.originating_lawyer_id !== userId) {
      recipientIds.add(matter.originating_lawyer_id)
    }

    // Create in-app notifications for internal users (always use internal name)
    const notifications = [...recipientIds].map((recipientId) => ({
      tenant_id: tenantId,
      user_id: recipientId,
      title: `Stage changed: ${matter.title}`,
      message: `Matter "${matter.title}" has been moved to "${newStageName}"`,
      notification_type: 'stage_change',
      entity_type: 'matter',
      entity_id: matterId,
      channels: ['in_app'] as string[],
      priority: 'high' as const,
    }))

    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications)
    }

    // Client notification: only send when notify_client_on_stage_change is enabled
    if (!notifyClient) return

    // Look up the primary contact from matter_contacts junction table
    const { data: primaryContact } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .limit(1)
      .maybeSingle()

    if (primaryContact?.contact_id) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        activity_type: 'client_stage_notification',
        title: `Client notified: stage moved to "${clientFacingName}"`,
        description: `Notification queued for primary contact regarding stage advancement to "${clientFacingName}"`,
        entity_type: 'matter',
        entity_id: matterId,
        user_id: userId,
        metadata: {
          contact_id: primaryContact.contact_id,
          stage_name: clientFacingName,
          notification_status: 'queued',
        } as Json,
      })

      // Fire-and-forget email to client (non-blocking, uses client-facing label)
      sendStageChangeEmail({
        supabase,
        tenantId,
        matterId,
        contactId: primaryContact.contact_id,
        stageName: clientFacingName,
      }).catch(() => {
        // Email failures never break stage advancement
      })
    }
  } catch {
    // Notifications are non-blocking — never fail the stage advance
  }
}

// ─── Auto-Initialize Checklist ───────────────────────────────────────────────

/**
 * Auto-populate the document checklist when a case type has templates
 * and the matter doesn't yet have checklist items.
 * Idempotent: skips if items already exist for this matter.
 */
async function autoInitializeChecklist(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  caseTypeId: string
): Promise<void> {
  try {
    // Check if checklist already initialized
    const { count } = await supabase
      .from('matter_checklist_items')
      .select('*', { count: 'exact', head: true })
      .eq('matter_id', matterId)

    if (count && count > 0) return // Already initialized

    // Fetch templates for this case type
    const { data: templates } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('case_type_id', caseTypeId)
      .order('sort_order', { ascending: true })

    if (!templates || templates.length === 0) return

    // Bulk insert checklist items
    const items = templates.map((t) => ({
      tenant_id: tenantId,
      matter_id: matterId,
      checklist_template_id: t.id,
      document_name: t.document_name,
      description: t.description,
      category: t.category,
      is_required: t.is_required,
      sort_order: t.sort_order,
      status: 'missing' as const,
    }))

    await supabase.from('matter_checklist_items').insert(items)
  } catch {
    // Non-blocking — checklist init failure shouldn't block stage advance
  }
}

// ─── Stage Workflow Template Application ─────────────────────────────────────

/**
 * Apply workflow templates bound to the target stage.
 * Looks up active workflow_templates where trigger_stage_id matches,
 * then creates tasks from each template's task_template_id.
 * Uses idempotent insert to avoid duplicates if stage is revisited.
 * Non-blocking — failures never break stage advancement.
 */
async function applyStageWorkflowTemplates(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    targetStageId: string
    userId: string
  }
): Promise<void> {
  try {
    const { tenantId, matterId, targetStageId, userId } = params

    // Find workflow templates triggered by this stage
    const { data: workflows } = await supabase
      .from('workflow_templates')
      .select('id, name, task_template_id')
      .eq('tenant_id', tenantId)
      .eq('trigger_stage_id', targetStageId)
      .eq('is_active', true)

    if (!workflows || workflows.length === 0) return

    let totalTasksCreated = 0

    for (const workflow of workflows) {
      if (!workflow.task_template_id) continue

      // Fetch template items
      const { data: templateItems } = await supabase
        .from('task_template_items')
        .select('*')
        .eq('template_id', workflow.task_template_id)
        .order('sort_order')

      if (!templateItems || templateItems.length === 0) continue

      // Build task inserts with idempotency check
      for (const item of templateItems) {
        // Skip if task already exists (idempotent — handles stage revisits)
        const { data: existing } = await supabase
          .from('tasks')
          .select('id')
          .eq('matter_id', matterId)
          .eq('title', item.title)
          .eq('created_via', 'template')
          .limit(1)

        if (existing && existing.length > 0) continue

        const dueDate = new Date()
        if (item.due_days_offset) {
          dueDate.setDate(dueDate.getDate() + item.due_days_offset)
        }

        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          matter_id: matterId,
          title: item.title,
          description: item.description ?? null,
          priority: item.priority ?? 'medium',
          due_date: dueDate.toISOString().split('T')[0],
          created_by: userId,
          created_via: 'template',
          status: 'not_started',
        })

        totalTasksCreated++
      }

      // Log activity for each applied workflow
      if (totalTasksCreated > 0) {
        await supabase.from('activities').insert({
          tenant_id: tenantId,
          matter_id: matterId,
          activity_type: 'workflow_tasks_created',
          title: `Tasks auto-created from "${workflow.name}"`,
          description: `${totalTasksCreated} task(s) created from workflow template on stage entry`,
          entity_type: 'matter',
          entity_id: matterId,
          user_id: userId,
          metadata: {
            workflow_template_id: workflow.id,
            workflow_name: workflow.name,
            task_template_id: workflow.task_template_id,
            tasks_created: totalTasksCreated,
            trigger_stage_id: targetStageId,
          } as Json,
        })
      }
    }
  } catch {
    // Non-blocking — task auto-creation failure shouldn't break stage advance
  }
}
