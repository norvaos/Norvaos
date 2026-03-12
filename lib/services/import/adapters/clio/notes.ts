import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioNotesAdapter: EntityAdapter = {
  entityType: 'notes',
  targetTable: 'notes',
  displayName: 'Notes',
  sourceDisplayName: 'Clio Notes',
  description: 'Import notes from Clio linked to matters or contacts.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID'],
    },
    {
      sourceColumn: 'Matter',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter', 'Matter ID', 'matter_id'],
    },
    {
      sourceColumn: 'Contact',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact', 'Contact ID', 'contact_id'],
    },
    {
      sourceColumn: 'Detail',
      targetColumn: 'content',
      required: true,
      aliases: ['detail', 'Body', 'body', 'Content', 'content', 'Note', 'note', 'Text'],
    },
    {
      sourceColumn: 'Type',
      targetColumn: 'note_type',
      required: false,
      aliases: ['type', 'Note Type', 'Category'],
      defaultValue: 'general',
    },
    {
      sourceColumn: 'Created',
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
