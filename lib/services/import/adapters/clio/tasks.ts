import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioTasksAdapter: EntityAdapter = {
  entityType: 'tasks',
  targetTable: 'tasks',
  displayName: 'Tasks',
  sourceDisplayName: 'Clio Tasks',
  description: 'Import tasks from Clio linked to matters.',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'Task ID'],
    },
    {
      sourceColumn: 'Matter',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter', 'Matter ID', 'matter_id', 'Matter Name'],
    },
    {
      sourceColumn: 'Name',
      targetColumn: 'title',
      required: true,
      aliases: ['name', 'Title', 'title', 'Subject', 'subject', 'Task Name'],
    },
    {
      sourceColumn: 'Description',
      targetColumn: 'description',
      required: false,
      aliases: ['description', 'Details', 'Body', 'body'],
    },
    {
      sourceColumn: 'Due Date',
      targetColumn: 'due_date',
      required: false,
      aliases: ['due_date', 'Deadline', 'deadline'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'Priority',
      targetColumn: 'priority',
      required: false,
      aliases: ['priority'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'high' || lower === 'urgent') return 'high'
        if (lower === 'low') return 'low'
        return 'medium'
      },
      defaultValue: 'medium',
    },
    {
      sourceColumn: 'Status',
      targetColumn: 'status',
      required: false,
      aliases: ['status', 'Completed'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'complete' || lower === 'completed' || lower === 'done' || lower === 'true') return 'completed'
        if (lower === 'in progress' || lower === 'in_progress') return 'in_progress'
        return 'todo'
      },
      defaultValue: 'todo',
    },
    {
      sourceColumn: 'Assignee',
      targetColumn: '__assignee_name',
      required: false,
      aliases: ['assignee', 'Assigned To', 'assigned_to'],
    },
    {
      sourceColumn: 'Created',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
