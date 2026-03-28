'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  SOVEREIGN_EVENT_TYPES,
  type SovereignEventType,
  type SovereignAuditEntry,
} from '@/lib/services/sovereign-audit-engine'

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

/** Colour-coded dot per event category */
function getEventColour(eventType: string): {
  dot: string
  bg: string
  label: string
} {
  switch (eventType) {
    case 'MATTER_IGNITED':
      return {
        dot: 'bg-violet-500',
        bg: 'bg-violet-500/10 dark:bg-violet-500/20',
        label: 'IGNITE',
      }
    case 'DOCUMENT_DELETED':
      return {
        dot: 'bg-red-500',
        bg: 'bg-red-500/10 dark:bg-red-500/20',
        label: 'Deletion',
      }
    case 'DOCUMENT_REPLACED':
    case 'MATTER_STATUS_CHANGED':
    case 'STAGE_ADVANCED':
      return {
        dot: 'bg-amber-500',
        bg: 'bg-amber-500/10 dark:bg-amber-500/20',
        label: 'Modification',
      }
    default:
      return {
        dot: 'bg-emerald-500',
        bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
        label: 'Creation',
      }
  }
}

/** Human-readable description for an event type */
function describeEvent(entry: SovereignAuditEntry): string {
  const name =
    [entry.user_first_name, entry.user_last_name].filter(Boolean).join(' ') ||
    entry.user_email ||
    'System'

  const record = entry.record_id ? ` on ${entry.record_id.slice(0, 8)}...` : ''

  const descriptions: Record<string, string> = {
    MATTER_CREATED: `${name} created a new matter${record}`,
    MATTER_IGNITED: `${name} IGNITED matter${record}  -  all readiness gates passed`,
    DOCUMENT_UPLOADED: `${name} uploaded a document${record}`,
    DOCUMENT_REPLACED: `${name} replaced a document${record}`,
    DOCUMENT_DELETED: `${name} deleted a document${record}`,
    MATTER_STATUS_CHANGED: `${name} changed matter status${record}`,
    READINESS_100: `${name} achieved 100% readiness${record}`,
    CLIENT_PORTAL_ACCESS: `Client portal accessed${record}`,
    RETAINER_SIGNED: `${name} signed the retainer agreement${record}`,
    STAGE_ADVANCED: `${name} advanced the matter stage${record}`,
  }

  return descriptions[entry.event_type] ?? `${name} performed ${entry.event_type}${record}`
}

/** Format a timestamp to millisecond precision */
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

// ── Diff View ────────────────────────────────────────────────────────────────

function DiffView({ details }: { details: Record<string, unknown> }) {
  const before = (details?.before ?? {}) as Record<string, unknown>
  const after = (details?.after ?? {}) as Record<string, unknown>
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]

  if (allKeys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No diff data available for this event.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
      {/* Header */}
      <div className="font-semibold text-red-500 dark:text-red-400 pb-1 border-b border-red-500/20">
        Before
      </div>
      <div className="font-semibold text-emerald-500 dark:text-emerald-400 pb-1 border-b border-emerald-500/20">
        After
      </div>
      {allKeys.map((key) => {
        const bVal = before[key]
        const aVal = after[key]
        const changed = JSON.stringify(bVal) !== JSON.stringify(aVal)
        return (
          <div key={key} className="contents">
            <div
              className={cn(
                'py-0.5 px-1 rounded',
                changed && bVal !== undefined
                  ? 'bg-red-500/10 dark:bg-red-500/20 text-red-400 dark:text-red-300'
                  : 'text-muted-foreground',
              )}
            >
              <span className="text-muted-foreground">{key}: </span>
              {bVal !== undefined ? JSON.stringify(bVal) : '(none)'}
            </div>
            <div
              className={cn(
                'py-0.5 px-1 rounded',
                changed && aVal !== undefined
                  ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-400 dark:text-emerald-300'
                  : 'text-muted-foreground',
              )}
            >
              <span className="text-muted-foreground">{key}: </span>
              {aVal !== undefined ? JSON.stringify(aVal) : '(none)'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ForensicStream() {
  const { appUser } = useUser()
  const tenantId = appUser?.tenant_id

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [igniteOnly, setIgniteOnly] = useState(false)

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null)

  const effectiveEventType = igniteOnly
    ? 'MATTER_IGNITED'
    : eventTypeFilter !== 'all'
      ? eventTypeFilter
      : undefined

  // ── Data fetching ──────────────────────────────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: [
      'sovereign-audit-stream',
      tenantId,
      effectiveEventType,
      userIdFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(PAGE_SIZE),
      })
      if (effectiveEventType) params.set('eventType', effectiveEventType)
      if (userIdFilter) params.set('userId', userIdFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const res = await fetch(`/api/audit/stream?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch audit stream')
      return res.json() as Promise<{
        entries: SovereignAuditEntry[]
        total: number
        page: number
        limit: number
      }>
    },
    getNextPageParam: (lastPage) => {
      const fetched = lastPage.page * lastPage.limit
      return fetched < lastPage.total ? lastPage.page + 1 : undefined
    },
    initialPageParam: 1,
    enabled: !!tenantId,
    staleTime: 1000 * 30, // 30s  -  audit data refreshes frequently
  })

  const allEntries = useMemo(
    () => data?.pages.flatMap((p) => p.entries) ?? [],
    [data],
  )

  const totalCount = data?.pages[0]?.total ?? 0

  // ── Virtual scrolling ──────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: allEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  })

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    // Fetch next page when within 200px of bottom
    if (
      scrollHeight - scrollTop - clientHeight < 200 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Event type filter */}
        <Select
          value={igniteOnly ? 'MATTER_IGNITED' : eventTypeFilter}
          onValueChange={(v) => {
            setIgniteOnly(false)
            setEventTypeFilter(v)
          }}
          disabled={igniteOnly}
        >
          <SelectTrigger className="w-[200px] bg-white/60 dark:bg-white/5 backdrop-blur-md border-white/20 dark:border-white/10">
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {SOVEREIGN_EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* User ID filter */}
        <Input
          placeholder="Filter by user ID..."
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          className="w-[200px] bg-white/60 dark:bg-white/5 backdrop-blur-md border-white/20 dark:border-white/10"
        />

        {/* Date range */}
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[160px] bg-white/60 dark:bg-white/5 backdrop-blur-md border-white/20 dark:border-white/10"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[160px] bg-white/60 dark:bg-white/5 backdrop-blur-md border-white/20 dark:border-white/10"
          placeholder="To"
        />

        {/* IGNITE-only toggle */}
        <Button
          variant={igniteOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setIgniteOnly(!igniteOnly)
            if (!igniteOnly) setEventTypeFilter('all')
          }}
          className={cn(
            'transition-all',
            igniteOnly &&
              'bg-violet-600 hover:bg-violet-700 text-white border-violet-600',
          )}
        >
          <span
            className={cn(
              'inline-block w-2 h-2 rounded-full mr-2',
              igniteOnly ? 'bg-white' : 'bg-violet-500',
            )}
          />
          Ignite Only
        </Button>

        {/* Count badge */}
        <Badge
          variant="secondary"
          className="ml-auto bg-white/60 dark:bg-white/5 backdrop-blur-md"
        >
          {totalCount.toLocaleString()} events
        </Badge>
      </div>

      {/* ── Stream Container ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Loading audit stream...
          </div>
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-64 text-red-500 dark:text-red-400">
          Failed to load audit stream. Ensure you have admin access.
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No audit events match the current filters.
        </div>
      ) : (
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto rounded-xl border border-white/10 dark:border-white/5 bg-white/40 dark:bg-black/30 backdrop-blur-xl"
          style={{ contain: 'strict' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = allEntries[virtualRow.index]
              if (!entry) return null

              const colour = getEventColour(entry.event_type)
              const isExpanded = expandedId === entry.id
              const userName =
                [entry.user_first_name, entry.user_last_name]
                  .filter(Boolean)
                  .join(' ') || entry.user_email || 'System'

              return (
                <div
                  key={entry.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Entry card */}
                  <motion.div
                    layout
                    className={cn(
                      'mx-2 my-1 rounded-lg border cursor-pointer transition-colours',
                      'border-white/10 dark:border-white/5',
                      'bg-white/60 dark:bg-white/5 backdrop-blur-xl',
                      'hover:bg-white/80 dark:hover:bg-white/10',
                      isExpanded && 'ring-1 ring-primary/30',
                    )}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.id)
                    }
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Colour-coded micro-dot */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div
                          className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0',
                            colour.dot,
                          )}
                        />
                      </div>

                      {/* Avatar */}
                      <div className="shrink-0">
                        {entry.user_avatar_url ? (
                          <img
                            src={entry.user_avatar_url}
                            alt={userName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                            {userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">
                            {userName}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] px-1.5 py-0 h-4',
                              colour.bg,
                            )}
                          >
                            {entry.event_type.replace(/_/g, ' ')}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4"
                          >
                            {entry.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {describeEvent(entry)}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground font-mono">
                          <span>{formatTimestamp(entry.created_at)}</span>
                          {entry.ip_address && (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground/60">
                                Origin:
                              </span>
                              {entry.ip_address}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <div className="shrink-0 pt-1">
                        <motion.svg
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-4 h-4 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </motion.svg>
                      </div>
                    </div>

                    {/* Expanded diff view */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1 border-t border-white/10 dark:border-white/5">
                            <div className="rounded-lg bg-white/40 dark:bg-black/20 backdrop-blur-md p-3 mt-2">
                              <DiffView
                                details={
                                  entry.details as Record<string, unknown>
                                }
                              />
                              {entry.table_name && (
                                <p className="text-[11px] text-muted-foreground mt-2 font-mono">
                                  Table: {entry.table_name}
                                  {entry.record_id &&
                                    ` | Record: ${entry.record_id}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )
            })}
          </div>

          {/* Loading more indicator */}
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
              Loading more entries...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
