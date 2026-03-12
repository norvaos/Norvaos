import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { frontDeskNoteSchema, type FrontDeskNoteInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskNoteResult {
  noteCreated: boolean
  entityType: string
  entityId: string
}

export const frontDeskNoteAction: ActionDefinition<FrontDeskNoteInput, FrontDeskNoteResult> = {
  type: 'front_desk_note',
  label: 'Add Front Desk Note',
  inputSchema: frontDeskNoteSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'contact', // dynamic based on input, but default for registry
  getEntityId: (input) => input.entityId,

  async execute({ input }) {
    // No direct DB write needed — the note IS the activity.
    // The action executor writes the activity atomically via execute_action_atomic().
    return {
      data: {
        noteCreated: true,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      newState: {
        note_added: true,
        entity_type: input.entityType,
        entity_id: input.entityId,
      },
      activity: {
        activityType: 'front_desk_note',
        title: 'Front desk note added',
        description: input.note,
        metadata: {
          entity_type: input.entityType,
          entity_id: input.entityId,
        },
      },
    }
  },
}
