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

  async execute({ input }) {
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
        title: `Phone call — ${input.direction} (${input.outcome})`,
        description: input.notes,
        metadata: {
          direction: input.direction,
          outcome: input.outcome,
          duration_minutes: input.durationMinutes ?? null,
        },
        contactId: input.contactId,
      },
    }
  },
}
