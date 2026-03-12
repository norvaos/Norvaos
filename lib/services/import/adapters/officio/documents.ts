import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const officioDocumentsAdapter: EntityAdapter = {
  entityType: 'documents',
  targetTable: 'documents',
  displayName: 'Documents',
  sourceDisplayName: 'Officio Documents',
  description: 'Import document metadata from Officio (file references, not file contents).',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Document ID',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'document_id'],
    },
    {
      sourceColumn: 'Case ID',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['case_id', 'caseId', 'Case'],
    },
    {
      sourceColumn: 'File Name',
      targetColumn: 'file_name',
      required: true,
      aliases: ['file_name', 'Name', 'name', 'Title', 'Document Name'],
    },
    {
      sourceColumn: 'Category',
      targetColumn: 'category',
      required: false,
      aliases: ['category', 'Document Type', 'Type', 'type'],
    },
    {
      sourceColumn: 'Created Date',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created', 'Uploaded Date'],
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
