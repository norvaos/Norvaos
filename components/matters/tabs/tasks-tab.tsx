'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { useTaskTemplates, useApplyTemplate } from '@/lib/queries/task-templates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  ListTodo,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { TaskCreateDialog } from '@/components/tasks/task-create-dialog'
import { TaskDetailSheet } from '@/components/tasks/task-detail-sheet'
import {
  getUserName,
  getTaskStatusConfig,
  getPriorityConfig,
  type UserRow,
  type Task,
} from './matter-tab-helpers'

// ── Local hook ────────────────────────────────────────────────────────────────

function useMatterTasks(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-tasks', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Task[]
    },
    enabled: !!matterId && !!tenantId,
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TasksTab({
  matterId,
  tenantId,
  users,
  practiceAreaId,
  contactId,
}: {
  matterId: string
  tenantId: string
  users: UserRow[] | undefined
  practiceAreaId: string | null
  contactId?: string
}) {
  const { appUser } = useUser()
  const { data: rawTasks, isLoading } = useMatterTasks(matterId, tenantId)

  // Sort unassigned tasks to the top
  const tasks = useMemo(() => {
    if (!rawTasks) return rawTasks
    return [...rawTasks].sort((a, b) => {
      if (!a.assigned_to && b.assigned_to) return -1
      if (a.assigned_to && !b.assigned_to) return 1
      return 0
    })
  }, [rawTasks])
  const { data: templates } = useTaskTemplates(tenantId)
  const applyTemplate = useApplyTemplate()

  const [createOpen, setCreateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Filter templates by practice area (memoized to avoid array recreation)
  const filteredTemplates = useMemo(
    () => templates?.filter(
      (t) => !practiceAreaId || !t.practice_area_id || t.practice_area_id === practiceAreaId
    ) ?? [],
    [templates, practiceAreaId]
  )

  function handleTaskClick(taskId: string) {
    setSelectedTaskId(taskId)
    setDetailOpen(true)
  }

  function handleApplyTemplate(templateId: string) {
    if (!appUser) return
    applyTemplate.mutate(
      {
        tenantId,
        matterId,
        templateId,
        createdBy: appUser.id,
      },
      {
        onSuccess: () => {
          setTemplateOpen(false)
        },
      }
    )
  }

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '' : `${tasks?.length ?? 0} tasks`}
        </p>
        <div className="flex items-center gap-2">
          {filteredTemplates.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
              <ListChecks className="mr-1.5 size-4" />
              Apply Template
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Create Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTodo className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">
              No tasks
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no tasks associated with this matter yet.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {filteredTemplates.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTemplateOpen(true)}
                >
                  <ListChecks className="mr-1.5 size-4" />
                  Apply Template
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 size-4" />
                Create First Task
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const taskStatusConfig = getTaskStatusConfig(task.status ?? '')
                const taskPriorityConfig = getPriorityConfig(task.priority ?? '')
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {task.status === 'done' && (
                          <CheckCircle2 className="size-4 text-green-500" />
                        )}
                        {task.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${taskStatusConfig.color}15`,
                          color: taskStatusConfig.color,
                          borderColor: `${taskStatusConfig.color}30`,
                        }}
                        className="border"
                      >
                        {taskStatusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${taskPriorityConfig.color}15`,
                          color: taskPriorityConfig.color,
                          borderColor: `${taskPriorityConfig.color}30`,
                        }}
                        className="border"
                      >
                        {taskPriorityConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {task.due_date ? (
                        <div className="flex items-center gap-1">
                          {formatDate(task.due_date)}
                          {new Date(task.due_date) < new Date() &&
                            task.status !== 'completed' &&
                            task.status !== 'cancelled' && (
                              <AlertTriangle className="size-3.5 text-red-500" />
                            )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {task.assigned_to ? (
                        getUserName(task.assigned_to, users)
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-200 bg-amber-50">
                          Unassigned
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Task Dialog (pre-filled with this matter + primary contact) */}
      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matterId={matterId}
        contactId={contactId}
      />

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Apply Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Task Template</DialogTitle>
            <DialogDescription>
              Select a template to create tasks for this matter. Tasks will be created with due dates relative to today.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 py-2">
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No templates available. Create templates in Settings → Task Templates.
              </p>
            ) : (
              filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                  onClick={() => handleApplyTemplate(template.id)}
                  disabled={applyTemplate.isPending}
                >
                  <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{template.name}</p>
                    {template.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                  {applyTemplate.isPending && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
