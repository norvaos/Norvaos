'use client'

/**
 * TravelHistoryTimeline  -  Visual 10-Year Gap Analyser
 *
 * Renders the travel history analysis as a compact horizontal timeline
 * with colour-coded segments:
 *   - Emerald: Covered periods
 *   - Red:     Critical gaps (>= 30 days)
 *   - Amber:   Warning gaps (14-29 days)
 *   - Grey:    Small gaps (< 14 days, OK)
 *
 * Shows a summary card with gap count and coverage percentage.
 * Each gap is clickable  -  triggers a callback to scroll to the
 * relevant travel history section in the form wizard.
 */

import { useMemo } from 'react'
import {
  analyseTravelHistory,
  type TravelHistoryEntry,
  type TravelHistoryAnalysis,
  type TravelGap,
} from '@/lib/services/travel-history-gap-analyser'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  MapPin,
  Calendar,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface TravelHistoryTimelineProps {
  /** Travel history entries from profile data */
  entries: TravelHistoryEntry[]
  /** Reference date for the 10-year window (defaults to today) */
  referenceDate?: string
  /** Callback when a gap is clicked (to scroll to travel history section) */
  onGapClick?: (gap: TravelGap) => void
  /** Compact mode (no timeline bar, just stats) */
  compact?: boolean
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function TravelHistoryTimeline({
  entries,
  referenceDate,
  onGapClick,
  compact,
  className,
}: TravelHistoryTimelineProps) {
  const analysis = useMemo(
    () => analyseTravelHistory(entries, referenceDate),
    [entries, referenceDate],
  )

  const criticalCount = analysis.gaps.filter((g) => g.severity === 'critical').length
  const warningCount = analysis.gaps.filter((g) => g.severity === 'warning').length

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Travel History (10yr)</span>
        </div>
        <StatusBadge analysis={analysis} />
      </div>

      {/* Coverage bar (non-compact) */}
      {!compact && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{analysis.windowStart}</span>
            <span>{analysis.coveragePct}% covered</span>
            <span>{analysis.windowEnd}</span>
          </div>
          <TimelineBar analysis={analysis} onGapClick={onGapClick} />
        </div>
      )}

      {/* Gap list */}
      {analysis.actionableGaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {analysis.actionableGaps.length} Gap{analysis.actionableGaps.length !== 1 ? 's' : ''} Detected
          </p>
          {analysis.actionableGaps.map((gap, i) => (
            <button
              key={`${gap.gapStart}-${gap.gapEnd}`}
              type="button"
              onClick={() => onGapClick?.(gap)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] transition-colors',
                gap.severity === 'critical'
                  ? 'bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
              )}
            >
              {gap.severity === 'critical' ? (
                <XCircle className="size-3 shrink-0" />
              ) : (
                <AlertTriangle className="size-3 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{gap.label}</span>
                <span className="ml-2 opacity-70">
                  {gap.gapStart} → {gap.gapEnd}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* All clear */}
      {analysis.isComplete && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3" />
          <span>10-year history complete  -  no gaps detected</span>
        </div>
      )}

      {/* Entry count */}
      <div className="text-[10px] text-muted-foreground">
        {analysis.entryCount} {analysis.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
        {analysis.coveredDays} of {analysis.totalWindowDays} days covered
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ analysis }: { analysis: TravelHistoryAnalysis }) {
  const criticalCount = analysis.gaps.filter((g) => g.severity === 'critical').length

  if (analysis.isComplete) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        Complete
      </span>
    )
  }

  if (criticalCount > 0) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
        <XCircle className="size-3" />
        {criticalCount} Critical Gap{criticalCount !== 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
      <AlertTriangle className="size-3" />
      Gaps Found
    </span>
  )
}

/**
 * TimelineBar  -  Proportional horizontal bar showing covered vs gap periods.
 * Each segment is proportional to its duration within the 10-year window.
 * Gaps are clickable.
 */
function TimelineBar({
  analysis,
  onGapClick,
}: {
  analysis: TravelHistoryAnalysis
  onGapClick?: (gap: TravelGap) => void
}) {
  // Build a merged segment list: covered + gaps, sorted by date
  const segments = useMemo(() => {
    const result: Array<{
      type: 'covered' | 'gap'
      start: string
      end: string
      widthPct: number
      gap?: TravelGap
    }> = []

    const total = analysis.totalWindowDays
    if (total <= 0) return result

    // Start from windowStart, interleave gaps and covered periods
    let cursor = analysis.windowStart

    // Sort all gaps by start date
    const sortedGaps = [...analysis.gaps].sort((a, b) =>
      a.gapStart.localeCompare(b.gapStart),
    )

    for (const gap of sortedGaps) {
      // Covered period before this gap
      if (gap.gapStart > cursor) {
        const days = daysBetweenSimple(cursor, gap.gapStart)
        if (days > 0) {
          result.push({
            type: 'covered',
            start: cursor,
            end: gap.gapStart,
            widthPct: (days / total) * 100,
          })
        }
      }

      // The gap itself
      result.push({
        type: 'gap',
        start: gap.gapStart,
        end: gap.gapEnd,
        widthPct: (gap.days / total) * 100,
        gap,
      })

      cursor = gap.gapEnd > cursor ? addDaysSimple(gap.gapEnd, 1) : cursor
    }

    // Covered period after last gap
    if (cursor < analysis.windowEnd) {
      const days = daysBetweenSimple(cursor, analysis.windowEnd)
      if (days > 0) {
        result.push({
          type: 'covered',
          start: cursor,
          end: analysis.windowEnd,
          widthPct: (days / total) * 100,
        })
      }
    }

    return result
  }, [analysis])

  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
      {segments.map((seg, i) => (
        <div
          key={`${seg.start}-${i}`}
          className={cn(
            'h-full transition-all duration-300',
            seg.type === 'covered' && 'bg-emerald-500/60',
            seg.type === 'gap' && seg.gap?.severity === 'critical' && 'bg-red-500/70 cursor-pointer hover:bg-red-500',
            seg.type === 'gap' && seg.gap?.severity === 'warning' && 'bg-amber-500/70 cursor-pointer hover:bg-amber-500',
            seg.type === 'gap' && seg.gap?.severity === 'ok' && 'bg-muted/50',
          )}
          style={{ width: `${Math.max(seg.widthPct, 0.5)}%` }}
          onClick={() => {
            if (seg.type === 'gap' && seg.gap && onGapClick) {
              onGapClick(seg.gap)
            }
          }}
          title={
            seg.type === 'gap' && seg.gap
              ? seg.gap.label
              : `Covered: ${seg.start} → ${seg.end}`
          }
        />
      ))}
    </div>
  )
}

// ── Date helpers (kept simple  -  no external deps) ─────────────────────────

function daysBetweenSimple(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

function addDaysSimple(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
