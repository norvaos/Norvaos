'use client'

import { Columns3, ChevronDown } from 'lucide-react'

import { useTaskTableStore } from '@/lib/stores/task-table-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'custom_checkbox', label: 'Checkbox' },
  { key: 'title', label: 'Title', locked: true },
  { key: 'owner', label: 'Owner' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'notes', label: 'Notes' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'files', label: 'Files' },
] as const

// ---------------------------------------------------------------------------
// Column Visibility Menu
// ---------------------------------------------------------------------------
export function ColumnVisibilityMenu() {
  const { columnVisibility, setColumnVisibility } = useTaskTableStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Columns</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLUMNS.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={columnVisibility[col.key] !== false}
            onCheckedChange={(checked) => {
              if (!('locked' in col && col.locked)) {
                setColumnVisibility(col.key, !!checked)
              }
            }}
            disabled={'locked' in col && col.locked}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
