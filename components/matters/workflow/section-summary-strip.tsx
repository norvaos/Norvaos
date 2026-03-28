'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SectionMetric {
  label: string
  value: string | number
  color?: 'default' | 'red' | 'green' | 'amber' | 'blue'
}

export interface SectionSummaryStripProps {
  title: string
  icon: LucideIcon
  metrics: SectionMetric[]
  /** First 2-3 missing/highlight items shown as text */
  highlights?: string[]
  isExpanded: boolean
  onToggle: () => void
  badge?: { text: string; variant: 'default' | 'destructive' | 'warning' }
}

// ── Colour map ─────────────────────────────────────────────────────────────────

const METRIC_COLOURS: Record<NonNullable<SectionMetric['color']>, string> = {
  default: 'text-muted-foreground',
  red: 'text-red-600',
  green: 'text-green-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SectionSummaryStrip({
  title,
  icon: Icon,
  metrics,
  highlights,
  isExpanded,
  onToggle,
  badge,
}: SectionSummaryStripProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full rounded-lg border bg-card text-left transition-colors hover:bg-accent/50',
        'px-4 py-3',
        isExpanded && 'border-primary/20 bg-accent/30'
      )}
    >
      {/* Top row: icon + title + metrics + badge + chevron */}
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>

        {/* Metric pills */}
        <div className="flex flex-wrap items-center gap-2 ml-2">
          {metrics.map((m) => (
            <span
              key={m.label}
              className={cn(
                'text-xs tabular-nums',
                METRIC_COLOURS[m.color ?? 'default']
              )}
            >
              {m.label}: <span className="font-medium">{m.value}</span>
            </span>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Optional badge */}
        {badge && (
          <Badge
            variant={
              badge.variant === 'warning' ? 'outline' : badge.variant
            }
            className={cn(
              badge.variant === 'warning' &&
                'border-amber-500/30 text-amber-400 bg-amber-950/30'
            )}
          >
            {badge.text}
          </Badge>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Highlights row (only when collapsed) */}
      {!isExpanded && highlights && highlights.length > 0 && (
        <p className="mt-1 ml-7 text-xs text-muted-foreground truncate">
          Missing: {highlights.join(', ')}
        </p>
      )}
    </button>
  )
}
