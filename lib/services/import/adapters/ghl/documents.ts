import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlDocumentsAdapter: EntityAdapter = {
  entityType: 'documents',
  targetTable: 'documents',
  displayName: 'Documents',
  sourceDisplayName: 'GHL Documents',
  description: 'Import document metadata from Go High Level (file references only, not file content).',
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'title',
      required: true,
      aliases: ['Name', 'title', 'Title', 'filename', 'Filename'],
    },
    {
      sourceColumn: 'url',
      targetColumn: 'external_url',
      required: false,
      aliases: ['URL', 'link', 'Link', 'file_url'],
    },
    {
      sourceColumn: 'type',
      targetColumn: 'file_type',
      required: false,
      aliases: ['Type', 'file_type', 'mime_type'],
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Created At', 'date_added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.title) {
      errors.push('Document name/title is required.')
    }
    return errors
  },
}
