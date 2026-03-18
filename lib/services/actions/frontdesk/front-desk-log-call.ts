import type { ActionDefinition } from '../types'
import { frontDeskLogCallSchema, type FrontDeskLogCallInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskLogCallResult {
  contactId: string
  direction: string
  outcome: string
}

export const frontDeskLogCallAction: ActionDefinition<FrontDeskLogCallInput, FrontDeskLogCallResult> = {
  type: 'front_desk_log_call',
  label: 'Log Phone Call',
  inputSchema: frontDeskLogCallSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'contact',
  getEntityId: (input) => input.contactId,

  async execute({ input, supabase }) {
    // Directly increment interaction_count and update last_contacted_at.
    // The DB trigger (update_contact_engagement) only fires when engagement_points > 0
    // which execute_action_atomic does not set for front-desk activities, so we
    // must handle the contact stats update here instead of relying on the trigger.
    const { data: current } = await supabase
      .from('contacts')
      .select('interaction_count')
      .eq('id', input.contactId)
      .single()

    await supabase
      .from('contacts')
      .update({
        interaction_count: (current?.interaction_count ?? 0) + 1,
        last_contacted_at: new Date().toISOString(),
        last_interaction_type: 'call',
      })
      .eq('id', input.contactId)

    const outcomeLabel: Record<string, string> = {
      connected:    'Connected',
      no_answer:    'No Answer',
      voicemail:    'Voicemail',
      busy:         'Busy',
      wrong_number: 'Wrong Number',
    }

    return {
      data: {
        contactId: input.contactId,
        direction: input.direction,
        outcome: input.outcome,
      },
      newState: {
        call_logged: true,
        direction: input.direction,
        outcome: input.outcome,
      },
      activity: {
        activityType: 'front_desk_call_logged',
        title: `Call — ${outcomeLabel[input.outcome] ?? input.outcome}${input.notes ? ': ' + input.notes : ''}`,
        description: input.notes || undefined,
        metadata: {
          direction: input.direction,
          outcome: input.outcome,
          outcome_label: outcomeLabel[input.outcome] ?? input.outcome,
          duration_minutes: input.durationMinutes ?? null,
        },
        contactId: input.contactId,
      },
    }
  },
}
