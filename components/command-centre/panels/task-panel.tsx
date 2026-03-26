'use client'

import { useState, useMemo, useCallback } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useCreateTask, useCompleteTask, useUpdateTask } from '@/lib/queries/tasks'
import { useTaskTemplates } from '@/lib/queries/task-templates'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatFullName, formatDate } from '@/lib/utils/formatters'
import { TaskDetailSheet } from '@/components/tasks/task-detail-sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ListTodo,
  Plus,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CalendarPlus,
  ClipboardList,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']

// ─── Helpers ────────────────────────────────────────────────────────

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date(new Date().toDateString())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'

  return formatDate(d)
}

function groupTasks(tasks: Task[]) {
  const today = new Date(new Date().toDateString())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const groups: { label: string; tasks: Task[]; color: string }[] = [
    { label: 'Overdue', tasks: [], color: 'text-red-600' },
    { label: 'Today', tasks: [], color: 'text-blue-600' },
    { label: 'Upcoming', tasks: [], color: 'text-slate-600' },
    { label: 'No Date', tasks: [], color: 'text-slate-400' },
  ]

  for (const task of tasks) {
    if (!task.due_date) {
      groups[3].tasks.push(task)
    } else {
      const d = new Date(task.due_date)
      if (d < today) groups[0].tasks.push(task)
      else if (d.getTime() === today.getTime()) groups[1].tasks.push(task)
      else groups[2].tasks.push(task)
    }
  }

  return groups.filter((g) => g.tasks.length > 0)
}

// ─── Status config ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  not_started: '#c3c6d4',
  working_on_it: '#fdab3d',
  stuck: '#e2445c',
  done: '#00c875',
  cancelled: '#6b7280',
}

// ─── Component ──────────────────────────────────────────────────────

export function TaskPanel() {
  const { tenantId, userId, entityId, contact, lead, users } = useCommandCentre()

  // Fetch tasks for the contact (linking tasks to leads via contact_id)
  const contactId = contact?.id ?? ''
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', 'contact', contactId, tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .eq('is_deleted', false)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return data as Task[]
    },
    enabled: !!contactId && !!tenantId,
  })

  const createTask = useCreateTask()
  const completeTask = useCompleteTask()
  const updateTask = useUpdateTask()
  const queryClient = useQueryClient()

  // Task templates
  const { data: templates } = useTaskTemplates(tenantId)
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false)
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false)

  // State
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState(userId)
  const [showAddRow, setShowAddRow] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Active (non-done) tasks sorted by due date
  const activeTasks = useMemo(() => {
    if (!tasksData) return []
    return tasksData
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled' && !t.is_deleted)
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      })
  }, [tasksData])

  const groups = useMemo(() => groupTasks(activeTasks), [activeTasks])

  // Create task handler
  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return

    try {
      await createTask.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId || null,
        title: newTitle.trim(),
        due_date: newDueDate || null,
        assigned_to: newAssignee || null,
        assigned_by: userId,
        priority: 'medium',
        status: 'not_started',
        created_via: 'manual',
        created_by: userId,
      })
      setNewTitle('')
      setNewDueDate('')
      setShowAddRow(false)
    } catch {
      toast.error('Failed to create task')
    }
  }, [newTitle, newDueDate, newAssignee, tenantId, contactId, userId, createTask])

  // Toggle complete
  const handleToggleComplete = useCallback(
    async (task: Task) => {
      if (task.status === 'done') {
        await updateTask.mutateAsync({ id: task.id, status: 'not_started', completed_at: null, completed_by: null })
      } else {
        await completeTask.mutateAsync({ id: task.id, userId })
      }
    },
    [completeTask, updateTask, userId]
  )

  // Follow-up shortcut
  const handleScheduleFollowUp = useCallback(() => {
    const contactName = contact
      ? formatFullName(contact.first_name, contact.last_name) || 'client'
      : 'client'

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    setNewTitle(`Follow up with ${contactName}`)
    setNewDueDate(tomorrowStr)
    setShowAddRow(true)
  }, [contact])

  // Apply template  -  create tasks from template items linked to contact
  const handleApplyTemplate = useCallback(async (templateId: string, templateName: string) => {
    if (!contactId) return
    setIsApplyingTemplate(true)
    try {
      const supabase = createClient()
      const { data: items, error } = await supabase
        .from('task_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      if (!items || items.length === 0) {
        toast.error('Template has no items')
        return
      }

      const today = new Date()
      const tasksToCreate = items.map((item) => {
        const dueDate = item.days_offset
          ? new Date(today.getTime() + item.days_offset * 86400000)
              .toISOString()
              .split('T')[0]
          : null
        return {
          tenant_id: tenantId,
          contact_id: contactId,
          title: item.title,
          description: item.description ?? undefined,
          priority: item.priority ?? 'medium',
          due_date: dueDate,
          assigned_to: userId,
          assigned_by: userId,
          created_by: userId,
          created_via: 'template' as const,
          status: 'not_started',
        }
      })

      await supabase.from('tasks').insert(tasksToCreate)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`Applied "${templateName}"  -  ${items.length} tasks created`)
      setTemplatePopoverOpen(false)
    } catch {
      toast.error('Failed to apply template')
    } finally {
      setIsApplyingTemplate(false)
    }
  }, [contactId, tenantId, userId, queryClient])

  // Toggle group collapse
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  // User name resolver
  const getUserName = (userId: string | null) => {
    if (!userId) return null
    const u = users.find((u) => u.id === userId)
    return u ? (u.first_name || u.last_name ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : u.email) : null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <ListTodo className="h-4 w-4" />
            Tasks
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {activeTasks.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* Templates picker */}
            {templates && templates.length > 0 && (
              <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-slate-500"
                    disabled={isApplyingTemplate}
                  >
                    {isApplyingTemplate ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ClipboardList className="h-3.5 w-3.5" />
                    )}
                    Templates
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2">
                  <p className="text-xs font-medium text-slate-500 px-2 pb-1.5">
                    Apply Template
                  </p>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {templates.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
                        onClick={() => handleApplyTemplate(tmpl.id, tmpl.name)}
                        disabled={isApplyingTemplate}
                      >
                        <p className="text-xs font-medium text-slate-700">{tmpl.name}</p>
                        {tmpl.description && (
                          <p className="text-[10px] text-slate-400 truncate">{tmpl.description}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-slate-500"
              onClick={handleScheduleFollowUp}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Follow-up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-slate-500"
              onClick={() => setShowAddRow(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Add task row */}
        {showAddRow && (
          <div className="flex flex-col gap-2 p-3 rounded-lg border border-blue-200 bg-blue-50/50 mb-3">
            <Input
              autoFocus
              placeholder="Task title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowAddRow(false)
              }}
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <TenantDateInput
                value={newDueDate}
                onChange={(iso) => setNewDueDate(iso)}
                className="h-8 text-xs w-36"
              />
              <Select value={newAssignee} onValueChange={setNewAssignee}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Assign..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleCreate}
                disabled={!newTitle.trim() || createTask.isPending}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setShowAddRow(false)
                  setNewTitle('')
                  setNewDueDate('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && activeTasks.length === 0 && !showAddRow && (
          <div className="text-center py-6">
            <ListTodo className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No active tasks</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs mt-2"
              onClick={() => setShowAddRow(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create a task
            </Button>
          </div>
        )}

        {/* Task groups */}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 text-xs font-medium mb-1 px-1',
                group.color
              )}
              onClick={() => toggleGroup(group.label)}
            >
              {collapsedGroups.has(group.label) ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {group.label}
              <span className="text-slate-400 font-normal">({group.tasks.length})</span>
            </button>

            {!collapsedGroups.has(group.label) && (
              <div className="space-y-0.5">
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 group cursor-pointer"
                    onClick={() => {
                      setSelectedTaskId(task.id)
                      setDetailOpen(true)
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleComplete(task)
                      }}
                    >
                      <Checkbox
                        checked={task.status === 'done'}
                        className="h-4 w-4"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm truncate',
                        task.status === 'done' && 'line-through text-slate-400'
                      )}>
                        {task.title}
                      </p>
                    </div>

                    {/* Status dot */}
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[task.status ?? ''] ?? '#c3c6d4' }}
                    />

                    {/* Due date */}
                    {task.due_date && (
                      <span
                        className={cn(
                          'text-[11px] shrink-0',
                          isOverdue(task.due_date) ? 'text-red-500 font-medium' : 'text-slate-400'
                        )}
                      >
                        {formatDueDate(task.due_date)}
                      </span>
                    )}

                    {/* Assigned initials */}
                    {task.assigned_to && (
                      <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
                        {getUserName(task.assigned_to)?.split(' ').map(n => n[0]).join('') ?? '?'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>

      {/* Task detail sheet */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </Card>
  )
}
