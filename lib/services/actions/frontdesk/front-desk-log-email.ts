import type { ActionDefinition } from '../types'
import { frontDeskLogEmailSchema, type FrontDeskLogEmailInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskLogEmailResult {
  contactId: string
  direction: string
  subject: string
}

export const frontDeskLogEmailAction: ActionDefinition<FrontDeskLogEmailInput, FrontDeskLogEmailResult> = {
  type: 'front_desk_log_email',
  label: 'Log Email',
  inputSchema: frontDeskLogEmailSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'contact',
  getEntityId: (input) => input.contactId,

  async execute({ input, supabase }) {
    // Directly increment interaction_count and update last_contacted_at.
    // The DB trigger (update_contact_engagement) only fires when engagement_points > 0
    // which execute_action_atomic does not set for front-desk activities, so we
    // must handle the contact stats update here instead of relying on the trigger.
    // Email engagement: +4 points (high-effort channel)
    const points = 4

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
        last_interaction_type: 'email',
      })
      .eq('id', input.contactId)

    const directionLabel = input.direction === 'inbound' ? 'Received' : 'Sent'

    return {
      data: {
        contactId: input.contactId,
        direction: input.direction,
        subject: input.subject,
      },
      newState: {
        email_logged: true,
        direction: input.direction,
        subject: input.subject,
      },
      activity: {
        activityType: 'front_desk_email_logged',
        title: `Email  -  ${directionLabel}: ${input.subject}`,
        description: input.notes,
        metadata: {
          direction: input.direction,
          subject: input.subject,
        },
        contactId: input.contactId,
      },
    }
  },
}
