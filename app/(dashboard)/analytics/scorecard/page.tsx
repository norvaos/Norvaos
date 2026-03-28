'use client'

import { useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  Briefcase,
  Percent,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import { useKpiScorecard, type KpiScorecardFilters } from '@/lib/queries/analytics'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDollars(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function getPeriodLabel(): string {
  const now = new Date()
  return now.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

// ─── Aging bar colours ──────────────────────────────────────────────────────

const AGING_COLOURS: Record<string, string> = {
  Current: 'bg-emerald-500',
  '31-60': 'bg-yellow-400',
  '61-90': 'bg-orange-400',
  '91-120': 'bg-orange-600',
  '120+': 'bg-red-500',
}

// ─── Period options ─────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'ytd', label: 'YTD' },
] as const

// ─── Card skeleton ──────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  )
}

// ─── Revenue Card ───────────────────────────────────────────────────────────

function RevenueCard({
  current_cents,
  prior_cents,
  change_pct,
}: {
  current_cents: number
  prior_cents: number
  change_pct: number
}) {
  const isPositive = change_pct >= 0
  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Revenue</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold">{fmtDollars(current_cents)}</div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Prior period:</span>
          <span>{fmtDollars(prior_cents)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
          <span
            className={`text-sm font-medium ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isPositive ? '+' : ''}
            {fmtPct(change_pct)}
          </span>
          <span className="text-xs text-muted-foreground">vs prior period</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Receivables Card ───────────────────────────────────────────────────────

function ReceivablesCard({
  total_outstanding_cents,
  buckets,
}: {
  total_outstanding_cents: number
  buckets: { bucket: string; total_cents: number; count: number }[]
}) {
  const total = buckets.reduce((sum, b) => sum + b.total_cents, 0) || 1

  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Outstanding Receivables</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">{fmtDollars(total_outstanding_cents)}</div>

        {/* Stacked aging bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {buckets.map((b) => {
            const widthPct = (b.total_cents / total) * 100
            if (widthPct < 0.5) return null
            return (
              <div
                key={b.bucket}
                className={`${AGING_COLOURS[b.bucket] ?? 'bg-gray-400'}`}
                style={{ width: `${widthPct}%` }}
                title={`${b.bucket}: ${fmtDollars(b.total_cents)} (${b.count} invoices)`}
              />
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {buckets.map((b) => (
            <span key={b.bucket} className="flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  AGING_COLOURS[b.bucket] ?? 'bg-gray-400'
                }`}
              />
              {b.bucket}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Utilisation Card ───────────────────────────────────────────────────────

function UtilisationCard({
  firm_avg_pct,
  total_billable_minutes,
  total_target_minutes,
}: {
  firm_avg_pct: number
  total_billable_minutes: number
  total_target_minutes: number
}) {
  const colour =
    firm_avg_pct >= 80
      ? 'text-green-600'
      : firm_avg_pct >= 60
        ? 'text-yellow-600'
        : 'text-red-600'

  const gradientColour =
    firm_avg_pct >= 80
      ? '#16a34a'
      : firm_avg_pct >= 60
        ? '#ca8a04'
        : '#dc2626'

  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Utilisation</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Circular progress indicator */}
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${gradientColour} ${firm_avg_pct * 3.6}deg, #e5e7eb ${firm_avg_pct * 3.6}deg)`,
            }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background">
              <span className={`text-lg font-bold ${colour}`}>
                {fmtPct(firm_avg_pct)}
              </span>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Billable: </span>
              <span className="font-medium">{minutesToHours(total_billable_minutes)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Target: </span>
              <span className="font-medium">{minutesToHours(total_target_minutes)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Trust Compliance Card ──────────────────────────────────────────────────

function TrustComplianceCard({
  accounts_needing_reconciliation,
  active_holds,
  pending_disbursements,
}: {
  accounts_needing_reconciliation: number
  active_holds: number
  pending_disbursements: number
}) {
  const allClean =
    accounts_needing_reconciliation === 0 &&
    active_holds === 0 &&
    pending_disbursements === 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Trust Compliance</CardTitle>
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {allClean ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">All accounts compliant</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Needing reconciliation</span>
              <Badge
                variant={accounts_needing_reconciliation > 0 ? 'default' : 'secondary'}
                className={
                  accounts_needing_reconciliation > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : ''
                }
              >
                {accounts_needing_reconciliation}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active holds</span>
              <Badge variant="secondary">{active_holds}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending disbursements</span>
              <Badge
                variant={pending_disbursements > 0 ? 'default' : 'secondary'}
                className={
                  pending_disbursements > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : ''
                }
              >
                {pending_disbursements}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Pipeline Card ──────────────────────────────────────────────────────────

function PipelineCard({
  new_matters,
  closed_matters,
  avg_days_to_close,
}: {
  new_matters: number
  closed_matters: number
  avg_days_to_close: number
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Matter Pipeline</CardTitle>
        <Briefcase className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{new_matters}</div>
            <div className="text-xs text-muted-foreground">New</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{closed_matters}</div>
            <div className="text-xs text-muted-foreground">Closed</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{avg_days_to_close}</div>
            <div className="text-xs text-muted-foreground">Avg days</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Collection Rate Card ───────────────────────────────────────────────────

function CollectionRateCard({
  collection_rate_pct,
  wip_cents,
}: {
  collection_rate_pct: number
  wip_cents: number
}) {
  const colour =
    collection_rate_pct >= 90
      ? 'text-green-600'
      : collection_rate_pct >= 70
        ? 'text-yellow-600'
        : 'text-red-600'

  return (
    <Card>
      <CardHeader className="flex flex-row items-centre justify-between pb-2">
        <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
        <Percent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className={`text-3xl font-bold ${colour}`}>
          {fmtPct(collection_rate_pct)}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Work in progress: </span>
          <span className="font-medium">{fmtDollars(wip_cents)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Error State ────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          Failed to load scorecard data
        </p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
        <DollarSign className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No scorecard data available for this period.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function KpiScorecardPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [period, setPeriod] = useState<string>('month')

  const filters: KpiScorecardFilters = useMemo(
    () => ({}),
    [],
  )

  const { data: response, isLoading, isError, error } = useKpiScorecard(filters)
  const data = response?.data

  return (
    <RequirePermission entity="analytics" action="view">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Firm KPI Scorecard</h1>
            <p className="text-sm text-muted-foreground">{getPeriodLabel()}</p>
          </div>
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v)}
          >
            <SelectTrigger className="w-[160px]">
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
        </div>

        {/* Card Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </>
          ) : isError ? (
            <ErrorState message={error?.message ?? 'An unexpected error occurred.'} />
          ) : !data ? (
            <EmptyState />
          ) : (
            <>
              <RevenueCard
                current_cents={data.revenue.current_cents}
                prior_cents={data.revenue.prior_cents}
                change_pct={data.revenue.change_pct}
              />
              <ReceivablesCard
                total_outstanding_cents={data.receivables.total_outstanding_cents}
                buckets={data.receivables.buckets}
              />
              <UtilisationCard
                firm_avg_pct={data.utilization.firm_avg_pct}
                total_billable_minutes={data.utilization.total_billable_minutes}
                total_target_minutes={data.utilization.total_target_minutes}
              />
              <TrustComplianceCard
                accounts_needing_reconciliation={data.trust.accounts_needing_reconciliation}
                active_holds={data.trust.active_holds}
                pending_disbursements={data.trust.pending_disbursements}
              />
              <PipelineCard
                new_matters={data.pipeline.new_matters}
                closed_matters={data.pipeline.closed_matters}
                avg_days_to_close={data.pipeline.avg_days_to_close}
              />
              <CollectionRateCard
                collection_rate_pct={data.collection_rate_pct}
                wip_cents={data.wip_cents}
              />
            </>
          )}
        </div>
      </div>
    </RequirePermission>
  )
}
