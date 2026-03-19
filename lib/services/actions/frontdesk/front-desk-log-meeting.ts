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

  async execute({ input, supabase }) {
    // Directly increment interaction_count and update last_contacted_at.
    // The DB trigger (update_contact_engagement) only fires when engagement_points > 0
    // which execute_action_atomic does not set for front-desk activities, so we
    // must handle the contact stats update here instead of relying on the trigger.
    // Meeting engagement: +10 points (highest-value touch)
    const points = 10

    const { data: current } = await supabase
      .from('contacts')
      .select('interaction_count, engagement_score')
      .eq('id', input.contactId)
      .single()

    await supabase
      .from('contacts')
      .update({
        interaction_count: (current?.interaction_count ?? 0) + 1,
        engagement_score:  (current?.engagement_score  ?? 0) + points,
        last_contacted_at: new Date().toISOString(),
        last_interaction_type: 'meeting',
      })
      .eq('id', input.contactId)

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
        title: `${typeLabel} meeting${input.durationMinutes ? ` (${input.durationMinutes} min)` : ''}${input.notes ? ': ' + input.notes.slice(0, 60) : ''}`,
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
