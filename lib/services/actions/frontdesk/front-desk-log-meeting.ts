import type { ActionDefinition } from '../types'
import { frontDeskLogMeetingSchema, type FrontDeskLogMeetingInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskLogMeetingResult {
  contactId: string
  meetingType: string
}

export const frontDeskLogMeetingAction: ActionDefinition<FrontDeskLogMeetingInput, FrontDeskLogMeetingResult> = {
  type: 'front_desk_log_meeting',
  label: 'Log Meeting',
  inputSchema: frontDeskLogMeetingSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'contact',
  getEntityId: (input) => input.contactId,

  async execute({ input }) {
    const typeLabel = input.meetingType === 'in_person' ? 'In-person' : input.meetingType === 'video' ? 'Video' : 'Phone'

    return {
      data: {
        contactId: input.contactId,
        meetingType: input.meetingType,
      },
      newState: {
        meeting_logged: true,
        meeting_type: input.meetingType,
      },
      activity: {
        activityType: 'front_desk_meeting_logged',
        title: `${typeLabel} meeting logged${input.durationMinutes ? ` (${input.durationMinutes} min)` : ''}`,
        description: input.notes,
        metadata: {
          meeting_type: input.meetingType,
          duration_minutes: input.durationMinutes ?? null,
          attendees: input.attendees ?? null,
        },
        contactId: input.contactId,
      },
    }
  },
}
