'use client'

/**
 * NorvaEmptyState  -  Branded empty-state with "First-Look" quick-start logic.
 *
 * Replaces generic "No X yet" messages with actionable guidance:
 *   - Norva logo mark for brand consistency
 *   - Headline + description explaining what this area does
 *   - Optional quick-start steps so new users know exactly where to click
 *   - Optional CTA button
 *
 * Performance: pure JSX, no lazy imports, 0ms TBT.
 */

import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Tiny inline Norva "N" mark ──────────────────────────────────────────────

function NorvaWatermark() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 32 32"
      fill="none"
      className="opacity-15"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7.5" fill="#4f46e5" />
      <rect x="6.5" y="7" width="3.5" height="18" rx="1" fill="white" />
      <polygon points="10,7 13.5,7 22,25 18.5,25" fill="white" />
      <rect x="22" y="7" width="3.5" height="18" rx="1" fill="white" />
    </svg>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuickStartStep {
  label: string
  /** Optional href  -  if provided, step renders as a link */
  href?: string
  /** Optional click handler */
  onClick?: () => void
}

interface NorvaEmptyStateProps {
  /** Lucide icon to display above the headline */
  icon?: LucideIcon
  /** Main headline  -  should name the Norva Signature feature */
  title: string
  /** Actionable description  -  what to do, not just what's missing */
  description: string
  /** Quick-start steps shown as a numbered list */
  quickStart?: QuickStartStep[]
  /** Optional CTA button */
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function NorvaEmptyState({
  icon: Icon,
  title,
  description,
  quickStart,
  action,
  className,
}: NorvaEmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-6 text-center',
      className,
    )}>
      {/* Watermark + icon stack */}
      <div className="relative mb-4">
        <NorvaWatermark />
        {Icon && (
          <Icon className="absolute -bottom-1 -right-1 h-5 w-5 text-indigo-500" />
        )}
      </div>

      {/* Headline */}
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>

      {/* Description */}
      <p className="text-xs text-muted-foreground max-w-[320px] leading-relaxed">
        {description}
      </p>

      {/* Quick Start steps */}
      {quickStart && quickStart.length > 0 && (
        <div className="mt-4 text-left w-full max-w-[280px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
            Quick Start
          </p>
          <ol className="space-y-1.5">
            {quickStart.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-none w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {step.href ? (
                  <a
                    href={step.href}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {step.label}
                  </a>
                ) : step.onClick ? (
                  <button
                    onClick={step.onClick}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                  >
                    {step.label}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{step.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* CTA */}
      {action && (
        <Button
          size="sm"
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
