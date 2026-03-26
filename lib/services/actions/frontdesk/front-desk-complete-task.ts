import type { ActionDefinition } from '../types'
import { assertNoError, assertOk } from '../db-assert'
import { frontDeskCompleteTaskSchema, type FrontDeskCompleteTaskInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskCompleteTaskResult {
  taskId: string
  outcomeCode: string
  followUpCreated: boolean
}

export const frontDeskCompleteTaskAction: ActionDefinition<FrontDeskCompleteTaskInput, FrontDeskCompleteTaskResult> = {
  type: 'front_desk_complete_task',
  label: 'Complete Task (Front Desk)',
  inputSchema: frontDeskCompleteTaskSchema,
  permission: { entity: 'tasks', action: 'edit' },
  allowedSources: ['front_desk'],
  entityType: 'task',
  getEntityId: (input) => input.taskId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('tasks')
      .select('status, priority, assigned_to')
      .eq('id', input.taskId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Verify task exists and belongs to tenant
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('id, title, matter_id, assigned_to')
      .eq('id', input.taskId)
      .eq('tenant_id', tenantId)
      .single()

    if (taskErr || !task) {
      throw new Error('Task not found')
    }

    // 2. Update task status to done
    assertNoError(
      await supabase
        .from('tasks')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          completed_by: userId,
        })
        .eq('id', input.taskId)
        .eq('tenant_id', tenantId),
      'front_desk_complete_task:update_task'
    )

    let followUpCreated = false

    // 3. If outcomeCode is 'escalated', create a new task assigned to the matter owner
    if (input.outcomeCode === 'escalated' && task.matter_id) {
      // Look up matter owner
      const { data: matter } = await supabase
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('id', task.matter_id)
        .eq('tenant_id', tenantId)
        .single()

      const escalateTo = matter?.responsible_lawyer_id ?? task.assigned_to ?? userId

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 1)

      assertNoError(
        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          matter_id: task.matter_id,
          title: `Escalated: ${task.title}`,
          description: input.notes ?? `Task escalated from front desk. Original task: ${task.title}`,
          priority: 'high',
          due_date: dueDate.toISOString().split('T')[0],
          assigned_to: escalateTo,
          created_by: userId,
          created_via: 'automation',
          status: 'not_started',
        }),
        'front_desk_complete_task:create_escalation_task'
      )
      followUpCreated = true
    }

    // 4. If spawnNextTaskTemplateId is provided, create a follow-up task from template item
    if (input.spawnNextTaskTemplateId) {
      const { data: templateItem } = await supabase
        .from('task_template_items')
        .select('title, description, priority, days_offset, assign_to_role')
        .eq('id', input.spawnNextTaskTemplateId)
        .eq('template_id', input.spawnNextTaskTemplateId)
        .single()

      if (templateItem) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + (templateItem.days_offset ?? 1))

        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: task.matter_id,
            title: templateItem.title,
            description: templateItem.description ?? `Follow-up task created from template after completing: ${task.title}`,
            priority: templateItem.priority ?? 'medium',
            due_date: dueDate.toISOString().split('T')[0],
            assigned_to: task.assigned_to ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'front_desk_complete_task:create_follow_up_task'
        )
        followUpCreated = true
      }
    }

    return {
      data: {
        taskId: input.taskId,
        outcomeCode: input.outcomeCode,
        followUpCreated,
      },
      newState: {
        status: 'done',
        completed_at: new Date().toISOString(),
        completed_by: userId,
        outcome_code: input.outcomeCode,
        follow_up_created: followUpCreated,
      },
      activity: {
        activityType: 'task_completed_front_desk',
        title: `Task completed  -  ${input.outcomeCode.replace(/_/g, ' ')}`,
        description: input.notes,
        metadata: {
          task_id: input.taskId,
          outcome_code: input.outcomeCode,
          follow_up_created: followUpCreated,
          spawn_template_id: input.spawnNextTaskTemplateId,
        },
        matterId: task.matter_id,
      },
    }
  },
}
