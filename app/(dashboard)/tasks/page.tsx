'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutList,
  Columns3,
  Calendar as CalendarIcon,
  GanttChart,
  Palette,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useTasks,
  useCompleteTask,
  useUpdateTask,
  useTaskDocumentCounts,
} from '@/lib/queries/tasks'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/lib/stores/ui-store'
import { useTaskTableStore } from '@/lib/stores/task-table-store'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { TaskCreateDialog } from '@/components/tasks/task-create-dialog'
import { TaskDetailSheet } from '@/components/tasks/task-detail-sheet'
import { TaskTable } from '@/components/tasks/task-table'
import { TaskTableToolbar } from '@/components/tasks/task-table-toolbar'
import { TaskTableGroupBy } from '@/components/tasks/task-table-group-by'
import { TaskKanbanView } from '@/components/tasks/task-kanban-view'
import { TaskCalendarView } from '@/components/tasks/task-calendar-view'
import { TaskGanttView } from '@/components/tasks/task-gantt-view'
import { ConditionalColorDialog } from '@/components/tasks/conditional-color-dialog'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

// View config
const VIEWS = [
  { key: 'table', label: 'Table', icon: LayoutList },
  { key: 'kanban', label: 'Kanban', icon: Columns3 },
  { key: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { key: 'timeline', label: 'Gantt', icon: GanttChart },
] as const

type ViewKey = (typeof VIEWS)[number]['key']

/** Table view paginates at 50 rows; visual views need more data. */
const TABLE_PAGE_SIZE = 50
const VISUAL_VIEW_PAGE_SIZE = 500

// ---------------------------------------------------------------------------
// Debounce hook — delays search until user stops typing
// ---------------------------------------------------------------------------
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

// ---------------------------------------------------------------------------
// Main Tasks Page
// ---------------------------------------------------------------------------
export default function TasksPage() {
  const { tenant } = useTenant()
  const { appUser, isLoading: userLoading } = useUser()

  const tenantId = tenant?.id ?? ''

  // View state from global UI store
  const viewPreferences = useUIStore((s) => s.viewPreferences)
  const setViewPreference = useUIStore((s) => s.setViewPreference)
  const currentView = (viewPreferences.tasks ?? 'table') as ViewKey

  // Task table store (search, filters, grouping)
  const { searchQuery, statusFilter, showCompleted, groupBy } = useTaskTableStore()

  // Debounce search to avoid firing a query on every keystroke
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  // Pagination state (table view only)
  const [page, setPage] = useState(1)

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, showCompleted, currentView])

  // Dialog/sheet state
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [conditionalColorOpen, setConditionalColorOpen] = useState(false)

  // ---------------------------------------------------------------------------
  // Server-side paginated task query
  // Table view uses small pages; visual views fetch a larger batch.
  // ---------------------------------------------------------------------------
  const isTableView = currentView === 'table'
  const pageSize = isTableView ? TABLE_PAGE_SIZE : VISUAL_VIEW_PAGE_SIZE

  const {
    data: taskResult,
    isLoading: tasksLoading,
    isError,
  } = useTasks({
    tenantId,
    page: isTableView ? page : 1,
    pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter ?? undefined,
    showCompleted,
    sortBy: 'due_date',
    sortDirection: 'asc',
  })

  const tasks = taskResult?.tasks ?? []
  const totalCount = taskResult?.totalCount ?? 0
  const totalPages = taskResult?.totalPages ?? 1

  // Fetch users for assignee display
  const { data: users } = useQuery({
    queryKey: ['users', tenantId, 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, tenant_id, auth_user_id, email, first_name, last_name, avatar_url, role_id, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return data as UserRow[]
    },
    enabled: !!tenantId,
  })

  // Fetch document counts scoped to the current page of task IDs
  const visibleTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const { data: documentCounts } = useTaskDocumentCounts(tenantId, visibleTaskIds)

  // Mutations
  const completeTask = useCompleteTask()
  const updateTask = useUpdateTask()

  const isLoading = tasksLoading || userLoading

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId)
    setDetailOpen(true)
  }, [])

  const handleToggleComplete = useCallback((task: Task) => {
    if (!appUser) return

    if (task.status === 'done') {
      updateTask.mutate({
        id: task.id,
        status: 'not_started',
        completed_at: null,
        completed_by: null,
      })
    } else {
      completeTask.mutate({ id: task.id, userId: appUser.id })
    }
  }, [appUser, updateTask, completeTask])

  const handleUpdateTask = useCallback((id: string, updates: Record<string, any>) => {
    updateTask.mutate({ id, ...updates })
  }, [updateTask])

  const handleStatusChange = useCallback((taskId: string, newStatus: string) => {
    if (newStatus === 'done' && appUser) {
      completeTask.mutate({ id: taskId, userId: appUser.id })
    } else {
      updateTask.mutate({ id: taskId, status: newStatus })
    }
  }, [appUser, completeTask, updateTask])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track and manage tasks across your matters and team.
            </p>
          </div>

          {/* View Switcher */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
            {VIEWS.map((view) => {
              const Icon = view.icon
              const isActive = currentView === view.key
              return (
                <Tooltip key={view.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setViewPreference('tasks', view.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="hidden sm:inline">{view.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{view.label} view</TooltipContent>
                </Tooltip>
              )
            })}

            {/* Conditional Color button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setConditionalColorOpen(true)}
                  className="flex items-center rounded-md px-2 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-white/50 transition-colors"
                >
                  <Palette className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Conditional coloring</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Toolbar (shared across views) */}
        <TaskTableToolbar
          onCreateTask={() => setCreateOpen(true)}
          userCount={users?.length ?? 0}
          currentView={currentView}
        />

        {/* Task count */}
        {!isLoading && (
          <div className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'task' : 'tasks'}
            {debouncedSearch && ` matching "${debouncedSearch}"`}
            {statusFilter && ` \u2022 filtered by status`}
            {isTableView && totalPages > 1 && (
              <span className="ml-2">
                (page {page} of {totalPages})
              </span>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && <TaskPageSkeleton />}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="rounded-lg border bg-white">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-destructive">
                Failed to load tasks. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Views */}
        {!isLoading && !isError && (
          <>
            {/* Table View */}
            {currentView === 'table' && (
              <>
                {groupBy ? (
                  <TaskTableGroupBy
                    tasks={tasks}
                    groupBy={groupBy}
                    renderTable={(groupTasks, groupLabel) => (
                      <TaskTable
                        key={groupLabel}
                        tasks={groupTasks}
                        users={users}
                        documentCounts={documentCounts ?? {}}
                        onTaskClick={handleTaskClick}
                        onToggleComplete={handleToggleComplete}
                        onUpdateTask={handleUpdateTask}
                        isUpdating={updateTask.isPending}
                      />
                    )}
                  />
                ) : (
                  <TaskTable
                    tasks={tasks}
                    users={users}
                    documentCounts={documentCounts ?? {}}
                    onTaskClick={handleTaskClick}
                    onToggleComplete={handleToggleComplete}
                    onUpdateTask={handleUpdateTask}
                    isUpdating={updateTask.isPending}
                  />
                )}

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(page * TABLE_PAGE_SIZE, totalCount)} of {totalCount}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page <= 1}
                        onClick={() => setPage(1)}
                        aria-label="First page"
                      >
                        <ChevronsLeft className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="px-3 text-sm font-medium tabular-nums">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                        aria-label="Last page"
                      >
                        <ChevronsRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Kanban View */}
            {currentView === 'kanban' && (
              <TaskKanbanView
                tasks={tasks}
                users={users}
                onTaskClick={handleTaskClick}
                onStatusChange={handleStatusChange}
              />
            )}

            {/* Calendar View */}
            {currentView === 'calendar' && (
              <TaskCalendarView
                tasks={tasks}
                onTaskClick={handleTaskClick}
              />
            )}

            {/* Gantt View */}
            {currentView === 'timeline' && (
              <TaskGanttView
                tasks={tasks}
                onTaskClick={handleTaskClick}
              />
            )}

            {/* Empty state */}
            {tasks.length === 0 && (
              <div className="rounded-lg border bg-white">
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <LayoutList className="mb-3 size-10 text-slate-300" />
                  <h3 className="text-sm font-medium text-slate-900">
                    {searchQuery || statusFilter
                      ? 'No tasks match your filters'
                      : 'No tasks yet'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchQuery || statusFilter
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Create a task manually, or let Norva auto-generate them when matters advance through pipeline stages.'}
                  </p>
                  {!searchQuery && !statusFilter && (
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() => setCreateOpen(true)}
                    >
                      Create Task
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Dialog */}
        <TaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

        {/* Task Detail Sheet */}
        <TaskDetailSheet
          taskId={selectedTaskId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />

        {/* Conditional Color Dialog */}
        <ConditionalColorDialog
          open={conditionalColorOpen}
          onOpenChange={setConditionalColorOpen}
        />
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function TaskPageSkeleton() {
  return (
    <div className="rounded-lg border bg-white divide-y">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-5 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-3 w-[40%]" />
          </div>
          <Skeleton className="h-4 w-20 shrink-0" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          <Skeleton className="h-4 w-24 shrink-0" />
        </div>
      ))}
    </div>
  )
}
