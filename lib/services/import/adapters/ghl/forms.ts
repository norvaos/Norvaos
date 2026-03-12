import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlFormsAdapter: EntityAdapter = {
  entityType: 'forms',
  targetTable: 'notes',
  displayName: 'Form Submissions',
  sourceDisplayName: 'GHL Form Submissions',
  description: 'Import form submissions from Go High Level as notes linked to contacts.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
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
      sourceColumn: 'formName',
      targetColumn: 'content',
      required: true,
      aliases: ['form_name', 'Form Name'],
      transform: (val, row) => {
        const parts = [`Form Submission: ${val}`]
        if (row.name) parts.push(`Name: ${row.name}`)
        if (row.email) parts.push(`Email: ${row.email}`)
        if (row.otherFields) {
          try {
            const fields = JSON.parse(row.otherFields)
            for (const [key, value] of Object.entries(fields)) {
              parts.push(`${key}: ${value}`)
            }
          } catch {
            // Ignore parse errors
          }
        }
        return parts.join('\n')
      },
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Created At', 'date_added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
