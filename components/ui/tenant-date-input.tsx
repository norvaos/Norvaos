'use client'

/**
 * TenantDateInput  -  Date input that respects the tenant's date_format setting.
 *
 * Replaces native <input type="date"> which ignores tenant preferences.
 * Uses a Popover + Calendar for picking, displays the date in the tenant's
 * configured format (DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.).
 *
 * Stores and returns ISO format (YYYY-MM-DD) internally  -  only the DISPLAY changes.
 *
 * Usage:
 *   <TenantDateInput value={isoDate} onChange={setIsoDate} />
 *   <TenantDateInput value={field.value} onChange={field.onChange} disabled={busy} />
 */

import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/hooks/use-tenant'

// ── Format conversion ────────────────────────────────────────────────────────

/** Convert DB moment-style tokens to date-fns tokens */
function toDateFnsTokens(fmt: string): string {
  return fmt
    .replace(/YYYY/g, 'yyyy')
    .replace(/DD/g, 'dd')
  // MM and MMM are the same in date-fns
}

/** Convert DB moment-style tokens to input placeholder */
function toPlaceholder(fmt: string): string {
  return fmt.toLowerCase()
}

// ── Component ────────────────────────────────────────────────────────────────

export interface TenantDateInputProps {
  /** ISO date string (YYYY-MM-DD) or empty string */
  value?: string | null
  /** Called with ISO date string (YYYY-MM-DD) or empty string */
  onChange?: (isoDate: string) => void
  /** Called on blur */
  onBlur?: () => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  placeholder?: string
  /** Allow clearing the date */
  clearable?: boolean
}

export function TenantDateInput({
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
  id,
  name,
  placeholder,
  clearable = true,
}: TenantDateInputProps) {
  const { tenant } = useTenant()
  const tenantFormat = tenant?.date_format || 'YYYY-MM-DD'
  const dateFnsFormat = toDateFnsTokens(tenantFormat)
  const displayPlaceholder = placeholder || toPlaceholder(tenantFormat)

  const [open, setOpen] = React.useState(false)
  const [textValue, setTextValue] = React.useState('')

  // Parse the ISO value into a Date for the calendar
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    const parts = value.split('T')[0].split('-')
    if (parts.length < 3) return undefined
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    )
    return isValid(d) ? d : undefined
  }, [value])

  // Sync textValue when value changes externally
  React.useEffect(() => {
    if (selectedDate) {
      setTextValue(format(selectedDate, dateFnsFormat))
    } else {
      setTextValue('')
    }
  }, [selectedDate, dateFnsFormat])

  // Handle calendar selection
  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    onChange?.(iso)
    setOpen(false)
  }

  // Handle typed input
  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setTextValue(raw)

    // Try to parse the typed value in tenant's format
    const parsed = parse(raw, dateFnsFormat, new Date())
    if (isValid(parsed) && raw.length >= dateFnsFormat.length) {
      const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
      onChange?.(iso)
    }
  }

  function handleTextBlur() {
    // On blur, if text doesn't parse, revert to the last valid value
    const parsed = parse(textValue, dateFnsFormat, new Date())
    if (!isValid(parsed) || textValue.length < dateFnsFormat.length) {
      if (selectedDate) {
        setTextValue(format(selectedDate, dateFnsFormat))
      } else {
        setTextValue('')
        onChange?.('')
      }
    }
    onBlur?.()
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setTextValue('')
    onChange?.('')
  }

  return (
    <div className={cn('relative', className)}>
      {/* Hidden input for form libraries (react-hook-form) */}
      {name && (
        <input type="hidden" name={name} value={value || ''} />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={textValue}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            disabled={disabled}
            placeholder={displayPlaceholder}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors',
              'file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'md:text-sm',
              'pr-16', // space for icons
            )}
            autoComplete="off"
          />

          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {clearable && textValue && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors',
                  !disabled && 'hover:text-foreground hover:bg-accent cursor-pointer',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
                tabIndex={-1}
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </div>
        </div>

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            defaultMonth={selectedDate}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
