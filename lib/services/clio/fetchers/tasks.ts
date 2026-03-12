import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioTask {
  id: number
  name?: string
  description?: string
  priority?: string
  status?: string
  due_at?: string
  completed_at?: string
  assignee?: { id: number; name: string; type: string }
  assigner?: { id: number; name: string }
  matter?: { id: number; display_number: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioTasks(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const tasks = await clioPaginateAll<ClioTask>(
    connectionId, admin, 'tasks',
    ['id', 'name', 'description', 'priority', 'status', 'due_at', 'completed_at', 'assignee', 'assigner', 'matter', 'created_at', 'updated_at'],
  )

  const rows = tasks.map((t) => ({
    __source_id: String(t.id),
    name: t.name ?? '',
    description: t.description ?? '',
    priority: t.priority ?? '',
    status: t.status ?? '',
    dueAt: t.due_at ?? '',
    completedAt: t.completed_at ?? '',
    assigneeName: t.assignee?.name ?? '',
    assignerName: t.assigner?.name ?? '',
    matterId: t.matter ? String(t.matter.id) : '',
    createdAt: t.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
