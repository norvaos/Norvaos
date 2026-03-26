'use client'

/**
 * PortalCollapsibleSection  -  Premium glassmorphism collapsible container.
 *
 * Features:
 * - Frosted glass effect with subtle gradient backgrounds
 * - Variant-driven glow accents (action/warning/success/info)
 * - Metric pills with premium pill styling
 * - Smooth expand/collapse with content reveal
 * - Mobile-friendly touch targets (min 48px)
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
  sectionId: string
  title: string
  icon: ReactNode
  metrics: SectionMetric[]
  isExpanded: boolean
  onToggle: () => void
  badge?: { text: string; color: 'red' | 'amber' | 'blue' | 'green' }
  primaryColor?: string
  variant?: 'action' | 'info' | 'success' | 'warning' | 'default'
  children: ReactNode
}

// ── Colour map ───────────────────────────────────────────────────────────────────

const METRIC_COLOURS: Record<string, string> = {
  default: 'text-slate-600 bg-slate-100/80',
  red: 'text-red-700 bg-red-50',
  green: 'text-emerald-700 bg-emerald-50',
  amber: 'text-amber-700 bg-amber-50',
  blue: 'text-blue-700 bg-blue-50',
}

const BADGE_COLOURS: Record<string, string> = {
  red: 'bg-red-500 text-white shadow-red-500/25',
  amber: 'bg-amber-500 text-white shadow-amber-500/25',
  blue: 'bg-blue-500 text-white shadow-blue-500/25',
  green: 'bg-emerald-500 text-white shadow-emerald-500/25',
}

const VARIANT_STYLES: Record<string, { border: string; glow: string; iconBg: string }> = {
  action: {
    border: 'border-l-[3px] border-l-amber-400',
    glow: 'shadow-amber-100/50',
    iconBg: 'bg-amber-50 text-amber-600',
  },
  warning: {
    border: 'border-l-[3px] border-l-red-400',
    glow: 'shadow-red-100/50',
    iconBg: 'bg-red-50 text-red-600',
  },
  info: {
    border: 'border-l-[3px] border-l-blue-400',
    glow: 'shadow-blue-100/50',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  success: {
    border: 'border-l-[3px] border-l-emerald-400',
    glow: 'shadow-emerald-100/50',
    iconBg: 'bg-emerald-50 text-emerald-600',
  },
  default: {
    border: '',
    glow: '',
    iconBg: 'bg-slate-100 text-slate-500',
  },
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
  const vs = VARIANT_STYLES[variant]

  return (
    <div
      id={sectionId}
      className={cn(
        'rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm transition-all duration-200',
        isExpanded ? 'shadow-lg' : 'shadow-sm hover:shadow-md',
        vs.border,
        isExpanded && vs.glow,
      )}
      style={{
        background: isExpanded
          ? `linear-gradient(135deg, white 0%, ${primaryColor || '#10b981'}03 100%)`
          : undefined,
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors',
          'min-h-[52px] rounded-2xl',
          !isExpanded && 'hover:bg-slate-50/50',
          isExpanded && 'border-b border-slate-200/40',
        )}
      >
        {/* Icon */}
        <span className={cn(
          'shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          vs.iconBg,
        )}>
          {icon}
        </span>

        {/* Title */}
        <span className="text-sm font-bold text-slate-800 tracking-tight">{title}</span>

        {/* Metric pills */}
        <div className="flex flex-wrap items-center gap-1.5 ml-1">
          {metrics.map((m) => (
            <span
              key={m.label}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                METRIC_COLOURS[m.color ?? 'default'],
              )}
            >
              <span>{m.value}</span>
              <span className="opacity-60">{m.label}</span>
            </span>
          ))}
        </div>

        <span className="flex-1" />

        {/* Badge */}
        {badge && (
          <span className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm',
            BADGE_COLOURS[badge.color],
          )}>
            {badge.text}
          </span>
        )}

        {/* Chevron */}
        <div className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full transition-all',
          isExpanded ? 'bg-slate-100 rotate-180' : 'bg-slate-50',
        )}>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div ref={contentRef} className="px-5 py-4">
          {children}
        </div>
      )}
    </div>
  )
}
