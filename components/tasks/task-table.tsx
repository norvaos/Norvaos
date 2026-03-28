'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns'
import { formatDate } from '@/lib/utils/formatters'
import { ChevronDown, ChevronRight, Paperclip, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_TYPES, TASK_CATEGORIES } from '@/lib/utils/constants'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTaskTableStore } from '@/lib/stores/task-table-store'
import { TaskOwnerAvatar } from './task-owner-avatar'
import { TaskStatusCell } from './task-status-cell'
import { TaskPriorityCell } from './task-priority-cell'
import type { Database } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

interface TaskTableProps {
  tasks: Task[]
  users: UserRow[] | undefined
  documentCounts: Record<string, number>
  onTaskClick: (taskId: string) => void
  onToggleComplete: (task: Task) => void
  onUpdateTask: (id: string, updates: Record<string, any>) => void
  isUpdating?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueDate(dateStr: string | null): { text: string; className: string } {
  if (!dateStr) return { text: '', className: '' }

  const date = new Date(dateStr + 'T00:00:00')
  if (isToday(date)) {
    return { text: 'Today', className: 'text-blue-600 font-medium' }
  }
  if (isTomorrow(date)) {
    return { text: 'Tomorrow', className: 'text-amber-600 font-medium' }
  }
  if (isPast(date)) {
    const days = differenceInDays(new Date(), date)
    return {
      text: days === 1 ? 'Yesterday' : `${days}d overdue`,
      className: 'text-red-500 font-medium',
    }
  }
  const days = differenceInDays(date, new Date())
  if (days <= 7) {
    return { text: format(date, 'EEEE'), className: 'text-foreground' }
  }
  return { text: formatDate(date), className: 'text-foreground' }
}

function formatTimeline(startDate: string | null, dueDate: string | null): string | null {
  if (!startDate && !dueDate) return null
  const start = startDate ? formatDate(startDate) : '?'
  const end = dueDate ? formatDate(dueDate) : '?'
  return `${start} \u2192 ${end}`
}

// ---------------------------------------------------------------------------
// Sortable header component
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sorted,
  onClick,
}: {
  label: string
  sorted: false | 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      <span>{label}</span>
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Section header for To-do / Completed split
// ---------------------------------------------------------------------------

function SectionHeaderDiv({
  title,
  count,
  open,
  onToggle,
  variant = 'todo',
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  variant?: 'todo' | 'completed'
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 border-b',
        variant === 'completed' ? 'bg-slate-50' : 'bg-muted/30'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors cursor-pointer select-none"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {title}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({count})
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline editable notes cell
// ---------------------------------------------------------------------------

function NotesCell({
  taskId,
  notes,
  onSave,
}: {
  taskId: string
  notes: string | null
  onSave: (id: string, updates: Record<string, any>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(notes ?? '')

  function handleBlur() {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed !== (notes ?? '')) {
      onSave(taskId, { notes: trimmed || null })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      setValue(notes ?? '')
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full text-sm bg-transparent border-b border-primary/30 outline-none py-0.5 px-0"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setValue(notes ?? '')
        setEditing(true)
      }}
      className="text-left w-full cursor-pointer"
    >
      {notes ? (
        <span className="text-sm text-muted-foreground truncate block max-w-[170px]">
          {notes.length > 60 ? notes.slice(0, 60) + '...' : notes}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/50">--</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TaskTable({
  tasks,
  users,
  documentCounts,
  onTaskClick,
  onToggleComplete,
  onUpdateTask,
  isUpdating,
}: TaskTableProps) {
  // Store state
  const {
    columnVisibility: storedVisibility,
    columnOrder: storedOrder,
  } = useTaskTableStore()

  // Local state
  const [sorting, setSorting] = useState<SortingState>([])
  const [todoOpen, setTodoOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  // Build user lookup map
  const usersMap = useMemo(() => {
    const map = new Map<string, UserRow>()
    if (users) {
      users.forEach((u) => map.set(u.id, u))
    }
    return map
  }, [users])

  // Inline update handlers
  const handleStatusUpdate = useCallback(
    (taskId: string) => (status: string) => {
      onUpdateTask(taskId, {
        status,
        ...(status === 'done'
          ? { completed_at: new Date().toISOString() }
          : { completed_at: null, completed_by: null }),
      })
    },
    [onUpdateTask]
  )

  const handlePriorityUpdate = useCallback(
    (taskId: string) => (priority: string) => {
      onUpdateTask(taskId, { priority })
    },
    [onUpdateTask]
  )

  const handleCheckboxToggle = useCallback(
    (taskId: string, checked: boolean) => {
      onUpdateTask(taskId, { custom_checkbox: checked })
    },
    [onUpdateTask]
  )

  // ---------------------------------------------------------------------------
  // Column definitions
  // ---------------------------------------------------------------------------

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      // 1. Select (row selection for future bulk actions)
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(!!checked)
            }
            aria-label="Select all"
          />
        ),
        size: 40,
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },

      // 2. Title
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <SortableHeader
            label="Title"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 320,
        cell: ({ row }) => {
          const task = row.original
          const isDone = task.status === 'done'
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onTaskClick(task.id)
                    }}
                    className="text-left max-w-[300px] cursor-pointer group"
                  >
                    <div
                      className={cn(
                        'text-sm font-medium truncate group-hover:text-primary transition-colors',
                        isDone && 'line-through text-muted-foreground'
                      )}
                    >
                      {task.title}
                    </div>
                  </button>
                </TooltipTrigger>
                {task.description && (
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs">{task.description.slice(0, 200)}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )
        },
        filterFn: (row, _columnId, filterValue: string) => {
          const task = row.original
          const search = filterValue.toLowerCase()
          return (
            task.title.toLowerCase().includes(search) ||
            (task.description?.toLowerCase().includes(search) ?? false)
          )
        },
      },

      // 3. Owner
      {
        id: 'owner',
        header: 'Owner',
        size: 60,
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <TaskOwnerAvatar
              userId={row.original.assigned_to}
              users={users}
            />
          )
        },
      },

      // 4. Status (inline editable)
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <SortableHeader
            label="Status"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 140,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <TaskStatusCell
              status={row.original.status ?? ''}
              onStatusChange={handleStatusUpdate(row.original.id)}
            />
          </div>
        ),
      },

      // 5. Priority (inline editable)
      {
        accessorKey: 'priority',
        header: ({ column }) => (
          <SortableHeader
            label="Priority"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 110,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <TaskPriorityCell
              priority={row.original.priority ?? ''}
              onPriorityChange={handlePriorityUpdate(row.original.id)}
            />
          </div>
        ),
      },

      // 6. Due Date
      {
        accessorKey: 'due_date',
        header: ({ column }) => (
          <SortableHeader
            label="Due Date"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 120,
        cell: ({ row }) => {
          const task = row.original
          const isDone = task.status === 'done' || task.status === 'cancelled'
          const { text, className } = formatDueDate(task.due_date)
          if (!text) {
            return <span className="text-xs text-muted-foreground">--</span>
          }
          return (
            <span className={cn('text-sm', isDone ? 'text-muted-foreground' : className)}>
              {text}
            </span>
          )
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.due_date
          const b = rowB.original.due_date
          if (!a && !b) return 0
          if (!a) return 1
          if (!b) return -1
          return new Date(a).getTime() - new Date(b).getTime()
        },
      },

      // 7. Task Type
      {
        accessorKey: 'task_type',
        header: ({ column }) => (
          <SortableHeader
            label="Type"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 130,
        cell: ({ row }) => {
          const type = row.original.task_type
          const config = TASK_TYPES.find((t) => t.value === type)
          if (!config) return <span className="text-xs text-muted-foreground">--</span>
          return (
            <Badge variant="outline" className="text-xs font-normal">
              {config.label}
            </Badge>
          )
        },
      },

      // 8. Category
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <SortableHeader
            label="Category"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          />
        ),
        size: 120,
        cell: ({ row }) => {
          const cat = row.original.category
          const config = TASK_CATEGORIES.find((c) => c.value === cat)
          if (!config) return <span className="text-xs text-muted-foreground">--</span>
          return (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: config.color }}
              />
              {config.label}
            </span>
          )
        },
      },

      // 9. Billable
      {
        accessorKey: 'is_billable',
        header: 'Billable',
        size: 70,
        enableSorting: false,
        cell: ({ row }) => {
          const billable = row.original.is_billable
          if (!billable) return <span className="text-xs text-muted-foreground">--</span>
          return (
            <Badge variant="secondary" className="text-[10px] bg-emerald-950/30 text-emerald-400 border-emerald-500/20">
              $
            </Badge>
          )
        },
      },

      // 10. Notes (inline editable)
      {
        accessorKey: 'notes',
        header: 'Notes',
        size: 180,
        enableSorting: false,
        cell: ({ row }) => (
          <NotesCell
            taskId={row.original.id}
            notes={row.original.notes}
            onSave={onUpdateTask}
          />
        ),
      },

      // 8. Timeline
      {
        id: 'timeline',
        header: 'Timeline',
        size: 150,
        enableSorting: false,
        cell: ({ row }) => {
          const task = row.original
          const label = formatTimeline(task.start_date, task.due_date)
          if (!label) {
            return <span className="text-xs text-muted-foreground">--</span>
          }
          return <span className="text-sm text-muted-foreground">{label}</span>
        },
      },

      // 9. Files
      {
        id: 'files',
        header: 'Files',
        size: 70,
        enableSorting: false,
        cell: ({ row }) => {
          const count = documentCounts[row.original.id] ?? 0
          if (count === 0) {
            return <span className="text-xs text-muted-foreground">--</span>
          }
          return (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              {count}
            </span>
          )
        },
      },

      // 10. Custom Checkbox
      {
        id: 'custom_checkbox',
        header: '',
        size: 40,
        enableSorting: false,
        cell: ({ row }) => {
          const task = row.original
          return (
            <Checkbox
              checked={task.custom_checkbox ?? false}
              onCheckedChange={(checked) =>
                handleCheckboxToggle(task.id, !!checked)
              }
              aria-label="Toggle custom checkbox"
              onClick={(e) => e.stopPropagation()}
            />
          )
        },
      },
    ],
    [usersMap, users, documentCounts, onTaskClick, onUpdateTask, handleStatusUpdate, handlePriorityUpdate, handleCheckboxToggle]
  )

  // ---------------------------------------------------------------------------
  // Split tasks into To-do / Completed
  // ---------------------------------------------------------------------------

  const todoTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
    [tasks]
  )

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === 'done' || t.status === 'cancelled'),
    [tasks]
  )

  // ---------------------------------------------------------------------------
  // Column visibility bridged from store
  // ---------------------------------------------------------------------------

  const columnVisibility: VisibilityState = storedVisibility

  // ---------------------------------------------------------------------------
  // TanStack Table instances
  // ---------------------------------------------------------------------------

  const todoTable = useReactTable({
    data: todoTasks,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder: storedOrder,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
    enableRowSelection: true,
  })

  const completedTable = useReactTable({
    data: completedTasks,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder: storedOrder,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
  })

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- To-do section ---- */}
      <div className="w-full rounded-lg border bg-background overflow-hidden">
        <SectionHeaderDiv
          title="To-do"
          count={todoTable.getFilteredRowModel().rows.length}
          open={todoOpen}
          onToggle={() => setTodoOpen((prev) => !prev)}
        />

        {todoOpen && (
          <div className="relative w-full overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                {todoTable.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b transition-colors hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {todoTable.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center text-muted-foreground py-8"
                    >
                      No tasks to show
                    </td>
                  </tr>
                ) : (
                  todoTable.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b transition-colors hover:bg-muted/50 group cursor-pointer"
                      onClick={() => onTaskClick(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="p-2 px-3 align-middle whitespace-nowrap"
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Completed section (visually separate) ---- */}
      {completedTasks.length > 0 && (
        <div className="w-full rounded-lg border bg-background overflow-hidden">
          <SectionHeaderDiv
            title="Completed"
            count={completedTable.getFilteredRowModel().rows.length}
            open={completedOpen}
            onToggle={() => setCompletedOpen((prev) => !prev)}
            variant="completed"
          />

          {completedOpen && (
            <div className="relative w-full overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  {completedTable.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b transition-colors hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap"
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {completedTable.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b transition-colors hover:bg-muted/50 group cursor-pointer opacity-60 hover:opacity-100"
                      onClick={() => onTaskClick(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="p-2 px-3 align-middle whitespace-nowrap"
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
