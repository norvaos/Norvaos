'use client'

/**
 * AnswerHistoryPanel  -  Audit trail timeline for form instance answer changes.
 *
 * Features:
 * 1. Timeline view: each change as a card with timestamp, field, diff, source, user
 * 2. Filter by field (dropdown of all fields that have history)
 * 3. Filter by source (client_portal, staff_entry, cross_form_reuse, etc.)
 * 4. Pagination (20 at a time, load more button)
 * 5. Reuse log section: cross-form and cross-matter imports
 */

import { useState, useMemo } from 'react'
import { Clock, ArrowRight, User, RefreshCw, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useInstanceAnswerHistory,
  useFieldAnswerHistory,
  useInstanceReuseLog,
} from '@/lib/queries/answer-history'
import type { AnswerHistoryRow, ReuseLogRow } from '@/lib/queries/answer-history'
import type { AnswerSource } from '@/lib/ircc/types/answers'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnswerHistoryPanelProps {
  instanceId: string
  selectedFieldPath?: string // if set, shows only this field's history
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const SOURCE_LABELS: Record<AnswerSource, string> = {
  client_portal: 'Client Portal',
  staff_entry: 'Staff Entry',
  canonical_prefill: 'Canonical Prefill',
  cross_form_reuse: 'Cross-form Reuse',
  cross_matter_import: 'Cross-matter Import',
  extraction: 'Extraction',
  migration: 'Migration',
}

const SOURCE_COLOURS: Record<AnswerSource, string> = {
  client_portal: 'border-blue-300 text-blue-400 bg-blue-950/30',
  staff_entry: 'border-green-300 text-emerald-400 bg-emerald-950/30',
  canonical_prefill: 'border-purple-300 text-purple-400 bg-purple-950/30',
  cross_form_reuse: 'border-amber-300 text-amber-400 bg-amber-950/30',
  cross_matter_import: 'border-indigo-300 text-indigo-700 bg-indigo-50',
  extraction: 'border-slate-300 text-slate-600 bg-slate-50',
  migration: 'border-slate-300 text-slate-600 bg-slate-50',
}

const REUSE_TYPE_LABELS: Record<string, string> = {
  cross_form: 'Cross-form',
  cross_matter: 'Cross-matter',
  canonical_prefill: 'Canonical Prefill',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a profile_path for display (e.g. "personal.family_name" -> "Family Name") */
function formatProfilePath(path: string): string {
  const lastSegment = path.split('.').pop() ?? path
  return lastSegment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Relative time string (e.g. "2 hours ago", "3 days ago") */
function relativeTime(iso: string): string {
  try {
    const now = Date.now()
    const then = new Date(iso).getTime()
    const diffMs = now - then

    const seconds = Math.floor(diffMs / 1000)
    if (seconds < 60) return 'just now'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`

    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`

    const years = Math.floor(months / 12)
    return `${years} year${years !== 1 ? 's' : ''} ago`
  } catch {
    return iso
  }
}

/** Format ISO timestamp for tooltip */
function formatFullTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: AnswerSource }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] py-0 px-1.5 ${SOURCE_COLOURS[source] ?? 'border-slate-300 text-slate-600 bg-slate-50'}`}
    >
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  )
}

function HistoryCard({ row }: { row: AnswerHistoryRow }) {
  return (
    <div className="px-3 py-2.5 hover:bg-muted/30 transition-colors">
      {/* Top row: timestamp + source */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span
            className="text-[10px] text-muted-foreground"
            title={formatFullTimestamp(row.changed_at)}
          >
            {relativeTime(row.changed_at)}
          </span>
        </div>
        <SourceBadge source={row.source} />
      </div>

      {/* Field label */}
      <p className="text-[11px] font-medium mb-1">
        {formatProfilePath(row.profile_path)}
        <span className="text-[10px] text-muted-foreground font-normal ml-1.5">
          {row.profile_path}
        </span>
      </p>

      {/* Diff: old -> new */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono">
        <span className="text-red-600/80 line-through truncate max-w-[40%]">
          {formatValue(row.old_value)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-emerald-400 truncate max-w-[40%]">
          {formatValue(row.new_value)}
        </span>
      </div>

      {/* Bottom row: changed by + stale indicator */}
      <div className="flex items-center gap-2 mt-1.5">
        {row.changed_by_name && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span>{row.changed_by_name}</span>
          </div>
        )}
        {row.stale_triggered && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-orange-300 text-orange-600 bg-orange-950/30"
          >
            Stale Triggered
          </Badge>
        )}
        {row.source_origin && (
          <span className="text-[10px] text-muted-foreground truncate">
            via {row.source_origin}
          </span>
        )}
      </div>
    </div>
  )
}

function ReuseLogCard({ row }: { row: ReuseLogRow }) {
  return (
    <div className="px-3 py-2.5 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 text-indigo-500 shrink-0" />
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-indigo-300 text-indigo-700 bg-indigo-50"
          >
            {REUSE_TYPE_LABELS[row.reuse_type] ?? row.reuse_type}
          </Badge>
        </div>
        <span
          className="text-[10px] text-muted-foreground"
          title={formatFullTimestamp(row.created_at)}
        >
          {relativeTime(row.created_at)}
        </span>
      </div>

      <p className="text-[11px] font-medium mb-0.5">
        {formatProfilePath(row.target_profile_path)}
      </p>

      <p className="text-[10px] font-mono text-muted-foreground truncate mb-1">
        {formatValue(row.value)}
      </p>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {row.source_instance_id && (
          <span>Source instance: {row.source_instance_id.slice(0, 8)}...</span>
        )}
        {row.source_matter_id && (
          <span>Source matter: {row.source_matter_id.slice(0, 8)}...</span>
        )}
        {row.accepted !== null && (
          <Badge
            variant="outline"
            className={`text-[10px] py-0 px-1.5 ${
              row.accepted
                ? 'border-green-300 text-emerald-400 bg-emerald-950/30'
                : 'border-red-300 text-red-600 bg-red-950/30'
            }`}
          >
            {row.accepted ? 'Accepted' : 'Rejected'}
          </Badge>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnswerHistoryPanel({
  instanceId,
  selectedFieldPath,
}: AnswerHistoryPanelProps) {
  // ── Filters ──────────────────────────────────────────────────────────────
  const [fieldFilter, setFieldFilter] = useState<string>(selectedFieldPath ?? 'all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // ── Data fetching ────────────────────────────────────────────────────────

  // When a specific field is locked via props, use the field-specific hook;
  // otherwise fetch the full instance history and filter client-side.
  const instanceHistoryQuery = useInstanceAnswerHistory(instanceId)
  const fieldHistoryQuery = useFieldAnswerHistory(
    instanceId,
    selectedFieldPath ?? '',
  )
  const reuseLogQuery = useInstanceReuseLog(instanceId)

  // Choose the right data source based on whether a field is locked via props
  const rawHistory = selectedFieldPath
    ? fieldHistoryQuery.data ?? []
    : instanceHistoryQuery.data ?? []

  const isLoading = selectedFieldPath
    ? fieldHistoryQuery.isLoading
    : instanceHistoryQuery.isLoading

  const reuseLog = reuseLogQuery.data ?? []

  // ── Unique fields for filter dropdown ────────────────────────────────────

  const uniqueFields = useMemo(() => {
    const fields = new Set<string>()
    for (const row of rawHistory) {
      fields.add(row.profile_path)
    }
    return Array.from(fields).sort()
  }, [rawHistory])

  // ── Apply filters ────────────────────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    let result = rawHistory

    // Field filter (only if not locked via props)
    if (!selectedFieldPath && fieldFilter !== 'all') {
      result = result.filter((r) => r.profile_path === fieldFilter)
    }

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter((r) => r.source === sourceFilter)
    }

    return result
  }, [rawHistory, fieldFilter, sourceFilter, selectedFieldPath])

  // ── Pagination ───────────────────────────────────────────────────────────

  const visibleHistory = filteredHistory.slice(0, visibleCount)
  const hasMore = filteredHistory.length > visibleCount

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className="overflow-hidden gap-0 py-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Answer History</span>
        {filteredHistory.length > 0 && (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
            {filteredHistory.length} change{filteredHistory.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        {/* Field filter (hidden when locked via props) */}
        {!selectedFieldPath && (
          <Select value={fieldFilter} onValueChange={(v) => { setFieldFilter(v); setVisibleCount(PAGE_SIZE) }}>
            <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
              <SelectValue placeholder="All fields" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fields</SelectItem>
              {uniqueFields.map((f) => (
                <SelectItem key={f} value={f}>
                  {formatProfilePath(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Source filter */}
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setVisibleCount(PAGE_SIZE) }}>
          <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(Object.keys(SOURCE_LABELS) as AnswerSource[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SOURCE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-muted-foreground">Loading history...</p>
        </div>
      ) : visibleHistory.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            No answer changes recorded yet
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[400px]">
          {visibleHistory.map((row, idx) => (
            <div key={row.id}>
              <HistoryCard row={row} />
              {idx < visibleHistory.length - 1 && <Separator />}
            </div>
          ))}
        </ScrollArea>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="px-3 py-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleLoadMore}
          >
            Show more ({filteredHistory.length - visibleCount} remaining)
          </Button>
        </div>
      )}

      {/* Reuse Log Section */}
      {reuseLog.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/40 border-b">
            <RefreshCw className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-semibold text-indigo-800">
              Reuse Log
            </span>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-indigo-300 text-indigo-700 bg-indigo-50"
            >
              {reuseLog.length} event{reuseLog.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <ScrollArea className="max-h-[200px]">
            {reuseLog.map((row, idx) => (
              <div key={row.id}>
                <ReuseLogCard row={row} />
                {idx < reuseLog.length - 1 && <Separator />}
              </div>
            ))}
          </ScrollArea>
        </>
      )}
    </Card>
  )
}
