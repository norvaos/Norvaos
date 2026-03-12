import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlNotesAdapter: EntityAdapter = {
  entityType: 'notes',
  targetTable: 'notes',
  displayName: 'Notes',
  sourceDisplayName: 'GHL Notes',
  description: 'Import notes from Go High Level linked to contacts.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: 'id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Contact ID'],
    },
    {
      sourceColumn: 'body',
      targetColumn: 'content',
      required: true,
      aliases: ['content', 'Content', 'note', 'Note', 'text', 'Text', 'description', 'Description'],
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['Created At', 'date_added', 'Date Added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.content) {
      errors.push('Note content is required.')
    }
    return errors
  },
}
