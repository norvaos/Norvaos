'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getTranslations,
  t,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface PortalTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string | null
  due_date: string | null
  category: string | null
  task_type: string | null
  created_at: string
}

interface PortalTasksProps {
  token: string
  primaryColor?: string
  language?: PortalLocale
}

// ── Status Helpers ───────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  todo: 0,
  in_progress: 1,
  completed: 2,
}

function getStatusGroup(status: string): string {
  if (status === 'completed' || status === 'done') return 'completed'
  if (status === 'in_progress' || status === 'active') return 'in_progress'
  return 'todo'
}

function getStatusLabel(
  status: string,
  tr: ReturnType<typeof getTranslations>,
): string {
  const group = getStatusGroup(status)
  if (group === 'completed') return tr.task_status_completed ?? 'Completed'
  if (group === 'in_progress') return tr.task_status_in_progress ?? 'In Progress'
  return tr.task_status_todo ?? 'To Do'
}

function getStatusDot(status: string): string {
  const group = getStatusGroup(status)
  if (group === 'completed') return 'bg-green-500'
  if (group === 'in_progress') return 'bg-blue-500'
  return 'bg-slate-400'
}

function getPriorityLabel(
  priority: string | null,
  tr: ReturnType<typeof getTranslations>,
): string | null {
  if (!priority) return null
  const p = priority.toLowerCase()
  if (p === 'high' || p === 'urgent') return tr.task_priority_high ?? 'High'
  if (p === 'medium' || p === 'normal') return tr.task_priority_medium ?? 'Medium'
  if (p === 'low') return tr.task_priority_low ?? 'Low'
  return priority
}

function getPriorityColor(priority: string | null): string {
  if (!priority) return ''
  const p = priority.toLowerCase()
  if (p === 'high' || p === 'urgent') return 'text-red-600 bg-red-50 border-red-200'
  if (p === 'medium' || p === 'normal') return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-slate-500 bg-slate-50 border-slate-200'
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalTasks({ token, primaryColor, language = 'en' }: PortalTasksProps) {
  const tr = getTranslations(language)
  const [tasks, setTasks] = useState<PortalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await fetch(`/api/portal/${token}/tasks`)
        if (!res.ok) throw new Error('Failed to fetch tasks')
        const data = await res.json()
        setTasks(data.tasks ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchTasks()
  }, [token])

  const handleStatusUpdate = useCallback(async (taskId: string, newStatus: string) => {
    if (updatingId) return
    setUpdatingId(taskId)

    // Optimistic update
    const prevTasks = tasks
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    )

    try {
      track('task_status_changed', { task_id: taskId, new_status: newStatus })

      const res = await fetch(`/api/portal/${token}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update')
    } catch {
      // Rollback on failure
      setTasks(prevTasks)
    } finally {
      setUpdatingId(null)
    }
  }, [updatingId, tasks, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-10 w-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">{tr.error_generic}</p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">{tr.no_tasks ?? 'No tasks assigned at this time.'}</p>
      </div>
    )
  }

  // Group tasks by status
  const grouped = tasks.reduce<Record<string, PortalTask[]>>((acc, task) => {
    const group = getStatusGroup(task.status)
    if (!acc[group]) acc[group] = []
    acc[group].push(task)
    return acc
  }, {})

  const groupOrder = ['todo', 'in_progress', 'completed']

  return (
    <div className="space-y-6">
      {groupOrder.map((groupKey) => {
        const groupTasks = grouped[groupKey]
        if (!groupTasks || groupTasks.length === 0) return null

        return (
          <div key={groupKey} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${getStatusDot(groupKey)}`} />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {getStatusLabel(groupKey, tr)} ({groupTasks.length})
              </h4>
            </div>

            <div className="space-y-2">
              {groupTasks.map((task) => {
                const overdue = groupKey !== 'completed' && isOverdue(task.due_date)
                const priorityLabel = getPriorityLabel(task.priority, tr)

                return (
                  <div
                    key={task.id}
                    className={`rounded-lg border bg-white p-4 ${
                      overdue ? 'border-red-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          groupKey === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'
                        }`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {priorityLabel && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPriorityColor(task.priority)}`}>
                            {priorityLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Due date + action button row */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {task.due_date ? (
                        <div className="flex items-center gap-1.5">
                          <svg className={`h-3 w-3 ${overdue ? 'text-red-500' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span className={`text-[11px] font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                            {overdue && `${tr.task_overdue ?? 'Overdue'} · `}
                            {t(tr.task_due_date ?? 'Due {date}', { date: formatDate(task.due_date) })}
                          </span>
                        </div>
                      ) : <div />}

                      {/* Action buttons */}
                      {groupKey === 'todo' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(task.id, 'in_progress')}
                            disabled={updatingId === task.id}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                          >
                            {updatingId === task.id ? (
                              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              tr.task_start ?? 'Start'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(task.id, 'completed')}
                            disabled={updatingId === task.id}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: primaryColor || '#2563eb' }}
                          >
                            {updatingId === task.id ? (
                              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              tr.task_complete ?? 'Mark Complete'
                            )}
                          </button>
                        </div>
                      )}
                      {groupKey === 'in_progress' && (
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(task.id, 'completed')}
                          disabled={updatingId === task.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: primaryColor || '#2563eb' }}
                        >
                          {updatingId === task.id ? (
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            tr.task_complete ?? 'Mark Complete'
                          )}
                        </button>
                      )}
                      {groupKey === 'completed' && (
                        <svg className="h-4 w-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
