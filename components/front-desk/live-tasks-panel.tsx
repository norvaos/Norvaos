'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFrontDeskTasks, useFrontDeskStaffList, frontDeskKeys } from '@/lib/queries/front-desk-queries'
import { useRealtime } from '@/lib/hooks/use-realtime'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { ListTodo, Clock, User, Users, AlertCircle, CheckCircle2, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ──────────────────────────────────────────────────────────────────

interface LiveTasksQueueProps {
  onCompleteTask: (taskId: string) => void
  onSelectContact?: (contactId: string) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'bg-slate-50 text-slate-600 border-slate-200' },
  working_on_it: { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  stuck: { label: 'Stuck', color: 'bg-red-50 text-red-700 border-red-200' },
}

const PRIORITY_INDICATORS: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-300' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' },
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRotIndicator(dueDate: string | null, dueTime: string | null): {
  dot: string
  label: string
  className: string
} {
  if (!dueDate) {
    return { dot: '', label: '', className: '' }
  }

  const now = new Date()
  let dueDateTime: Date

  if (dueTime) {
    dueDateTime = new Date(`${dueDate}T${dueTime}`)
  } else {
    // If no time, treat as end of day
    dueDateTime = new Date(`${dueDate}T23:59:59`)
  }

  const diffMs = dueDateTime.getTime() - now.getTime()
  const twoHoursMs = 2 * 60 * 60 * 1000

  if (diffMs < 0) {
    // Overdue
    return {
      dot: 'bg-red-500',
      label: 'Overdue',
      className: 'text-red-600',
    }
  }

  if (diffMs <= twoHoursMs) {
    // Due within 2 hours
    return {
      dot: 'bg-amber-400',
      label: 'Due soon',
      className: 'text-amber-600',
    }
  }

  // Time remaining
  return {
    dot: 'bg-emerald-500',
    label: '',
    className: '',
  }
}

function formatDueDateTime(dueDate: string | null, dueTime: string | null): string {
  if (!dueDate) return 'No due date'

  const dateStr = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  if (!dueTime) return dateStr

  const timeStr = new Date(`1970-01-01T${dueTime}`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${dateStr} at ${timeStr}`
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Live Tasks Queue for Zone 3 of the Front Desk home screen.
 * Shows front desk tasks with rot (overdue/due-soon) indicators.
 * Auto-refreshes every 30 seconds via the query hook.
 */
export function LiveTasksQueue({ onCompleteTask, onSelectContact }: LiveTasksQueueProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const currentUserId = appUser?.id ?? ''
  const [staffFilter, setStaffFilter] = useState<string>('__mine')
  const queryClient = useQueryClient()

  const { data: tasks, isLoading } = useFrontDeskTasks(tenantId, currentUserId, staffFilter)
  const { data: staffList } = useFrontDeskStaffList(tenantId)

  // ── Realtime: instantly refresh when any task changes in this tenant ──────
  // Covers: new task assigned to me (INSERT), task updated (UPDATE status etc.)
  // Invalidate ALL task variants (my tasks, all tasks, staff-filtered) at once
  function invalidateTasks() {
    // Partial key match: any query starting with ['front-desk', 'tasks', tenantId, ...]
    queryClient.invalidateQueries({
      queryKey: [...frontDeskKeys.all, 'tasks', tenantId],
      exact: false,
    })
  }

  useRealtime<Record<string, unknown>>({
    table: 'tasks',
    event: '*',
    filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
    enabled: !!tenantId,
    onInsert: invalidateTasks,
    onUpdate: invalidateTasks,
    onDelete: invalidateTasks,
  })

  const filteredTasks = tasks ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Live Tasks
            {filteredTasks.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {filteredTasks.length}
              </Badge>
            )}
          </CardTitle>

          {/* Staff Filter */}
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-40 text-sm">
              <Users className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="My Tasks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__mine">My Tasks</SelectItem>
              <SelectItem value="__all">All Tasks</SelectItem>
              {(staffList ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No open tasks right now.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const rot = getRotIndicator(task.due_date, task.due_time)
              const status = STATUS_LABELS[task.status] ?? STATUS_LABELS.not_started
              const priority = task.priority
                ? PRIORITY_INDICATORS[task.priority] ?? null
                : null

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  {/* Left: rot dot + task info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Rot indicator dot */}
                    <div className="flex-shrink-0">
                      {rot.dot ? (
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${rot.dot}`}
                          title={rot.label || 'On track'}
                        />
                      ) : (
                        <span className="inline-block w-2.5 h-2.5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Task title */}
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {task.title}
                      </p>

                      {/* Due date/time + rot label */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>{formatDueDateTime(task.due_date, task.due_time)}</span>
                        </div>
                        {rot.label && (
                          <span className={`text-xs font-medium ${rot.className}`}>
                            {rot.label}
                          </span>
                        )}
                      </div>

                      {/* Contact + Matter + Assigned To row */}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {task.contact_name && task.contact_id && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                            onClick={() => onSelectContact?.(task.contact_id!)}
                            disabled={!onSelectContact}
                          >
                            <User className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{task.contact_name}</span>
                          </button>
                        )}
                        {task.matter_number && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Briefcase className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{task.matter_number}</span>
                          </div>
                        )}
                        {task.assigned_to_name && task.assigned_to !== currentUserId && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-500 border-slate-200">
                            Assigned to: {task.assigned_to_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: badges + complete button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Priority badge */}
                    {priority && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priority.color}`}>
                        {priority.label}
                      </Badge>
                    )}

                    {/* Status badge */}
                    <Badge variant="outline" className={status.color}>
                      {status.label}
                    </Badge>

                    {/* Complete button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                      onClick={() => onCompleteTask(task.id)}
                      title="Mark as complete"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Overdue warning banner */}
        {filteredTasks.filter((t) => {
          const rot = getRotIndicator(t.due_date, t.due_time)
          return rot.label === 'Overdue'
        }).length > 0 && (
          <div className="flex items-center gap-2 mt-3 p-2 bg-red-50 rounded-md border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">
              {filteredTasks.filter((t) => getRotIndicator(t.due_date, t.due_time).label === 'Overdue').length} overdue{' '}
              {filteredTasks.filter((t) => getRotIndicator(t.due_date, t.due_time).label === 'Overdue').length === 1 ? 'task' : 'tasks'}{' '}
              require attention
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
