'use client'

import { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  Users,
  FileText,
  ArrowUpDown,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import { useEnabledPracticeAreas } from '@/lib/queries/practice-areas'
import {
  useAgedReceivables,
  useMatterProfitability,
  useLawyerUtilization,
  useRevenueAnalytics,
} from '@/lib/queries/analytics'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { toast } from 'sonner'

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtDollars(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100)
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

// ── Period helpers ───────────────────────────────────────────────────────────

type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom'

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
]

function computePeriodDates(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed
  const today = now.toISOString().slice(0, 10)

  switch (preset) {
    case 'this_month':
      return {
        start: new Date(y, m, 1).toISOString().slice(0, 10),
        end: today,
      }
    case 'last_month':
      return {
        start: new Date(y, m - 1, 1).toISOString().slice(0, 10),
        end: new Date(y, m, 0).toISOString().slice(0, 10),
      }
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3
      return {
        start: new Date(y, qStart, 1).toISOString().slice(0, 10),
        end: today,
      }
    }
    case 'last_quarter': {
      const qStart = Math.floor(m / 3) * 3
      return {
        start: new Date(y, qStart - 3, 1).toISOString().slice(0, 10),
        end: new Date(y, qStart, 0).toISOString().slice(0, 10),
      }
    }
    case 'this_year':
      return {
        start: new Date(y, 0, 1).toISOString().slice(0, 10),
        end: today,
      }
    case 'last_year':
      return {
        start: new Date(y - 1, 0, 1).toISOString().slice(0, 10),
        end: new Date(y - 1, 11, 31).toISOString().slice(0, 10),
      }
    default:
      return { start: '', end: '' }
  }
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message = 'No data available for this period.' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {message}
    </div>
  )
}

// ── Loading skeleton row ─────────────────────────────────────────────────────

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ── Aging bucket badge ───────────────────────────────────────────────────────

function AgingBadge({ bucket }: { bucket: string }) {
  const variants: Record<string, string> = {
    current: 'bg-emerald-950/40 text-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400',
    '31-60': 'bg-yellow-950/40 text-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400',
    '61-90': 'bg-orange-950/40 text-orange-400 dark:bg-orange-900/30 dark:text-orange-400',
    '91-120': 'bg-red-950/40 text-red-400 dark:bg-red-900/30 dark:text-red-400',
    '120+': 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
  }
  return (
    <Badge className={`text-xs font-medium ${variants[bucket] ?? ''}`} variant="outline">
      {bucket === 'current' ? 'Current' : `${bucket} Days`}
    </Badge>
  )
}

// ── Margin colour helper ─────────────────────────────────────────────────────

function marginColour(pct: number): string {
  if (pct >= 30) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 10) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ── Utilization colour helper ────────────────────────────────────────────────

function utilizationColour(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function utilizationTextColour(pct: number): string {
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ── Sortable column header ───────────────────────────────────────────────────

function SortableHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string
  field: string
  currentSort: string
  currentDir: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  const isActive = currentSort === field
  return (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
        {isActive && (
          <span className="text-[10px]">{currentDir === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </TableHead>
  )
}

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  subtitle,
  className,
  loading,
}: {
  title: string
  value: string
  subtitle?: string
  className?: string
  loading?: boolean
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <>
            <div className="text-xl font-bold tabular-nums">{value}</div>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Aged Receivables Tab ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AgedReceivablesTab({ filters }: { filters: Record<string, string> }) {
  const { data, isLoading, error } = useAgedReceivables(filters)

  if (error) {
    toast.error('Failed to load aged receivables data')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receivables = (data as any)?.receivables ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (data as any)?.summary ?? null

  const bucketCards = summary
    ? [
        { title: 'Total Outstanding', value: fmtDollars(summary.total_outstanding_cents), count: summary.total_count, colour: '' },
        { title: 'Current', value: fmtDollars(summary.current_cents), count: summary.current_count, colour: 'border-l-4 border-l-emerald-500' },
        { title: '31\u201360 Days', value: fmtDollars(summary.days_31_60_cents), count: summary.days_31_60_count, colour: 'border-l-4 border-l-yellow-500' },
        { title: '61\u201390 Days', value: fmtDollars(summary.days_61_90_cents), count: summary.days_61_90_count, colour: 'border-l-4 border-l-orange-500' },
        { title: '91\u2013120 Days', value: fmtDollars(summary.days_91_120_cents), count: summary.days_91_120_count, colour: 'border-l-4 border-l-red-500' },
        { title: '120+ Days', value: fmtDollars(summary.days_120_plus_cents), count: summary.days_120_plus_count, colour: 'border-l-4 border-l-red-700' },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-3 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="mt-1 h-3 w-16" />
                </CardContent>
              </Card>
            ))
          : bucketCards.map((card) => (
              <SummaryCard
                key={card.title}
                title={card.title}
                value={card.value}
                subtitle={`${card.count} invoice${card.count !== 1 ? 's' : ''}`}
                className={card.colour}
                loading={false}
              />
            ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Matter</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Days Overdue</TableHead>
                <TableHead>Aging Bucket</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows cols={9} rows={5} />
              ) : receivables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState message="No outstanding receivables found." />
                  </TableCell>
                </TableRow>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                receivables.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.client_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{inv.matter_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(inv.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(inv.balance_due_cents)}
                    </TableCell>
                    <TableCell>{inv.due_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{inv.days_overdue}</TableCell>
                    <TableCell>
                      <AgingBadge bucket={inv.aging_bucket} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/billing/invoices/${inv.id}`}>View</a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Matter Profitability Tab ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MatterProfitabilityTab({ filters }: { filters: Record<string, string> }) {
  const { data, isLoading, error } = useMatterProfitability(filters)
  const [sortField, setSortField] = useState('margin_pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (error) {
    toast.error('Failed to load matter profitability data')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (data as any)?.summary ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawMatters = (data as any)?.matters ?? []

  const matters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...rawMatters].sort((a: any, b: any) => {
      const aVal = a[sortField] ?? 0
      const bVal = b[sortField] ?? 0
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
    return sorted
  }, [rawMatters, sortField, sortDir])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Total Revenue"
          value={summary ? fmtDollars(summary.total_revenue_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="Total Cost"
          value={summary ? fmtDollars(summary.total_cost_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="Total Margin"
          value={summary ? fmtDollars(summary.total_margin_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="Avg Margin %"
          value={summary ? fmtPct(summary.avg_margin_pct) : '0.0%'}
          loading={isLoading}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matter</TableHead>
                <TableHead>Practice Area</TableHead>
                <SortableHeader label="Revenue" field="revenue_cents" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Cost" field="cost_cents" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Margin" field="margin_cents" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Margin %" field="margin_pct" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Realisation Rate" field="realization_rate" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Collection Rate" field="collection_rate" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows cols={8} rows={5} />
              ) : matters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState message="No matter profitability data available." />
                  </TableCell>
                </TableRow>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                matters.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {m.matter_name}
                    </TableCell>
                    <TableCell>{m.practice_area_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(m.revenue_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(m.cost_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(m.margin_cents)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${marginColour(m.margin_pct)}`}>
                      {fmtPct(m.margin_pct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(m.realization_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(m.collection_rate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Lawyer Utilization Tab ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LawyerUtilizationTab({ filters }: { filters: Record<string, string> }) {
  const { data, isLoading, error } = useLawyerUtilization(filters)

  if (error) {
    toast.error('Failed to load lawyer utilisation data')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (data as any)?.summary ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lawyers = (data as any)?.lawyers ?? []

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="Firm Avg Utilisation"
          value={summary ? fmtPct(summary.avg_utilization_pct) : '0.0%'}
          loading={isLoading}
        />
        <SummaryCard
          title="Total Billable Hours"
          value={summary ? fmtHours(summary.total_billable_minutes) : '0h 0m'}
          loading={isLoading}
        />
        <SummaryCard
          title="Total Non-Billable Hours"
          value={summary ? fmtHours(summary.total_non_billable_minutes) : '0h 0m'}
          loading={isLoading}
        />
      </div>

      {/* Per-lawyer rows */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Billable Hours</TableHead>
                <TableHead className="text-right">Non-Billable Hours</TableHead>
                <TableHead className="text-right">Target Hours</TableHead>
                <TableHead className="w-[200px]">Utilisation %</TableHead>
                <TableHead className="w-[180px]">By Practice Area</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows cols={6} rows={5} />
              ) : lawyers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="No utilisation data available." />
                  </TableCell>
                </TableRow>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                lawyers.map((lawyer: any) => {
                  const utilPct = lawyer.utilization_pct ?? 0
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const practiceBreakdown: { name: string; pct: number; colour: string }[] =
                    lawyer.practice_area_breakdown ?? []

                  return (
                    <TableRow key={lawyer.id}>
                      <TableCell className="font-medium">{lawyer.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHours(lawyer.billable_minutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHours(lawyer.non_billable_minutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHours(lawyer.target_minutes)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full transition-all ${utilizationColour(utilPct)}`}
                              style={{ width: `${Math.min(utilPct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium tabular-nums ${utilizationTextColour(utilPct)}`}>
                            {fmtPct(utilPct)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {practiceBreakdown.length > 0 ? (
                          <div className="flex h-3 w-full overflow-hidden rounded-full">
                            {practiceBreakdown.map((pa, i) => (
                              <div
                                key={i}
                                className="h-full"
                                style={{
                                  width: `${pa.pct}%`,
                                  backgroundColor: pa.colour || '#6366f1',
                                }}
                                title={`${pa.name}: ${fmtPct(pa.pct)}`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">\u2014</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Revenue Tab ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RevenueTab({ filters }: { filters: Record<string, string> }) {
  const { data, isLoading, error } = useRevenueAnalytics(filters)

  if (error) {
    toast.error('Failed to load revenue analytics data')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (data as any)?.summary ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periods = (data as any)?.periods ?? []

  // Compute max collected for bar chart scaling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxVal = useMemo(() => {
    if (!periods.length) return 1
    return Math.max(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...periods.map((p: any) => Math.max(p.billed_cents ?? 0, p.collected_cents ?? 0, p.wip_cents ?? 0)),
      1
    )
  }, [periods])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Billed (Period)"
          value={summary ? fmtDollars(summary.billed_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="Collected (Period)"
          value={summary ? fmtDollars(summary.collected_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="WIP"
          value={summary ? fmtDollars(summary.wip_cents) : '$0.00'}
          loading={isLoading}
        />
        <SummaryCard
          title="YoY Change"
          value={summary ? fmtPct(summary.yoy_change_pct) : '0.0%'}
          subtitle={
            summary
              ? summary.yoy_change_pct >= 0
                ? 'Increase over prior year'
                : 'Decrease from prior year'
              : undefined
          }
          loading={isLoading}
        />
      </div>

      {/* Simple bar chart using Tailwind div bars */}
      {!isLoading && periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {periods.map((p: any, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.period_label}</span>
                    <span className="tabular-nums">{fmtDollars(p.collected_cents)}</span>
                  </div>
                  <div className="flex gap-1">
                    <div
                      className="h-4 rounded bg-blue-500 transition-all"
                      style={{ width: `${(p.billed_cents / maxVal) * 100}%` }}
                      title={`Billed: ${fmtDollars(p.billed_cents)}`}
                    />
                    <div
                      className="h-4 rounded bg-emerald-500 transition-all"
                      style={{ width: `${(p.collected_cents / maxVal) * 100}%` }}
                      title={`Collected: ${fmtDollars(p.collected_cents)}`}
                    />
                  </div>
                </div>
              ))}
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded bg-blue-500" /> Billed
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500" /> Collected
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">WIP</TableHead>
                <TableHead className="text-right">Collection Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows cols={5} rows={5} />
              ) : periods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState message="No revenue data available." />
                  </TableCell>
                </TableRow>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                periods.map((p: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.period_label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(p.billed_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(p.collected_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDollars(p.wip_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(p.collection_rate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Page ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function FinancialAnalyticsPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // ── Period state ──
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // ── Practice area filter ──
  const [practiceAreaId, setPracticeAreaId] = useState('')
  const { data: practiceAreas } = useEnabledPracticeAreas(tenantId)

  // ── Compute date range ──
  const { startDate, endDate } = useMemo(() => {
    if (periodPreset === 'custom') {
      return { startDate: customStart, endDate: customEnd }
    }
    const { start, end } = computePeriodDates(periodPreset)
    return { startDate: start, endDate: end }
  }, [periodPreset, customStart, customEnd])

  // ── Build filters object ──
  const filters: Record<string, string> = useMemo(() => {
    const f: Record<string, string> = {}
    if (startDate) f.start_date = startDate
    if (endDate) f.end_date = endDate
    if (practiceAreaId) f.practice_area_id = practiceAreaId
    return f
  }, [startDate, endDate, practiceAreaId])

  return (
    <RequirePermission entity="analytics" action="view">
      <div className="space-y-6 p-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Analyse firm financial performance across practice areas
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Period selector */}
            <Select
              value={periodPreset}
              onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}
            >
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom date pickers */}
            {periodPreset === 'custom' && (
              <>
                <TenantDateInput
                  className="h-9 w-[150px] text-sm"
                  value={customStart}
                  onChange={(iso) => setCustomStart(iso)}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <TenantDateInput
                  className="h-9 w-[150px] text-sm"
                  value={customEnd}
                  onChange={(iso) => setCustomEnd(iso)}
                />
              </>
            )}

            {/* Practice area filter */}
            <Select
              value={practiceAreaId || '__all__'}
              onValueChange={(v) => setPracticeAreaId(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="All Practice Areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Practice Areas</SelectItem>
                {practiceAreas?.map((pa) => (
                  <SelectItem key={pa.id} value={pa.id}>
                    {pa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="aged-receivables" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="aged-receivables" className="text-xs sm:text-sm">
              <FileText className="mr-1.5 h-3.5 w-3.5 hidden sm:inline-block" />
              Aged Receivables
            </TabsTrigger>
            <TabsTrigger value="matter-profitability" className="text-xs sm:text-sm">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5 hidden sm:inline-block" />
              Matter Profitability
            </TabsTrigger>
            <TabsTrigger value="lawyer-utilization" className="text-xs sm:text-sm">
              <Users className="mr-1.5 h-3.5 w-3.5 hidden sm:inline-block" />
              Lawyer Utilisation
            </TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs sm:text-sm">
              <DollarSign className="mr-1.5 h-3.5 w-3.5 hidden sm:inline-block" />
              Revenue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="aged-receivables">
            <AgedReceivablesTab filters={filters} />
          </TabsContent>

          <TabsContent value="matter-profitability">
            <MatterProfitabilityTab filters={filters} />
          </TabsContent>

          <TabsContent value="lawyer-utilization">
            <LawyerUtilizationTab filters={filters} />
          </TabsContent>

          <TabsContent value="revenue">
            <RevenueTab filters={filters} />
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  )
}
