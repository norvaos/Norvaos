import type { ActionDefinition } from '../types'
import { assertOk } from '../db-assert'
import { frontDeskRequestContactEditSchema, type FrontDeskRequestContactEditInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskRequestContactEditResult {
  taskId: string
  contactId: string
  fieldToEdit: string
  assignedToUserId: string
}

export const frontDeskRequestContactEditAction: ActionDefinition<FrontDeskRequestContactEditInput, FrontDeskRequestContactEditResult> = {
  type: 'front_desk_request_contact_edit',
  label: 'Request Contact Edit',
  inputSchema: frontDeskRequestContactEditSchema,
  permission: { entity: 'front_desk', action: 'edit' },
  allowedSources: ['front_desk'],
  entityType: 'contact',
  getEntityId: (input) => input.contactId,

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Get the contact's name
    const contact = assertOk(
      await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('id', input.contactId)
        .eq('tenant_id', tenantId)
        .single(),
      'front_desk_request_edit:get_contact'
    )

    const contactName = [contact!.first_name, contact!.last_name].filter(Boolean).join(' ') || 'Unknown'

    // 2. Find the contact's linked matter(s) and get the assigned lawyer's user_id
    let assignedLawyerId: string | null = null

    const { data: matterLinks } = await supabase
      .from('matter_contacts')
      .select('matter_id, matters!inner(responsible_lawyer_id)')
      .eq('contact_id', input.contactId)
      .limit(1)

    if (matterLinks && matterLinks.length > 0) {
      const matter = matterLinks[0].matters as unknown as { responsible_lawyer_id: string | null }
      assignedLawyerId = matter?.responsible_lawyer_id ?? null
    }

    // If no assigned lawyer found, fall back to the requesting user
    const assignTo = assignedLawyerId ?? userId

    // 3. Create a task assigned to the lawyer
    const task = assertOk(
      await supabase
        .from('tasks')
        .insert({
          tenant_id: tenantId,
          title: `Edit Request: ${input.fieldToEdit} for ${contactName}`,
          description: input.requestedChanges,
          assigned_to: assignTo,
          created_by: userId,
          created_via: 'front_desk',
          priority: 'medium',
          status: 'not_started',
          contact_id: input.contactId,
        })
        .select('id')
        .single(),
      'front_desk_request_edit:create_task'
    )

    return {
      data: {
        taskId: task!.id,
        contactId: input.contactId,
        fieldToEdit: input.fieldToEdit,
        assignedToUserId: assignTo,
      },
      newState: {
        task_id: task!.id,
        contact_id: input.contactId,
        field_to_edit: input.fieldToEdit,
        assigned_to: assignTo,
      },
      activity: {
        activityType: 'contact_edit_requested',
        title: `Edit request: ${input.fieldToEdit}`,
        description: input.requestedChanges,
        metadata: {
          task_id: task!.id,
          contact_id: input.contactId,
          contact_name: contactName,
          field_to_edit: input.fieldToEdit,
          assigned_to: assignTo,
        },
        contactId: input.contactId,
      },
    }
  },

  notificationEvent: 'contact_edit_requested',

  buildNotification(_ctx, result) {
    return {
      recipientUserIds: [result.assignedToUserId],
      title: `Contact edit requested: ${result.fieldToEdit}`,
      message: `A front desk staff member has requested an edit to the "${result.fieldToEdit}" field for a contact. Please review the task.`,
      priority: 'normal',
    }
  },
}
