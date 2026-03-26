'use client'

/**
 * PortalCollapsibleSection  -  Reusable collapsible container for the portal
 * guided workspace. Adapted from section-summary-strip.tsx pattern.
 *
 * Features:
 * - Metric pills shown even when collapsed
 * - Auto-expand support (e.g., payment auto-opens when overdue)
 * - ChevronDown with rotation animation
 * - Mobile-friendly touch targets (min 44px)
 */

import { useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────────

export interface SectionMetric {
  label: string
  value: string | number
  color?: 'default' | 'red' | 'green' | 'amber' | 'blue'
}

export interface PortalCollapsibleSectionProps {
  /** Unique id used for scroll-to-section targeting */
  sectionId: string
  title: string
  icon: ReactNode
  metrics: SectionMetric[]
  isExpanded: boolean
  onToggle: () => void
  /** Optional badge (e.g., "Overdue") */
  badge?: { text: string; color: 'red' | 'amber' | 'blue' | 'green' }
  /** Tenant primary colour for expanded state accent */
  primaryColor?: string
  /** Visual variant  -  left-border accent based on section status */
  variant?: 'action' | 'info' | 'success' | 'warning' | 'default'
  children: ReactNode
}

// ── Colour map ───────────────────────────────────────────────────────────────────

const METRIC_COLOURS: Record<string, string> = {
  default: 'text-slate-500',
  red: 'text-red-600',
  green: 'text-green-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
}

const BADGE_COLOURS: Record<string, string> = {
  red: 'bg-red-100 text-red-700 border-red-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
}

const VARIANT_BORDERS: Record<string, string> = {
  action: 'border-l-4 border-l-amber-400',
  warning: 'border-l-4 border-l-red-400',
  info: 'border-l-4 border-l-blue-400',
  success: 'border-l-4 border-l-green-400',
  default: '',
}

// ── Component ────────────────────────────────────────────────────────────────────

export function PortalCollapsibleSection({
  sectionId,
  title,
  icon,
  metrics,
  isExpanded,
  onToggle,
  badge,
  primaryColor,
  variant = 'default',
  children,
}: PortalCollapsibleSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div
      id={sectionId}
      className={cn(
        'rounded-xl border bg-white shadow-sm transition-colors',
        isExpanded && 'border-slate-300',
        VARIANT_BORDERS[variant],
      )}
    >
      {/* Header  -  always visible, acts as toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'min-h-[48px] hover:bg-slate-50/80',
          isExpanded && 'border-b border-slate-200',
        )}
      >
        {/* Icon */}
        <span className="shrink-0 text-slate-400">{icon}</span>

        {/* Title */}
        <span className="text-sm font-semibold text-slate-800">{title}</span>

        {/* Metric pills */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-1">
          {metrics.map((m) => (
            <span
              key={m.label}
              className={cn(
                'text-xs whitespace-nowrap',
                METRIC_COLOURS[m.color ?? 'default'],
              )}
            >
              <span className="font-medium">{m.value}</span>{' '}
              <span className="opacity-75">{m.label}</span>
            </span>
          ))}
        </div>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Badge */}
        {badge && (
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              BADGE_COLOURS[badge.color],
            )}
          >
            {badge.text}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
            isExpanded && 'rotate-180',
          )}
        />
      </button>

      {/* Content  -  collapsible */}
      {isExpanded && (
        <div ref={contentRef} className="p-4">
          {children}
        </div>
      )}
    </div>
  )
}
