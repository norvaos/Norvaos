'use client'

import { useState, useRef, useEffect } from 'react'
import { TASK_STATUSES } from '@/lib/utils/constants'

interface TaskStatusCellProps {
  status: string
  onStatusChange: (status: string) => void
}

function getStatusConfig(status: string) {
  return (
    TASK_STATUSES.find((s) => s.value === status) ?? {
      value: status,
      label: status,
      color: '#c3c6d4',
    }
  )
}

export function TaskStatusCell({ status, onStatusChange }: TaskStatusCellProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const config = getStatusConfig(status)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  function handleSelect(value: string) {
    if (value !== status) {
      onStatusChange(value)
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80 cursor-pointer border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        style={{ backgroundColor: config.color }}
      >
        {config.label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
          {TASK_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSelect(s.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent cursor-pointer outline-none"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 text-left">{s.label}</span>
              {s.value === status && (
                <span className="text-muted-foreground text-xs">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
