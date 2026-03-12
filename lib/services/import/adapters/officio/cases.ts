import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const officioCasesAdapter: EntityAdapter = {
  entityType: 'matters',
  targetTable: 'matters',
  displayName: 'Cases',
  sourceDisplayName: 'Officio Cases',
  description: 'Import immigration cases from Officio as matters.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: 'Case ID',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'case_id', 'caseId'],
    },
    {
      sourceColumn: 'Client ID',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['client_id', 'clientId', 'Client'],
    },
    {
      sourceColumn: 'Case Name',
      targetColumn: 'title',
      required: true,
      aliases: ['case_name', 'Title', 'title', 'Name', 'name', 'Description', 'Case Title'],
    },
    {
      sourceColumn: 'Case Type',
      targetColumn: '__case_type_name',
      required: false,
      aliases: ['case_type', 'Type', 'type', 'Immigration Category', 'Visa Type'],
    },
    {
      sourceColumn: 'File Number',
      targetColumn: 'matter_number',
      required: false,
      aliases: ['file_number', 'File No', 'Reference Number', 'Case Number'],
    },
    {
      sourceColumn: 'Status',
      targetColumn: 'status',
      required: false,
      aliases: ['status', 'Case Status'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'active' || lower === 'open' || lower === 'in progress') return 'active'
        if (lower === 'closed' || lower === 'completed' || lower === 'approved') return 'closed'
        return 'active'
      },
      defaultValue: 'active',
    },
    {
      sourceColumn: 'Date Opened',
      targetColumn: 'date_opened',
      required: false,
      aliases: ['date_opened', 'Open Date', 'Created Date', 'Start Date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : new Date().toISOString().split('T')[0]
      },
    },
    {
      sourceColumn: 'Date Closed',
      targetColumn: 'date_closed',
      required: false,
      aliases: ['date_closed', 'Close Date', 'End Date', 'Completion Date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'Assigned To',
      targetColumn: '__responsible_lawyer_name',
      required: false,
      aliases: ['assigned_to', 'Lawyer', 'Consultant', 'RCIC', 'Agent'],
    },
    {
      sourceColumn: 'Notes',
      targetColumn: 'description',
      required: false,
      aliases: ['notes', 'Details', 'Case Notes'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.title) {
      errors.push('Case name/title is required.')
    }
    return errors
  },
}
