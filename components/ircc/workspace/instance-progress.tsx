'use client'

/**
 * InstanceProgress  -  Section-level and overall completion progress
 *
 * Displays per-section progress bars, stale/blocked badges, and an overall
 * completion bar for a form instance. Supports compact mode (sidebar) and
 * full mode (detail view with expandable sections).
 */

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useCompletionState } from '@/lib/queries/answer-engine'
import { useIrccFormSections } from '@/lib/queries/ircc-forms'
import type { SectionCompletionState } from '@/lib/ircc/types/answers'

// ── Props ─────────────────────────────────────────────────────────────────────

interface InstanceProgressProps {
  instanceId: string
  formId?: string | null
  compact?: boolean
  onSectionClick?: (sectionId: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function progressColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function progressTextColor(pct: number): string {
  if (pct >= 100) return 'text-green-600'
  if (pct >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function sectionPct(section: SectionCompletionState): number {
  if (section.total_relevant === 0) return 100
  return Math.round((section.filled / section.total_relevant) * 100)
}

// ── Section Row ──────────────────────────────────────────────────────────────

function SectionRow({
  section,
  label,
  expanded,
  onToggle,
  onClick,
}: {
  section: SectionCompletionState
  label: string
  expanded: boolean
  onToggle: () => void
  onClick?: () => void
}) {
  const pct = sectionPct(section)

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex items-center gap-2 w-full py-2 px-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => {
          if (onClick) {
            onClick()
          } else {
            onToggle()
          }
        }}
      >
        {/* Status icon */}
        {section.complete ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        ) : section.blocked > 0 ? (
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        ) : section.stale > 0 ? (
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
        )}

        {/* Section name */}
        <span className="text-xs font-medium flex-1 truncate">{label}</span>

        {/* Badges */}
        {section.stale > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50 shrink-0"
          >
            {section.stale} stale
          </Badge>
        )}
        {section.blocked > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-red-300 text-red-600 bg-red-50 shrink-0"
          >
            {section.blocked} blocked
          </Badge>
        )}

        {/* Counts */}
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          {section.filled}/{section.total_relevant}
        </span>

        {/* Expand chevron */}
        {!onClick && (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', progressColor(pct))}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={cn('text-[10px] font-medium tabular-nums', progressTextColor(pct))}>
              {pct}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function InstanceProgress({
  instanceId,
  formId,
  compact = false,
  onSectionClick,
}: InstanceProgressProps) {
  const { data: completionState, isLoading } = useCompletionState(instanceId)
  const { data: formSections } = useIrccFormSections(formId ?? null)

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Build a section_id -> label lookup from form sections
  const sectionLabels = useMemo(() => {
    const map = new Map<string, string>()
    if (formSections) {
      for (const section of formSections) {
        map.set(section.id, section.title)
      }
    }
    map.set('__unsectioned__', 'Other Fields')
    return map
  }, [formSections])

  // Sort sections by form section order
  const sortedSections = useMemo(() => {
    if (!completionState?.sections) return []

    const entries = Object.entries(completionState.sections)

    // Build a sort-order lookup from formSections
    const orderMap = new Map<string, number>()
    if (formSections) {
      for (const section of formSections) {
        orderMap.set(section.id, section.sort_order)
      }
    }

    return entries.sort(([aId], [bId]) => {
      // __unsectioned__ always goes last
      if (aId === '__unsectioned__') return 1
      if (bId === '__unsectioned__') return -1
      return (orderMap.get(aId) ?? 999) - (orderMap.get(bId) ?? 999)
    })
  }, [completionState?.sections, formSections])

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-3 gap-0">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-1.5 bg-muted rounded-full" />
          <div className="h-3 bg-muted rounded w-16" />
        </div>
      </Card>
    )
  }

  // No data state
  if (!completionState) {
    return (
      <Card className="p-3 gap-0">
        <p className="text-xs text-muted-foreground">No completion data available</p>
      </Card>
    )
  }

  const { completion_pct, total_filled, total_relevant, total_stale, total_blocked } =
    completionState

  // ── Compact mode ──────────────────────────────────────────────────────────

  if (compact) {
    return (
      <div className="space-y-1.5">
        {/* Overall bar */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Completion
          </span>
          <span
            className={cn(
              'text-xs font-bold tabular-nums',
              progressTextColor(completion_pct)
            )}
          >
            {completion_pct}%
          </span>
        </div>

        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progressColor(completion_pct)
            )}
            style={{ width: `${completion_pct}%` }}
          />
        </div>

        {/* Summary counts */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {total_filled}/{total_relevant} fields
          </span>
          {total_stale > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50"
            >
              {total_stale} stale
            </Badge>
          )}
          {total_blocked > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-red-300 text-red-600 bg-red-50"
            >
              {total_blocked} blocked
            </Badge>
          )}
        </div>
      </div>
    )
  }

  // ── Full mode ─────────────────────────────────────────────────────────────

  return (
    <Card className="overflow-hidden gap-0 py-0">
      {/* Overall progress header */}
      <div className="px-3 py-2.5 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold">Form Completion</span>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                progressTextColor(completion_pct)
              )}
            >
              {completion_pct}%
            </span>
            {completion_pct === 100 && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </div>
        </div>

        <Progress
          value={completion_pct}
          className={cn(
            'h-2',
            completion_pct >= 100
              ? '[&>[data-slot=progress-indicator]]:bg-green-500'
              : completion_pct >= 60
                ? '[&>[data-slot=progress-indicator]]:bg-amber-500'
                : '[&>[data-slot=progress-indicator]]:bg-red-500'
          )}
        />

        {/* Overall counts */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {total_filled}/{total_relevant} fields filled
          </span>
          {total_stale > 0 && (
            <span className="text-[10px] text-amber-600 tabular-nums flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" />
              {total_stale} stale
            </span>
          )}
          {total_blocked > 0 && (
            <span className="text-[10px] text-red-600 tabular-nums flex items-center gap-0.5">
              <XCircle className="h-3 w-3" />
              {total_blocked} blocked
            </span>
          )}
        </div>
      </div>

      {/* Section list */}
      <ScrollArea className="max-h-[400px]">
        {sortedSections.map(([sectionId, section]) => (
          <SectionRow
            key={sectionId}
            section={section}
            label={sectionLabels.get(sectionId) ?? sectionId}
            expanded={expandedSections.has(sectionId)}
            onToggle={() => toggleSection(sectionId)}
            onClick={onSectionClick ? () => onSectionClick(sectionId) : undefined}
          />
        ))}

        {sortedSections.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">No sections to display</p>
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
