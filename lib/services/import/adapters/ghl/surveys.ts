import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlSurveysAdapter: EntityAdapter = {
  entityType: 'surveys',
  targetTable: 'notes',
  displayName: 'Survey Submissions',
  sourceDisplayName: 'GHL Survey Submissions',
  description: 'Import survey submissions from Go High Level as notes linked to contacts.',
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
      sourceColumn: 'surveyName',
      targetColumn: 'content',
      required: true,
      aliases: ['survey_name', 'Survey Name'],
      transform: (val, row) => {
        const parts = [`Survey Response: ${val}`]
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
