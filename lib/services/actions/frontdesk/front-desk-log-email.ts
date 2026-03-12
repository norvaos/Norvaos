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

  async execute({ input }) {
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
        title: `Email — ${input.direction}: ${input.subject}`,
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
