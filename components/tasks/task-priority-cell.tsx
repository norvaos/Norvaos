'use client'

import { useState, useRef, useEffect } from 'react'
import { PRIORITIES } from '@/lib/utils/constants'

interface TaskPriorityCellProps {
  priority: string
  onPriorityChange: (priority: string) => void
}

function getPriorityConfig(priority: string) {
  return (
    PRIORITIES.find((p) => p.value === priority) ?? {
      value: priority,
      label: priority,
      color: '#6b7280',
    }
  )
}

export function TaskPriorityCell({
  priority,
  onPriorityChange,
}: TaskPriorityCellProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const config = getPriorityConfig(priority)

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
    if (value !== priority) {
      onPriorityChange(value)
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
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleSelect(p.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent cursor-pointer outline-none"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="flex-1 text-left">{p.label}</span>
              {p.value === priority && (
                <span className="text-muted-foreground text-xs">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
