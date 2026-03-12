import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const officioNotesAdapter: EntityAdapter = {
  entityType: 'notes',
  targetTable: 'notes',
  displayName: 'Notes',
  sourceDisplayName: 'Officio Notes',
  description: 'Import notes from Officio linked to cases.',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Note ID',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'note_id'],
    },
    {
      sourceColumn: 'Case ID',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['case_id', 'caseId', 'Case'],
    },
    {
      sourceColumn: 'Content',
      targetColumn: 'content',
      required: true,
      aliases: ['content', 'Body', 'body', 'Note', 'note', 'Text', 'text', 'Description'],
    },
    {
      sourceColumn: 'Type',
      targetColumn: 'note_type',
      required: false,
      aliases: ['type', 'Note Type', 'Category'],
      defaultValue: 'general',
    },
    {
      sourceColumn: 'Created Date',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created', 'Date'],
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
