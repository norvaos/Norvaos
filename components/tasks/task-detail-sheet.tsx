'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  X,
  Loader2,
  Calendar as CalendarIcon,
  User,
  Briefcase,
  Users as UsersIcon,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Paperclip,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useTask, useUpdateTask, useCompleteTask } from '@/lib/queries/tasks'
import { PRIORITIES, TASK_STATUSES } from '@/lib/utils/constants'
import { formatDate, isOverdue } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { TaskForm } from '@/components/tasks/task-form'
import { TaskActivityLog } from '@/components/tasks/task-activity-log'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { DocumentUpload } from '@/components/shared/document-upload'
import type { TaskFormValues } from '@/lib/schemas/task'
import type { Database } from '@/lib/types/database'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type UserRow = Database['public']['Tables']['users']['Row']
type Matter = Database['public']['Tables']['matters']['Row']
type Contact = Database['public']['Tables']['contacts']['Row']

interface TaskDetailSheetProps {
  taskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function useTaskRelatedData(
  task: Database['public']['Tables']['tasks']['Row'] | undefined,
  tenantId: string
) {
  // Fetch assigned user
  const { data: assignedUser } = useQuery({
    queryKey: ['user', task?.assigned_to],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', task!.assigned_to!)
        .single()
      if (error) throw error
      return data as UserRow
    },
    enabled: !!task?.assigned_to,
  })

  // Fetch assigned-by user
  const { data: assignedByUser } = useQuery({
    queryKey: ['user', task?.assigned_by],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', task!.assigned_by!)
        .single()
      if (error) throw error
      return data as UserRow
    },
    enabled: !!task?.assigned_by && task?.assigned_by !== task?.assigned_to,
  })

  // Fetch matter
  const { data: matter } = useQuery({
    queryKey: ['matter', task?.matter_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('id', task!.matter_id!)
        .single()
      if (error) throw error
      return data as Pick<Matter, 'id' | 'title' | 'matter_number'>
    },
    enabled: !!task?.matter_id,
  })

  // Fetch contact
  const { data: contact } = useQuery({
    queryKey: ['contact', task?.contact_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('id', task!.contact_id!)
        .single()
      if (error) throw error
      return data as Pick<Contact, 'id' | 'first_name' | 'last_name' | 'email_primary'>
    },
    enabled: !!task?.contact_id,
  })

  // Fetch all task assignees
  const { data: assignees } = useQuery({
    queryKey: ['task-assignees', task?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_assignees')
        .select('*')
        .eq('task_id', task!.id)
      if (error) {
        // Table may not exist yet
        return []
      }

      if (!data || data.length === 0) return []

      // Fetch user details for each assignee
      const userIds = data.map((a: Record<string, unknown>) => a.user_id as string)
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', userIds)

      return (data as Record<string, unknown>[]).map((a) => ({
        ...a,
        user: (users ?? []).find((u: Record<string, unknown>) => u.id === a.user_id),
      }))
    },
    enabled: !!task?.id,
  })

  return { assignedUser, assignedByUser, matter, contact, assignees: assignees ?? [] }
}

function getUserDisplayName(user: { first_name: string | null; last_name: string | null; email?: string | null } | undefined): string {
  if (!user) return 'Unassigned'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return name || user.email || 'Unknown'
}

function getStatusConfig(status: string) {
  const found = TASK_STATUSES.find((s) => s.value === status)
  return found ?? { label: status, value: status, color: '#6b7280' }
}

function getPriorityConfig(priority: string) {
  const found = PRIORITIES.find((p) => p.value === priority)
  return found ?? { label: priority, value: priority, color: '#6b7280' }
}

export function TaskDetailSheet({ taskId, open, onOpenChange }: TaskDetailSheetProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const tenantId = tenant?.id ?? ''
  const { data: task, isLoading } = useTask(taskId ?? '')
  const { assignedUser, assignedByUser, matter, contact, assignees } = useTaskRelatedData(task, tenantId)

  const updateTask = useUpdateTask()
  const completeTask = useCompleteTask()

  function handleClose() {
    setEditing(false)
    onOpenChange(false)
  }

  function handleComplete() {
    if (!task || !appUser) return
    if (task.status === 'done') {
      // Reopen
      updateTask.mutate({ id: task.id, status: 'not_started', completed_at: null, completed_by: null })
    } else {
      completeTask.mutate({ id: task.id, userId: appUser.id })
    }
  }

  async function handleEditSubmit(values: TaskFormValues) {
    if (!task) return
    await updateTask.mutateAsync({
      id: task.id,
      title: values.title,
      description: values.description ?? null,
      matter_id: values.matter_id ?? null,
      contact_id: values.contact_id ?? null,
      assigned_to: values.assigned_to ?? null,
      due_date: values.due_date ?? null,
      due_time: values.due_time ?? null,
      start_date: values.start_date ?? null,
      priority: values.priority,
      estimated_minutes: values.estimated_minutes ?? null,
      follow_up_days: values.follow_up_days ?? null,
      task_type: values.task_type,
      category: values.category,
      is_billable: values.is_billable ?? undefined,
      visibility: values.visibility,
      reminder_date: values.reminder_date ?? null,
    })
    setEditing(false)
  }

  function handleDelete() {
    if (!task) return
    updateTask.mutate({ id: task.id, status: 'cancelled' })
    setDeleteOpen(false)
    handleClose()
  }

  const isComplete = task?.status === 'done'
  const statusConfig = task ? getStatusConfig(task.status) : null
  const priorityConfig = task ? getPriorityConfig(task.priority) : null
  const taskOverdue = task?.due_date && !isComplete ? isOverdue(task.due_date) : false

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg">
                {isLoading ? <Skeleton className="h-6 w-48" /> : editing ? 'Edit Task' : 'Task Details'}
              </SheetTitle>
              {task && !editing && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <SheetDescription className="sr-only">
              {editing ? 'Edit task details' : 'View task details and manage status'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
            {isLoading ? (
              <TaskDetailSkeleton />
            ) : !task ? (
              <div className="py-12 text-center text-muted-foreground">
                Task not found
              </div>
            ) : editing ? (
              <div className="space-y-4">
                <TaskForm
                  mode="edit"
                  defaultValues={{
                    title: task.title,
                    description: task.description ?? '',
                    matter_id: task.matter_id,
                    contact_id: task.contact_id,
                    assigned_to: task.assigned_to,
                    due_date: task.due_date,
                    due_time: task.due_time,
                    start_date: task.start_date,
                    priority: task.priority as 'low' | 'medium' | 'high' | 'urgent',
                    estimated_minutes: task.estimated_minutes,
                    follow_up_days: task.follow_up_days,
                  }}
                  onSubmit={handleEditSubmit}
                  isLoading={updateTask.isPending}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Title & Status Actions */}
                <div>
                  <h3 className={cn(
                    'text-lg font-semibold',
                    isComplete && 'text-muted-foreground line-through'
                  )}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isComplete ? 'outline' : 'default'}
                    onClick={handleComplete}
                    disabled={completeTask.isPending}
                  >
                    {completeTask.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : isComplete ? (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {isComplete ? 'Reopen Task' : 'Mark Complete'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancel Task
                  </Button>
                </div>

                <Separator />

                {/* Details Grid */}
                <div className="space-y-4">
                  {/* Status */}
                  <DetailRow label="Status" icon={Circle}>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${statusConfig?.color}15`,
                        color: statusConfig?.color,
                        borderColor: `${statusConfig?.color}30`,
                      }}
                      className="border"
                    >
                      {statusConfig?.label}
                    </Badge>
                  </DetailRow>

                  {/* Priority */}
                  <DetailRow label="Priority" icon={AlertTriangle}>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${priorityConfig?.color}15`,
                        color: priorityConfig?.color,
                        borderColor: `${priorityConfig?.color}30`,
                      }}
                      className="border"
                    >
                      {priorityConfig?.label}
                    </Badge>
                  </DetailRow>

                  {/* Assigned To */}
                  <DetailRow label="Assigned To" icon={User}>
                    <div className="space-y-1">
                      <span className="text-sm font-medium">
                        {getUserDisplayName(assignedUser)}
                      </span>
                      {assignees.length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {assignees.map((a: Record<string, unknown>) => (
                            <Badge key={a.id as string} variant="outline" className="text-xs">
                              {getUserDisplayName(a.user as { first_name: string | null; last_name: string | null })}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </DetailRow>

                  {/* Assigned By */}
                  {task.assigned_by && (
                    <DetailRow label="Assigned By" icon={UsersIcon}>
                      <span className="text-sm">
                        {assignedByUser
                          ? getUserDisplayName(assignedByUser)
                          : task.assigned_by === task.assigned_to
                            ? getUserDisplayName(assignedUser)
                            : 'Loading...'}
                      </span>
                    </DetailRow>
                  )}

                  {/* Due Date */}
                  <DetailRow label="Due Date" icon={CalendarIcon}>
                    {task.due_date ? (
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm', taskOverdue && 'text-destructive font-medium')}>
                          {formatDate(task.due_date)}
                        </span>
                        {task.due_time && (
                          <span className="text-xs text-muted-foreground">
                            at {task.due_time}
                          </span>
                        )}
                        {taskOverdue && (
                          <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </DetailRow>

                  {/* Start Date */}
                  {task.start_date && (
                    <DetailRow label="Start Date" icon={CalendarIcon}>
                      <span className="text-sm">{formatDate(task.start_date)}</span>
                    </DetailRow>
                  )}

                  {/* Estimated Time */}
                  {task.estimated_minutes && (
                    <DetailRow label="Estimated Time" icon={Clock}>
                      <span className="text-sm">
                        {task.estimated_minutes >= 60
                          ? `${Math.floor(task.estimated_minutes / 60)}h ${task.estimated_minutes % 60}m`
                          : `${task.estimated_minutes} minutes`}
                      </span>
                    </DetailRow>
                  )}

                  {/* Matter */}
                  {matter && (
                    <DetailRow label="Matter" icon={Briefcase}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{matter.title}</span>
                        {matter.matter_number && (
                          <span className="text-xs text-muted-foreground">{matter.matter_number}</span>
                        )}
                      </div>
                    </DetailRow>
                  )}

                  {/* Contact */}
                  {contact && (
                    <DetailRow label="Contact" icon={User}>
                      <span className="text-sm">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email_primary || 'Unknown'}
                      </span>
                    </DetailRow>
                  )}

                  {/* Follow-up Days */}
                  {task.follow_up_days && (
                    <DetailRow label="Follow-up" icon={RotateCcw}>
                      <span className="text-sm">
                        Auto-creates follow-up {task.follow_up_days} days after completion
                      </span>
                    </DetailRow>
                  )}
                </div>

                <Separator />

                {/* Timestamps */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Created {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</p>
                  {task.completed_at && (
                    <p>Completed {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true })}</p>
                  )}
                  <p>Last updated {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</p>
                </div>

                <Separator />

                {/* Files & Attachments */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium">Files & Attachments</h4>
                  </div>
                  {tenantId && (
                    <DocumentUpload
                      entityType="task"
                      entityId={task.id}
                      tenantId={tenantId}
                    />
                  )}
                </div>

                <Separator />

                {/* Activity & Change History */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Activity & History</h4>
                  {tenantId && (
                    <MiniTimeline
                      tenantId={tenantId}
                      entityType="task"
                      entityId={task.id}
                      limit={10}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this task? This will mark it as cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Task</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Detail row helper
// ---------------------------------------------------------------------------
function DetailRow({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 min-w-[140px] shrink-0 pt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function TaskDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Separator />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
