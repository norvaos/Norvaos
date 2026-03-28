'use client'

import { useState, useMemo } from 'react'
import {
  Users,
  UserCheck,
  DollarSign,
  Banknote,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  BarChart3,
  ChevronRight,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  useConversionAnalytics,
  type ConversionGroupBy,
  type ConversionSourceRow,
} from '@/lib/queries/conversion-analytics'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { TenantDateInput } from '@/components/ui/tenant-date-input'

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: { value: ConversionGroupBy; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'medium', label: 'Medium' },
  { value: 'campaign', label: 'Campaign' },
]

/** Colour palette for source revenue bars */
const BAR_COLOURS = [
  'bg-indigo-500',
  'bg-teal-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-pink-500',
]

type SortColumn = keyof Pick<
  ConversionSourceRow,
  | 'source'
  | 'totalLeads'
  | 'convertedLeads'
  | 'conversionRate'
  | 'totalBilledCents'
  | 'totalPaidCents'
  | 'avgMatterValueCents'
  | 'revenuePerLead'
>

type SortDirection = 'asc' | 'desc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function fmtCAD(cents: number): string {
  return cadFormatter.format(cents / 100)
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat('en-CA').format(value)
}

/** Return a Tailwind text colour class based on conversion rate thresholds */
function convRateColour(rate: number): string {
  if (rate >= 30) return 'text-green-600'
  if (rate >= 15) return 'text-amber-600'
  return 'text-red-600'
}

/** Return a Tailwind bg colour class for conversion rate badge */
function convRateBadgeVariant(rate: number): string {
  if (rate >= 30) return 'bg-emerald-950/40 text-emerald-400 dark:bg-green-900/30 dark:text-green-400'
  if (rate >= 15) return 'bg-amber-950/40 text-amber-400 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-950/40 text-red-400 dark:bg-red-900/30 dark:text-red-400'
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: from.toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  }
}

// ─── Skeleton Components ─────────────────────────────────────────────────────

function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BarChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
        <BarChart3 className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          No conversion data available.
        </p>
        <p className="max-w-md text-centre text-xs text-muted-foreground">
          Leads will appear here once they are created and tracked.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          Failed to load conversion analytics
        </p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

// ─── KPI Summary Cards ───────────────────────────────────────────────────────

function SummaryCards({
  totalLeads,
  totalConverted,
  overallConversionRate,
  totalBilledCents,
  totalPaidCents,
  totalPipelineCents,
}: {
  totalLeads: number
  totalConverted: number
  overallConversionRate: number
  totalBilledCents: number
  totalPaidCents: number
  totalPipelineCents: number
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Total Leads */}
      <Card>
        <CardHeader className="flex flex-row items-centre justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {fmtNumber(totalLeads)}
          </div>
        </CardContent>
      </Card>

      {/* Converted */}
      <Card>
        <CardHeader className="flex flex-row items-centre justify-between pb-2">
          <CardTitle className="text-sm font-medium">Converted</CardTitle>
          <UserCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {fmtNumber(totalConverted)}
            </span>
            <Badge className={cn('text-xs tabular-nums', convRateBadgeVariant(overallConversionRate))}>
              {fmtPct(overallConversionRate)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Total Billed */}
      <Card>
        <CardHeader className="flex flex-row items-centre justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Billed</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {fmtCAD(totalBilledCents)}
          </div>
        </CardContent>
      </Card>

      {/* Total Collected */}
      <Card>
        <CardHeader className="flex flex-row items-centre justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
          <Banknote className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums text-green-600">
            {fmtCAD(totalPaidCents)}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Value */}
      <Card>
        <CardHeader className="flex flex-row items-centre justify-between pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums text-amber-600">
            {fmtCAD(totalPipelineCents)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Sortable Column Header ──────────────────────────────────────────────────

function SortableHeader({
  label,
  column,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string
  column: SortColumn
  currentSort: SortColumn
  currentDirection: SortDirection
  onSort: (col: SortColumn) => void
  className?: string
}) {
  const isActive = currentSort === column
  return (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 gap-1 text-xs font-medium"
        onClick={() => onSort(column)}
      >
        {label}
        {isActive ? (
          currentDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </Button>
    </TableHead>
  )
}

// ─── Revenue Attribution Table ───────────────────────────────────────────────

function RevenueTable({
  rows,
  groupBy,
}: {
  rows: ConversionSourceRow[]
  groupBy: ConversionGroupBy
}) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('totalPaidCents')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      const aNum = (aVal as number) ?? 0
      const bNum = (bVal as number) ?? 0
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })
    return sorted
  }, [rows, sortColumn, sortDirection])

  // Determine top performer by totalPaidCents
  const topPerformerSource = useMemo(() => {
    if (rows.length === 0) return null
    const top = rows.reduce((best, row) =>
      row.totalPaidCents > best.totalPaidCents ? row : best,
    )
    return top.totalPaidCents > 0 ? top.source : null
  }, [rows])

  const showSecondaryColumn = groupBy !== 'source'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue Attribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  label="Source"
                  column="source"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                {showSecondaryColumn && (
                  <TableHead className="text-xs font-medium">
                    {groupBy === 'medium' ? 'Medium' : 'Campaign'}
                  </TableHead>
                )}
                <SortableHeader
                  label="Leads"
                  column="totalLeads"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Converted"
                  column="convertedLeads"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Conv. Rate %"
                  column="conversionRate"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Billed"
                  column="totalBilledCents"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Collected"
                  column="totalPaidCents"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Avg Matter Value"
                  column="avgMatterValueCents"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Revenue/Lead"
                  column="revenuePerLead"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row, idx) => {
                const isTopPerformer = row.source === topPerformerSource
                return (
                  <TableRow
                    key={`${row.source}-${row.medium}-${row.campaign}-${idx}`}
                    className={cn(
                      isTopPerformer && 'border-l-2 border-l-green-500',
                    )}
                  >
                    <TableCell className="font-medium">
                      {row.source || '(direct)'}
                    </TableCell>
                    {showSecondaryColumn && (
                      <TableCell className="text-muted-foreground">
                        {(groupBy === 'medium' ? row.medium : row.campaign) || '\u2014'}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {fmtNumber(row.totalLeads)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNumber(row.convertedLeads)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'tabular-nums font-medium',
                          convRateColour(row.conversionRate),
                        )}
                      >
                        {fmtPct(row.conversionRate)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.totalBilledCents > 0
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {fmtCAD(row.totalBilledCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.totalPaidCents > 0
                          ? 'text-green-600'
                          : 'text-muted-foreground',
                      )}
                    >
                      {fmtCAD(row.totalPaidCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.avgMatterValueCents > 0
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {fmtCAD(row.avgMatterValueCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.revenuePerLead > 0
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {fmtCAD(row.revenuePerLead)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Source Revenue Bar Chart (pure CSS) ──────────────────────────────────────

function SourceRevenueBar({ rows }: { rows: ConversionSourceRow[] }) {
  const barData = useMemo(() => {
    const sorted = [...rows]
      .filter((r) => r.totalPaidCents > 0)
      .sort((a, b) => b.totalPaidCents - a.totalPaidCents)
      .slice(0, 10)
    return sorted
  }, [rows])

  if (barData.length === 0) return null

  const maxValue = barData[0].totalPaidCents

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue by Source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {barData.map((row, idx) => {
          const widthPct = maxValue > 0 ? (row.totalPaidCents / maxValue) * 100 : 0
          const colourClass = BAR_COLOURS[idx % BAR_COLOURS.length]

          return (
            <div key={`${row.source}-${idx}`} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-sm font-medium">
                {row.source || '(direct)'}
              </span>
              <div className="relative flex-1">
                <div
                  className={cn('h-7 rounded', colourClass)}
                  style={{ width: `${Math.max(widthPct, 2)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {fmtCAD(row.totalPaidCents)}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ConversionAnalyticsPage() {
  const defaultRange = getDefaultDateRange()
  const [groupBy, setGroupBy] = useState<ConversionGroupBy>('source')
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)

  const { data, isLoading, isError, error } = useConversionAnalytics({
    groupBy,
    from: fromDate || undefined,
    to: toDate || undefined,
  })

  const hasData = data && data.rows.length > 0

  return (
    <div className="space-y-6 p-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>Analytics</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Conversion</span>
      </nav>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Conversion Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Which sources are paying the bills
        </p>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Group By */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Group By
          </label>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as ConversionGroupBy)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* From Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <TenantDateInput
            value={fromDate}
            onChange={(iso) => setFromDate(iso)}
            className="h-9 w-[160px]"
          />
        </div>

        {/* To Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <TenantDateInput
            value={toDate}
            onChange={(iso) => setToDate(iso)}
            className="h-9 w-[160px]"
          />
        </div>
      </div>

      {/* ── Loading State ───────────────────────────────────────────────── */}
      {isLoading && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <KpiCardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton />
          <BarChartSkeleton />
        </>
      )}

      {/* ── Error State ─────────────────────────────────────────────────── */}
      {isError && (
        <ErrorState
          message={error?.message ?? 'An unexpected error occurred.'}
        />
      )}

      {/* ── Empty State ─────────────────────────────────────────────────── */}
      {!isLoading && !isError && !hasData && <EmptyState />}

      {/* ── Data ────────────────────────────────────────────────────────── */}
      {!isLoading && !isError && hasData && data && (
        <>
          {/* Summary Cards */}
          <SummaryCards
            totalLeads={data.summary.totalLeads}
            totalConverted={data.summary.totalConverted}
            overallConversionRate={data.summary.overallConversionRate}
            totalBilledCents={data.summary.totalBilledCents}
            totalPaidCents={data.summary.totalPaidCents}
            totalPipelineCents={data.summary.totalPipelineCents}
          />

          {/* Revenue Attribution Table */}
          <RevenueTable rows={data.rows} groupBy={groupBy} />

          {/* Source Revenue Bar Chart */}
          <SourceRevenueBar rows={data.rows} />
        </>
      )}
    </div>
  )
}
