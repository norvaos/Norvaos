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

  async execute({ input, supabase, tenantId, userId }) {
    // Also insert into the notes table so the note appears in the main
    // platform's Notes tab (which queries the notes table, not activities).
    await supabase.from('notes').insert({
      tenant_id: tenantId,
      contact_id: input.entityType === 'contact' ? input.entityId : null,
      user_id: userId ?? null,
      content: input.note,
      note_type: 'front_desk',
    })

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
        // Link activity to the contact so it appears in the contact timeline
        contactId: input.entityType === 'contact' ? input.entityId : undefined,
      },
    }
  },
}
