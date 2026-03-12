"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parse, isValid } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  /** Current value as YYYY-MM-DD string, or empty string for no selection */
  value?: string
  /** Called with YYYY-MM-DD string on selection, or empty string on clear */
  onChange: (value: string) => void
  /** Placeholder shown when no date is selected */
  placeholder?: string
  /** Disables the picker entirely */
  disabled?: boolean
  /** HTML id for Label htmlFor association */
  id?: string
  /** Optional upper bound date */
  maxDate?: Date
  /** Optional lower bound date */
  minDate?: Date
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  disabled = false,
  id,
  maxDate,
  minDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const dateValue = React.useMemo(() => {
    if (!value) return undefined
    const parsed = parse(value, "yyyy-MM-dd", new Date())
    return isValid(parsed) ? parsed : undefined
  }, [value])

  const handleSelect = React.useCallback(
    (date: Date | undefined) => {
      if (date) {
        onChange(format(date, "yyyy-MM-dd"))
      } else {
        onChange("")
      }
      setOpen(false)
    },
    [onChange],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !dateValue && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0 opacity-50" />
          {dateValue ? format(dateValue, "MMMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleSelect}
          disabled={(date) => {
            if (maxDate && date > maxDate) return true
            if (minDate && date < minDate) return true
            return false
          }}
          defaultMonth={dateValue}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  )
}
