'use client'

/**
 * Heritage Sync Button  -  Directive 079
 *
 * Renders a "Sync Heritage Data" button that pulls canonical profile data
 * from previous matters and injects it into the form wizard store.
 *
 * Visual feedback:
 *   - Emerald: Stable data (auto-imported, still valid e.g. Mother's Name)
 *   - Amber:   Semi-stable data (imported but stale, needs re-verification)
 *   - Grey:    Matter-specific data (skipped, user must enter manually)
 *
 * Designed to be placed in:
 *   1. SovereignInitiationModal (Step 2, after contact + practice area selected)
 *   2. IRCC Workspace header bar
 *   3. Form wizard top bar
 */

import { useState, useCallback } from 'react'
import { useCanonicalProfile } from '@/lib/queries/canonical-profiles'
import { useFormWizardStore } from '@/lib/stores/form-wizard-store'
import { getFieldReuseCategory } from '@/lib/ircc/types/reuse'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  History,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface HeritageSyncButtonProps {
  /** Contact ID to pull canonical data from */
  contactId: string
  /** Optional matter ID that sourced the data (for audit trail) */
  sourceMatterId?: string
  /** Compact mode (icon-only) */
  compact?: boolean
  className?: string
}

interface ImportSummary {
  stable: number
  semiStable: number
  skipped: number
  total: number
  fields: Array<{
    path: string
    value: unknown
    category: 'stable' | 'semi_stable' | 'matter_specific'
    label: string
  }>
}

// ── Stale threshold ──────────────────────────────────────────────────────────

/** Fields older than this (in days) are marked amber regardless of category */
const STALE_THRESHOLD_DAYS = 365

// ── Component ────────────────────────────────────────────────────────────────

export function HeritageSyncButton({
  contactId,
  sourceMatterId,
  compact,
  className,
}: HeritageSyncButtonProps) {
  const { data: canonicalProfile, isLoading: profileLoading } = useCanonicalProfile(contactId)
  const injectHeritage = useFormWizardStore((s) => s.injectHeritage)
  const fieldMeta = useFormWizardStore((s) => s.fieldMeta)

  const [synced, setSynced] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [expanded, setExpanded] = useState(false)

  const hasCanonicalData = !!canonicalProfile?.fields && canonicalProfile.fields.length > 0

  const handleSync = useCallback(() => {
    if (!canonicalProfile?.fields) return

    const now = new Date()
    const importData: Record<string, unknown> = {}
    const summaryFields: ImportSummary['fields'] = []
    let stable = 0
    let semiStable = 0
    let skipped = 0

    for (const field of canonicalProfile.fields) {
      if (field.value === null || field.value === undefined) continue

      const profilePath = `${field.domain}.${field.field_key}`
      const category = getFieldReuseCategory(profilePath)

      // Skip matter-specific fields
      if (category === 'matter_specific') {
        skipped++
        summaryFields.push({
          path: profilePath,
          value: field.value,
          category,
          label: humaniseFieldPath(profilePath),
        })
        continue
      }

      // Check age for staleness
      const effectiveDate = field.effective_from
        ? new Date(field.effective_from)
        : new Date(field.created_at ?? now)
      const ageDays = Math.floor(
        (now.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      // Import the field
      importData[profilePath] = field.value

      if (category === 'stable' && ageDays < STALE_THRESHOLD_DAYS) {
        stable++
      } else {
        semiStable++
      }

      summaryFields.push({
        path: profilePath,
        value: field.value,
        category: category === 'stable' && ageDays < STALE_THRESHOLD_DAYS ? 'stable' : 'semi_stable',
        label: humaniseFieldPath(profilePath),
      })
    }

    // Inject into the wizard store
    injectHeritage(importData, sourceMatterId)
    setSynced(true)
    setSummary({
      stable,
      semiStable,
      skipped,
      total: stable + semiStable + skipped,
      fields: summaryFields,
    })
  }, [canonicalProfile, injectHeritage, sourceMatterId])

  // No canonical data  -  don't show the button
  if (!hasCanonicalData && !profileLoading) return null

  // Already synced  -  show summary
  if (synced && summary) {
    return (
      <div className={cn('rounded-xl border border-white/[0.06] bg-white/[0.02] p-3', className)}>
        {/* Summary header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-400 dark:text-emerald-300">
              Heritage Data Synced
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {summary.total} fields
          </Button>
        </div>

        {/* Stats bar */}
        <div className="mt-2 flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-3" />
            {summary.stable} verified
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-3" />
            {summary.semiStable} needs review
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <ShieldX className="size-3" />
            {summary.skipped} skipped
          </span>
        </div>

        {/* Expanded field list */}
        {expanded && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1 border-t border-emerald-500/10 pt-2">
            {summary.fields.map((f) => (
              <div
                key={f.path}
                className={cn(
                  'flex items-center justify-between rounded-md px-2 py-1 text-[10px]',
                  f.category === 'stable' && 'bg-white/[0.06]',
                  f.category === 'semi_stable' && 'bg-amber-500/10',
                  f.category === 'matter_specific' && 'bg-muted/30 opacity-50',
                )}
              >
                <span className={cn(
                  'font-medium',
                  f.category === 'stable' && 'text-emerald-400 dark:text-emerald-300',
                  f.category === 'semi_stable' && 'text-amber-400 dark:text-amber-300',
                  f.category === 'matter_specific' && 'text-muted-foreground line-through',
                )}>
                  {f.label}
                </span>
                <span className="text-muted-foreground truncate max-w-[40%] text-right">
                  {formatValue(f.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default state  -  show sync button
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            className={cn(
              'gap-1.5 border-emerald-500/30 text-emerald-400 dark:text-emerald-400',
              'hover:bg-white/[0.06] hover:border-emerald-500/50',
              className,
            )}
            disabled={profileLoading}
            onClick={handleSync}
          >
            {profileLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <History className="size-3.5" />
            )}
            {!compact && (
              <span>
                Sync Heritage
                {canonicalProfile?.fields
                  ? ` (${canonicalProfile.fields.length} fields)`
                  : ''
                }
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Pull verified data from previous matters. Stable fields (DOB, birthplace) auto-fill.
          Semi-stable fields (address, passport) require re-verification.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a profile_path like 'personal.date_of_birth' to 'Date of Birth' */
function humaniseFieldPath(path: string): string {
  const parts = path.split('.')
  const field = parts[parts.length - 1]
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format a value for display in the summary */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value.length > 30 ? `${value.slice(0, 30)}...` : value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 30) + '...'
  return String(value)
}
