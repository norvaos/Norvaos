import type { ActionDefinition } from '../types'
import { assertOk } from '../db-assert'
import { frontDeskCreateTaskSchema, type FrontDeskCreateTaskInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskCreateTaskResult {
  taskId: string
  title: string
  assignedTo: string
}

export const frontDeskCreateTaskAction: ActionDefinition<FrontDeskCreateTaskInput, FrontDeskCreateTaskResult> = {
  type: 'front_desk_create_task',
  label: 'Create Task (Front Desk)',
  inputSchema: frontDeskCreateTaskSchema,
  permission: { entity: 'tasks', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'task',
  getEntityId: () => 'new',

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Insert into tasks table
    const task = assertOk(
      await supabase
        .from('tasks')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          assigned_to: input.assignToUserId,
          due_date: input.dueDate,
          priority: input.priority,
          status: 'not_started',
          description: input.reason,
          created_by: userId,
          created_via: 'front_desk',
          contact_id: input.contactId ?? null,
          matter_id: input.matterId ?? null,
        })
        .select('id')
        .single(),
      'front_desk_create_task:insert_task'
    )

    return {
      data: {
        taskId: task!.id,
        title: input.title,
        assignedTo: input.assignToUserId,
      },
      newState: {
        task_id: task!.id,
        title: input.title,
        assigned_to: input.assignToUserId,
        due_date: input.dueDate,
        priority: input.priority,
        status: 'not_started',
      },
      activity: {
        activityType: 'task_created_front_desk',
        title: `Task created: ${input.title}`,
        metadata: {
          task_id: task!.id,
          assigned_to: input.assignToUserId,
          due_date: input.dueDate,
          priority: input.priority,
          contact_id: input.contactId,
          matter_id: input.matterId,
        },
        contactId: input.contactId ?? null,
        matterId: input.matterId ?? null,
      },
    }
  },

  notificationEvent: 'task_assigned',

  buildNotification(_ctx, result) {
    return {
      recipientUserIds: [result.assignedTo],
      title: `New task assigned: ${result.title}`,
      message: `A new task "${result.title}" has been assigned to you from the front desk.`,
      priority: 'normal',
    }
  },
}
