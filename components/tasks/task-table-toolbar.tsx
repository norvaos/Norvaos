'use client'

import { Search, Plus, Eye, EyeOff, Columns3, Group } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTaskTableStore } from '@/lib/stores/task-table-store'
import { TASK_STATUSES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskTableToolbarProps {
  onCreateTask: () => void
  userCount: number
  currentView?: string
}

// ---------------------------------------------------------------------------
// Column definitions for the visibility menu
// ---------------------------------------------------------------------------
const TOGGLEABLE_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'owner', label: 'Owner' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'notes', label: 'Notes' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'files', label: 'Files' },
  { key: 'checkbox', label: 'Checkbox' },
] as const

// ---------------------------------------------------------------------------
// Group-by options
// ---------------------------------------------------------------------------
const GROUP_BY_OPTIONS = [
  { value: null, label: 'None' },
  { value: 'status', label: 'Status' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskTableToolbar({ onCreateTask, userCount, currentView = 'table' }: TaskTableToolbarProps) {
  const {
    searchQuery,
    setSearchQuery,
    groupBy,
    setGroupBy,
    statusFilter,
    setStatusFilter,
    showCompleted,
    setShowCompleted,
    columnVisibility,
    setColumnVisibility,
  } = useTaskTableStore()

  const isTableView = currentView === 'table'

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Main toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* ----- Left side ----- */}

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5">
          {TASK_STATUSES.filter((s) => s.value !== 'cancelled').map((status) => {
            const isActive = statusFilter === status.value
            return (
              <button
                key={status.value}
                type="button"
                onClick={() =>
                  setStatusFilter(isActive ? null : status.value)
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                )}
                style={
                  isActive
                    ? { backgroundColor: status.color }
                    : undefined
                }
              >
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    isActive && 'bg-white/70'
                  )}
                  style={!isActive ? { backgroundColor: status.color } : undefined}
                />
                {status.label}
              </button>
            )
          })}
          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="ml-1 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ----- Right side ----- */}

        {/* Group By dropdown  -  Table view only */}
        {isTableView && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Group className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {groupBy
                    ? GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'Group'
                    : 'Group'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Group by
              </p>
              {GROUP_BY_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setGroupBy(option.value)}
                  className={cn(
                    'flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors cursor-pointer',
                    groupBy === option.value && 'bg-accent font-medium'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Show / Hide Completed toggle  -  Table view only */}
        {isTableView && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            {showCompleted ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {showCompleted ? 'Completed' : 'Hidden'}
            </span>
          </Button>
        )}

        {/* Column Visibility dropdown  -  Table view only */}
        {isTableView && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Columns3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Toggle columns
              </p>
              {TOGGLEABLE_COLUMNS.map((col) => {
                const isVisible = columnVisibility[col.key] !== false
                return (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => setColumnVisibility(col.key, !isVisible)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    {col.label}
                  </label>
                )
              })}
            </PopoverContent>
          </Popover>
        )}

        {/* New Task button */}
        <Button size="sm" className="h-8 gap-1.5" onClick={onCreateTask}>
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Button>
      </div>
    </div>
  )
}
