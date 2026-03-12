import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlTasksAdapter: EntityAdapter = {
  entityType: 'tasks',
  targetTable: 'tasks',
  displayName: 'Tasks',
  sourceDisplayName: 'GHL Tasks',
  description: 'Import tasks from Go High Level linked to contacts.',
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
      sourceColumn: 'title',
      targetColumn: 'title',
      required: true,
      aliases: ['Title', 'name', 'Name', 'subject', 'Subject', 'task_name'],
    },
    {
      sourceColumn: 'body',
      targetColumn: 'description',
      required: false,
      aliases: ['description', 'Description', 'notes', 'Notes', 'details'],
    },
    {
      sourceColumn: 'dueDate',
      targetColumn: 'due_date',
      required: false,
      aliases: ['due_date', 'Due Date', 'deadline', 'Deadline'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'status',
      targetColumn: 'status',
      required: false,
      aliases: ['Status', 'completed'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'completed' || lower === 'done' || lower === 'true') return 'completed'
        return 'todo'
      },
      defaultValue: 'todo',
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['Created At', 'date_added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
