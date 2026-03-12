/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Milestone Engine — Milestone/Task Orchestration
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Creates milestone groups and tasks on stage entry (from registry definitions).
 * Handles auto-completion from workflow events, skip-on-close, and completion
 * percentage recalculation.
 *
 * All operations are idempotent via the workflow execution ledger.
 * After any mutation, calls recalculateLeadSummary().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import {
  STAGE_MILESTONE_DEFINITIONS,
  NO_SHOW_RECOVERY_GROUP,
  type LeadStage,
  type MilestoneGroupDef,
  type MilestoneTaskDef,
  type AutoCompleteTrigger,
} from '@/lib/config/lead-workflow-definitions'
import { executeIdempotent, idempotencyKeys } from './lead-idempotency'
import { recalculateLeadSummary } from './lead-summary-recalculator'
import { addBusinessDays } from '@/lib/utils/business-days'
import type { ResolvedWorkflowConfig } from './workspace-config-service'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateMilestoneParams {
  leadId: string
  tenantId: string
  stage: LeadStage
  actorUserId: string
  workspaceConfig: ResolvedWorkflowConfig
}

// ─── Create Milestone Groups for Stage ───────────────────────────────────────

/**
 * Create milestone groups and their tasks for a given stage.
 * Reads definitions from the workflow registry. Idempotent per group type.
 */
export async function createMilestoneGroupsForStage(
  supabase: SupabaseClient<Database>,
  params: CreateMilestoneParams
): Promise<void> {
  const { leadId, tenantId, stage, actorUserId, workspaceConfig } = params

  const groupDefs = STAGE_MILESTONE_DEFINITIONS[stage]
  if (!groupDefs || groupDefs.length === 0) return

  // Resolve tenant timezone for business-day calculations
  const { data: tenant } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('id', tenantId)
    .single()
  const timezone = tenant?.timezone ?? 'America/Toronto'

  for (const groupDef of groupDefs) {
    await createSingleMilestoneGroup(supabase, {
      leadId,
      tenantId,
      stage,
      actorUserId,
      groupDef,
      timezone,
      workspaceConfig,
    })
  }
}

/**
 * Create the no-show recovery milestone group (triggered in-stage, not on stage entry).
 */
export async function createNoShowRecoveryGroup(
  supabase: SupabaseClient<Database>,
  params: Omit<CreateMilestoneParams, 'stage'>
): Promise<void> {
  const { leadId, tenantId, actorUserId, workspaceConfig } = params

  const { data: tenant } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('id', tenantId)
    .single()
  const timezone = tenant?.timezone ?? 'America/Toronto'

  await createSingleMilestoneGroup(supabase, {
    leadId,
    tenantId,
    stage: 'consultation_booked' as LeadStage,
    actorUserId,
    groupDef: NO_SHOW_RECOVERY_GROUP,
    timezone,
    workspaceConfig,
  })
}

async function createSingleMilestoneGroup(
  supabase: SupabaseClient<Database>,
  params: {
    leadId: string
    tenantId: string
    stage: LeadStage
    actorUserId: string
    groupDef: MilestoneGroupDef
    timezone: string
    workspaceConfig: ResolvedWorkflowConfig
  }
): Promise<void> {
  const { leadId, tenantId, stage, actorUserId, groupDef, timezone, workspaceConfig } = params

  // Idempotent: one milestone group per type per stage per lead
  await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'milestone_creation',
    executionKey: idempotencyKeys.milestoneCreation(leadId, groupDef.groupType, stage),
    actorUserId,
    handler: async () => {
      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('lead_milestone_groups')
        .insert({
          tenant_id: tenantId,
          lead_id: leadId,
          group_type: groupDef.groupType,
          title: groupDef.title,
          status: 'in_progress',
          created_from_stage: stage,
          sort_order: groupDef.sortOrder,
        })
        .select('id')
        .single()

      if (groupError || !group) {
        throw new Error(`Failed to create milestone group: ${groupError?.message}`)
      }

      // Resolve owner user IDs
      const { data: lead } = await supabase
        .from('leads')
        .select('assigned_intake_staff_id, responsible_lawyer_id, assigned_to')
        .eq('id', leadId)
        .single()

      const ownerMap: Record<string, string | null> = {
        assigned_intake_staff: lead?.assigned_intake_staff_id ?? lead?.assigned_to ?? null,
        responsible_lawyer: lead?.responsible_lawyer_id ?? null,
      }

      // Create tasks
      const now = new Date()
      const tasks = groupDef.tasks.map((taskDef) => {
        const dueAt = resolveDueDate(taskDef, now, timezone, workspaceConfig)
        return {
          tenant_id: tenantId,
          lead_id: leadId,
          milestone_group_id: group.id,
          title: taskDef.title,
          task_type: taskDef.taskType,
          status: 'not_started' as const,
          owner_user_id: taskDef.ownerRole ? ownerMap[taskDef.ownerRole] : null,
          due_at: dueAt?.toISOString() ?? null,
          sort_order: taskDef.sortOrder,
        }
      })

      if (tasks.length > 0) {
        await supabase.from('lead_milestone_tasks').insert(tasks)
      }

      // Log activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'milestone_group_created',
        title: `Milestone group created: ${groupDef.title}`,
        description: `${tasks.length} task(s) generated for "${groupDef.title}" on stage entry to "${stage}"`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: actorUserId,
        metadata: {
          group_type: groupDef.groupType,
          task_count: tasks.length,
          stage,
        } as unknown as Database['public']['Tables']['activities']['Insert']['metadata'],
      })
    },
  })
}

// ─── Auto-Complete Task ──────────────────────────────────────────────────────

/**
 * Auto-complete a milestone task with linked evidence.
 * Idempotent per task + triggering event.
 */
export async function autoCompleteMilestoneTask(
  supabase: SupabaseClient<Database>,
  params: {
    taskId: string
    tenantId: string
    leadId: string
    completionSource: 'system' | 'integration' | 'ai'
    linkedCommunicationEventId?: string
    linkedDocumentId?: string
    linkedPaymentEventId?: string
    actorUserId?: string
  }
): Promise<void> {
  const { taskId, tenantId, leadId, completionSource, linkedCommunicationEventId, linkedDocumentId, linkedPaymentEventId, actorUserId } = params

  const triggerEventId = linkedCommunicationEventId ?? linkedDocumentId ?? linkedPaymentEventId ?? 'manual'

  await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'task_completion',
    executionKey: idempotencyKeys.taskCompletion(taskId, triggerEventId),
    actorUserId,
    handler: async () => {
      const now = new Date().toISOString()

      await supabase
        .from('lead_milestone_tasks')
        .update({
          status: 'completed',
          completed_at: now,
          completed_by: actorUserId ?? null,
          completion_source: completionSource,
          linked_communication_event_id: linkedCommunicationEventId ?? null,
          linked_document_id: linkedDocumentId ?? null,
          linked_payment_event_id: linkedPaymentEventId ?? null,
        })
        .eq('id', taskId)
        .eq('tenant_id', tenantId)

      // Get the task's milestone group to recalculate completion
      const { data: task } = await supabase
        .from('lead_milestone_tasks')
        .select('milestone_group_id, title')
        .eq('id', taskId)
        .single()

      if (task?.milestone_group_id) {
        await recalculateGroupCompletion(supabase, task.milestone_group_id, tenantId)
      }

      // Log activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'milestone_task_completed',
        title: `Task auto-completed: ${task?.title ?? taskId}`,
        description: `Completed by ${completionSource}`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: actorUserId ?? 'system',
        metadata: {
          task_id: taskId,
          completion_source: completionSource,
          linked_communication_event_id: linkedCommunicationEventId,
          linked_document_id: linkedDocumentId,
          linked_payment_event_id: linkedPaymentEventId,
        } as unknown as Database['public']['Tables']['activities']['Insert']['metadata'],
      })

      // Recalculate lead summary (overdue count, next action)
      await recalculateLeadSummary(supabase, leadId, tenantId, {
        fields: ['overdue_task_count', 'next_required_action'],
      })
    },
  })
}

/**
 * Manually complete a milestone task.
 */
export async function manualCompleteMilestoneTask(
  supabase: SupabaseClient<Database>,
  params: {
    taskId: string
    tenantId: string
    leadId: string
    actorUserId: string
    notes?: string
  }
): Promise<void> {
  const { taskId, tenantId, leadId, actorUserId, notes } = params

  await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'task_completion',
    executionKey: idempotencyKeys.taskManualCompletion(taskId),
    actorUserId,
    handler: async () => {
      const now = new Date().toISOString()

      await supabase
        .from('lead_milestone_tasks')
        .update({
          status: 'completed',
          completed_at: now,
          completed_by: actorUserId,
          completion_source: 'manual',
          notes: notes ?? null,
        })
        .eq('id', taskId)
        .eq('tenant_id', tenantId)

      const { data: task } = await supabase
        .from('lead_milestone_tasks')
        .select('milestone_group_id, title')
        .eq('id', taskId)
        .single()

      if (task?.milestone_group_id) {
        await recalculateGroupCompletion(supabase, task.milestone_group_id, tenantId)
      }

      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'milestone_task_completed',
        title: `Task completed: ${task?.title ?? taskId}`,
        description: `Manually completed by user`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: actorUserId,
        metadata: {
          task_id: taskId,
          completion_source: 'manual',
          notes,
        } as unknown as Database['public']['Tables']['activities']['Insert']['metadata'],
      })

      await recalculateLeadSummary(supabase, leadId, tenantId, {
        fields: ['overdue_task_count', 'next_required_action'],
      })
    },
  })
}

// ─── Skip Remaining Tasks ────────────────────────────────────────────────────

/**
 * Skip all non-completed tasks in a milestone group (used on closure).
 */
export async function skipRemainingTasks(
  supabase: SupabaseClient<Database>,
  milestoneGroupId: string,
  tenantId: string,
  leadId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString()

  await supabase
    .from('lead_milestone_tasks')
    .update({
      status: 'skipped',
      skip_reason: reason,
      completed_at: now,
      completion_source: 'system',
    })
    .eq('milestone_group_id', milestoneGroupId)
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","skipped","closed")')

  await supabase
    .from('lead_milestone_groups')
    .update({ status: 'closed', completion_source: 'system' })
    .eq('id', milestoneGroupId)
    .eq('tenant_id', tenantId)

  await recalculateLeadSummary(supabase, leadId, tenantId, {
    fields: ['overdue_task_count', 'next_required_action'],
  })
}

/**
 * Skip all remaining tasks across ALL open milestone groups for a lead (used on closure).
 */
export async function skipAllRemainingTasksForLead(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  reason: string
): Promise<void> {
  const { data: groups } = await supabase
    .from('lead_milestone_groups')
    .select('id')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","skipped","closed")')

  if (groups) {
    for (const group of groups) {
      await skipRemainingTasks(supabase, group.id, tenantId, leadId, reason)
    }
  }
}

// ─── Completion Recalculation ────────────────────────────────────────────────

/**
 * Recalculate a milestone group's completion percentage.
 * If all tasks are completed/skipped, mark the group as completed.
 */
export async function recalculateGroupCompletion(
  supabase: SupabaseClient<Database>,
  milestoneGroupId: string,
  tenantId: string
): Promise<void> {
  const { data: tasks } = await supabase
    .from('lead_milestone_tasks')
    .select('status')
    .eq('milestone_group_id', milestoneGroupId)
    .eq('tenant_id', tenantId)

  if (!tasks || tasks.length === 0) return

  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length
  const percent = Math.round((done / total) * 100)

  const groupUpdate: Database['public']['Tables']['lead_milestone_groups']['Update'] = {
    completion_percent: percent,
  }

  if (percent === 100) {
    groupUpdate.status = 'completed'
    groupUpdate.completed_at = new Date().toISOString()
    groupUpdate.completion_source = 'system'
  } else if (done > 0) {
    groupUpdate.status = 'in_progress'
  }

  await supabase
    .from('lead_milestone_groups')
    .update(groupUpdate)
    .eq('id', milestoneGroupId)
    .eq('tenant_id', tenantId)
}

// ─── Task Matching for Auto-Completion ───────────────────────────────────────

/**
 * Find milestone tasks that should be auto-completed based on a trigger event.
 * Called by the communication engine when a comm event is logged.
 */
export async function findTasksMatchingTrigger(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  trigger: AutoCompleteTrigger
): Promise<Array<{ id: string; title: string; milestoneGroupId: string }>> {
  // Fetch all pending tasks for this lead
  const { data: tasks } = await supabase
    .from('lead_milestone_tasks')
    .select('id, title, milestone_group_id, task_type')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","skipped","closed")')
    .order('sort_order')

  if (!tasks) return []

  // Match tasks against the trigger using the workflow registry definitions
  const allGroupDefs = Object.values(STAGE_MILESTONE_DEFINITIONS).flat()
  const allTaskDefs = allGroupDefs.flatMap((g) => g.tasks)

  return tasks.filter((task) => {
    const taskDef = allTaskDefs.find((d) => d.taskType === task.task_type)
    if (!taskDef?.autoCompleteOn) return false
    return matchesTrigger(taskDef.autoCompleteOn, trigger)
  }).map((t) => ({
    id: t.id,
    title: t.title,
    milestoneGroupId: t.milestone_group_id,
  }))
}

function matchesTrigger(def: AutoCompleteTrigger, actual: AutoCompleteTrigger): boolean {
  if (def.event !== actual.event) return false
  if (def.channel && def.channel !== actual.channel) return false
  if (def.direction && def.direction !== actual.direction) return false
  if (def.subtype && def.subtype !== actual.subtype) return false
  if (def.status && def.status !== actual.status) return false
  return true
}

// ─── Due Date Resolution ─────────────────────────────────────────────────────

function resolveDueDate(
  taskDef: MilestoneTaskDef,
  baseDate: Date,
  timezone: string,
  config: ResolvedWorkflowConfig
): Date | null {
  // If task uses cadence config, resolve from workspace config
  if (taskDef.cadenceConfigKey) {
    const cadence = getCadenceArray(taskDef.cadenceConfigKey, config)
    // Use the task's sort_order (1-based) to index into cadence array (0-based)
    const stepIndex = taskDef.sortOrder - 1
    if (cadence && stepIndex < cadence.length) {
      // Cumulative offset: sum of all prior cadence values
      const cumulativeDays = cadence.slice(0, stepIndex + 1).reduce((sum, d) => sum + d, 0)
      return addBusinessDays(baseDate, cumulativeDays, timezone)
    }
  }

  // Fall back to fixed offset
  if (taskDef.dueDaysOffset !== undefined) {
    return addBusinessDays(baseDate, taskDef.dueDaysOffset, timezone)
  }

  return null
}

function getCadenceArray(key: string, config: ResolvedWorkflowConfig): number[] | null {
  switch (key) {
    case 'contact_attempt_cadence_days': return config.contactAttemptCadenceDays
    case 'retainer_followup_cadence_days': return config.retainerFollowupCadenceDays
    case 'payment_followup_cadence_days': return config.paymentFollowupCadenceDays
    case 'no_show_cadence_days': return config.noShowCadenceDays
    default: return null
  }
}
