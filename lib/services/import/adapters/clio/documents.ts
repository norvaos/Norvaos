import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioDocumentsAdapter: EntityAdapter = {
  entityType: 'documents',
  targetTable: 'documents',
  displayName: 'Documents',
  sourceDisplayName: 'Clio Documents',
  description: 'Import document metadata from Clio (file references, not file contents).',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'Document ID'],
    },
    {
      sourceColumn: 'Matter',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter', 'Matter ID', 'matter_id'],
    },
    {
      sourceColumn: 'Name',
      targetColumn: 'file_name',
      required: true,
      aliases: ['name', 'Title', 'title', 'File Name', 'file_name', 'Document Name'],
    },
    {
      sourceColumn: 'Category',
      targetColumn: 'category',
      required: false,
      aliases: ['category', 'Document Category', 'Type', 'type'],
    },
    {
      sourceColumn: 'Content Type',
      targetColumn: 'file_type',
      required: false,
      aliases: ['content_type', 'MIME Type', 'File Type', 'file_type'],
    },
    {
      sourceColumn: 'Created',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created', 'Uploaded'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.file_name) {
      errors.push('Document name is required.')
    }
    return errors
  },
}
