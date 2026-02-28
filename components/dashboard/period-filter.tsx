'use client'

import { cn } from '@/lib/utils'
import type { Period } from '@/lib/hooks/use-period-filter'

const PERIOD_OPTIONS: { value: Period; label: string; shortLabel: string }[] = [
  { value: 'day', label: 'Day', shortLabel: 'D' },
  { value: 'week', label: 'Week', shortLabel: 'W' },
  { value: 'month', label: 'Month', shortLabel: 'M' },
  { value: 'quarter', label: 'Quarter', shortLabel: 'Q' },
  { value: 'year', label: 'Year', shortLabel: 'Y' },
]

interface PeriodFilterProps {
  period: Period
  onPeriodChange: (period: Period) => void
  comparisonLabel?: string
  className?: string
}

export function PeriodFilter({
  period,
  onPeriodChange,
  comparisonLabel,
  className,
}: PeriodFilterProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="inline-flex items-center rounded-lg border bg-muted p-0.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPeriodChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              period === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="hidden sm:inline">{opt.label}</span>
            <span className="sm:hidden">{opt.shortLabel}</span>
          </button>
        ))}
      </div>
      {comparisonLabel && (
        <span className="text-xs text-muted-foreground hidden md:inline">
          {comparisonLabel}
        </span>
      )}
    </div>
  )
}
