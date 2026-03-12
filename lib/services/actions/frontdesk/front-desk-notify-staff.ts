import type { ActionDefinition } from '../types'
import { assertOk } from '../db-assert'
import { frontDeskNotifyStaffSchema, type FrontDeskNotifyStaffInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskNotifyStaffResult {
  notificationId: string
  recipientUserId: string
}

export const frontDeskNotifyStaffAction: ActionDefinition<FrontDeskNotifyStaffInput, FrontDeskNotifyStaffResult> = {
  type: 'front_desk_notify_staff',
  label: 'Notify Staff',
  inputSchema: frontDeskNotifyStaffSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'notification',
  getEntityId: (input) => input.recipientUserId,

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // Determine entity type and entity ID based on which ID is provided
    const entityType = input.appointmentId ? 'appointment' : input.checkInSessionId ? 'check_in_session' : null
    const entityId = input.appointmentId ?? input.checkInSessionId ?? null

    // 1. Insert into notifications table
    const notification = assertOk(
      await supabase
        .from('notifications')
        .insert({
          tenant_id: tenantId,
          user_id: input.recipientUserId,
          title: 'Front Desk Notification',
          message: input.message,
          notification_type: 'front_desk_alert',
          entity_type: entityType,
          entity_id: entityId,
          channels: ['in_app'],
          priority: 'high',
        })
        .select('id')
        .single(),
      'front_desk_notify_staff:insert_notification'
    )

    return {
      data: {
        notificationId: notification!.id,
        recipientUserId: input.recipientUserId,
      },
      newState: {
        notification_id: notification!.id,
        recipient_user_id: input.recipientUserId,
        entity_type: entityType,
        entity_id: entityId,
      },
      activity: {
        activityType: 'staff_notified',
        title: 'Staff notified via front desk',
        description: input.message,
        metadata: {
          notification_id: notification!.id,
          recipient_user_id: input.recipientUserId,
          appointment_id: input.appointmentId,
          check_in_session_id: input.checkInSessionId,
        },
      },
    }
  },
}
