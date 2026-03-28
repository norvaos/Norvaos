'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Review Queue
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cross-matter dashboard showing all immigration matters needing attention.
 * Staff can filter by queue type, responsible lawyer, and search.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gavel,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useImmigrationReviewQueue,
  type ReviewQueueFilter,
  type ReviewQueueItem,
} from '@/lib/queries/immigration-review-queue'
import { IMMIGRATION_INTAKE_STATUSES } from '@/lib/utils/constants'

// ── Constants ────────────────────────────────────────────────────────────────

const QUEUE_FILTERS: { value: ReviewQueueFilter; label: string }[] = [
  { value: 'all', label: 'All Immigration Matters' },
  { value: 'pending_review', label: 'Pending Document Review' },
  { value: 'deficiency', label: 'Deficiency Outstanding' },
  { value: 'blocked_from_drafting', label: 'Blocked from Drafting' },
  { value: 'ready_for_generation', label: 'Ready for Generation' },
  { value: 'lawyer_review', label: 'Awaiting Lawyer Review' },
]

const PAGE_SIZE = 25

// ── Status Badge ─────────────────────────────────────────────────────────────

function ImmStatusBadge({ status }: { status: string }) {
  const config = IMMIGRATION_INTAKE_STATUSES.find((s) => s.value === status)
  if (!config) return <Badge variant="outline">{status}</Badge>

  return (
    <Badge
      style={{ backgroundColor: config.color, color: '#fff' }}
      className="text-xs font-medium whitespace-nowrap"
    >
      {config.label}
    </Badge>
  )
}

// ── Urgency Indicators ───────────────────────────────────────────────────────

function UrgencyIndicators({ item }: { item: ReviewQueueItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {item.contradictionCount > 0 && (
        <Badge variant="destructive" className="flex items-centre gap-1 text-xs">
          <ShieldAlert className="h-3 w-3" />
          {item.contradictionCount}
        </Badge>
      )}
      {item.pendingReviewCount > 0 && (
        <Badge variant="outline" className="flex items-centre gap-1 border-blue-500/30 text-blue-600 text-xs">
          <FileText className="h-3 w-3" />
          {item.pendingReviewCount}
        </Badge>
      )}
      {item.deficientCount > 0 && (
        <Badge variant="outline" className="flex items-centre gap-1 border-orange-500/30 text-orange-600 text-xs">
          <AlertCircle className="h-3 w-3" />
          {item.deficientCount}
        </Badge>
      )}
      {item.stalePacks > 0 && (
        <Badge variant="outline" className="flex items-centre gap-1 border-red-500/30 text-red-600 text-xs">
          <XCircle className="h-3 w-3" />
          {item.stalePacks} stale
        </Badge>
      )}
      {item.lawyerReviewStatus === 'pending' && (
        <Badge variant="outline" className="flex items-centre gap-1 border-indigo-300 text-indigo-600 text-xs">
          <Gavel className="h-3 w-3" />
          Review
        </Badge>
      )}
    </div>
  )
}

// ── Days Ago ─────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return ' - '
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function ImmigrationReviewQueuePage() {
  const router = useRouter()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [filter, setFilter] = useState<ReviewQueueFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filter/search changes
  useEffect(() => {
    setPage(1)
  }, [filter, debouncedSearch])

  const {
    data: result,
    isLoading,
    isError,
    refetch,
  } = useImmigrationReviewQueue({
    tenantId: tenantId ?? '',
    filter,
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy: 'updated_at',
    sortDirection: 'desc',
  })

  const handleRowClick = useCallback(
    (matterId: string) => {
      router.push(`/matters/${matterId}`)
    },
    [router]
  )

  if (!tenantId) return null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Immigration Review Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Cross-matter view of all immigration files needing attention.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-centre sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by matter number or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as ReviewQueueFilter)}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUEUE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCcw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Count */}
      {result && (
        <p className="text-sm text-muted-foreground">
          {result.totalCount} matter{result.totalCount !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <Card>
          <CardContent className="flex items-centre justify-centre py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading review queue…
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {isError && (
        <Card>
          <CardContent className="flex flex-col items-centre justify-centre py-12 gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Failed to load the review queue.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {result && !isLoading && !isError && (
        <>
          {result.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-centre justify-centre py-12 gap-2">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'all'
                    ? 'No active immigration matters found.'
                    : 'No matters match this filter.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">File #</TableHead>
                    <TableHead>Matter</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Questionnaire</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item) => (
                    <TableRow
                      key={item.matterId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(item.matterId)}
                    >
                      <TableCell className="font-mono text-sm">
                        {item.matterNumber || ' - '}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {item.matterTitle || 'Untitled'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {item.matterType}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ImmStatusBadge
                          status={item.immigrationIntakeStatus}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {item.completionPct}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <UrgencyIndicators item={item} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {daysAgo(item.lastActivityAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex items-centre justify-between">
              <p className="text-sm text-muted-foreground">
                Page {result.page} of {result.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
