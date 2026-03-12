import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const officioTasksAdapter: EntityAdapter = {
  entityType: 'tasks',
  targetTable: 'tasks',
  displayName: 'Tasks',
  sourceDisplayName: 'Officio Tasks',
  description: 'Import tasks from Officio linked to cases.',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Task ID',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'task_id'],
    },
    {
      sourceColumn: 'Case ID',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['case_id', 'caseId', 'Case'],
    },
    {
      sourceColumn: 'Task Name',
      targetColumn: 'title',
      required: true,
      aliases: ['task_name', 'Title', 'title', 'Name', 'name', 'Subject'],
    },
    {
      sourceColumn: 'Description',
      targetColumn: 'description',
      required: false,
      aliases: ['description', 'Details', 'Notes'],
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
      sourceColumn: 'Status',
      targetColumn: 'status',
      required: false,
      aliases: ['status', 'Task Status'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'completed' || lower === 'done' || lower === 'complete') return 'completed'
        if (lower === 'in progress') return 'in_progress'
        return 'todo'
      },
      defaultValue: 'todo',
    },
    {
      sourceColumn: 'Assigned To',
      targetColumn: '__assignee_name',
      required: false,
      aliases: ['assigned_to', 'Assignee'],
    },
    {
      sourceColumn: 'Created Date',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
