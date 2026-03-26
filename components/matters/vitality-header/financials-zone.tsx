'use client'

import { type FinancialsZoneProps } from './types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100)
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function FinancialsZoneSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading financials">
      {/* Health badge skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      {/* Trust balance hero skeleton */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-3.5 w-20" />
      </div>

      {/* Fee snapshot grid skeleton */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-22" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>

      {/* Aging bar skeleton */}
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-14" />
      </div>

      {/* Billing type badge skeleton */}
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function FinancialsZoneEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
      <DollarSign className="h-8 w-8 opacity-40" />
      <p className="text-sm font-medium">No financial data</p>
      <p className="text-xs opacity-60">
        Financial information will appear once billing is configured.
      </p>
    </div>
  )
}

// ─── Health Badge ───────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: 'healthy' | 'warning' | 'critical' }) {
  const config = {
    healthy: {
      dot: 'bg-green-500',
      text: 'Healthy',
      badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    },
    warning: {
      dot: 'bg-amber-500',
      text: 'Warning',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    },
    critical: {
      dot: 'bg-red-500',
      text: 'Critical',
      badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    },
  }[health]

  return (
    <Badge
      variant="secondary"
      className={cn('text-[11px] font-medium px-2 py-0.5 gap-1.5', config.badge)}
    >
      <span
        className={cn('inline-block h-2 w-2 rounded-full shrink-0', config.dot)}
        aria-hidden="true"
      />
      {config.text}
    </Badge>
  )
}

// ─── Aging Bar ──────────────────────────────────────────────────────────────

function AgingBar({
  currentCents,
  thirtyDayCents,
  sixtyPlusCents,
}: {
  currentCents: number
  thirtyDayCents: number
  sixtyPlusCents: number
}) {
  const total = currentCents + thirtyDayCents + sixtyPlusCents

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No aging data</p>
    )
  }

  const segments = [
    {
      key: 'current',
      label: 'Current',
      cents: currentCents,
      colour: 'bg-green-500 dark:bg-green-400',
    },
    {
      key: '30d',
      label: '30 Days',
      cents: thirtyDayCents,
      colour: 'bg-amber-500 dark:bg-amber-400',
    },
    {
      key: '60+',
      label: '60+ Days',
      cents: sixtyPlusCents,
      colour: 'bg-red-500 dark:bg-red-400',
    },
  ]

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-1.5">
        {/* Stacked bar */}
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40"
          role="img"
          aria-label={`Aging: ${formatCurrency(currentCents)} current, ${formatCurrency(thirtyDayCents)} at 30 days, ${formatCurrency(sixtyPlusCents)} at 60+ days`}
        >
          {segments.map((seg) => {
            if (seg.cents === 0) return null
            const pct = (seg.cents / total) * 100
            return (
              <Tooltip key={seg.key}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      seg.colour
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <span className="font-medium">{seg.label}:</span>{' '}
                  <span className="tabular-nums">{formatCurrency(seg.cents)}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Labels below */}
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {segments.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1">
              <span
                className={cn('inline-block h-1.5 w-1.5 rounded-full', seg.colour)}
                aria-hidden="true"
              />
              {seg.label}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FinancialsZone({ data, isLoading, onDrillDown }: FinancialsZoneProps) {
  if (isLoading) return <FinancialsZoneSkeleton />
  if (!data) return <FinancialsZoneEmpty />

  const {
    billingType,
    trustBalanceCents,
    totalBilledCents,
    outstandingCents,
    aging,
    financialHealth,
    feeSnapshot,
    recentTransactions,
  } = data

  const trustPositive = trustBalanceCents > 0
  const trustZero = trustBalanceCents === 0
  const trustNegative = trustBalanceCents < 0

  return (
    <div
      role="region"
      aria-label="Financials overview"
      className="space-y-3 transition-all duration-300"
      onClick={onDrillDown}
      onKeyDown={(e) => {
        if (onDrillDown && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onDrillDown()
        }
      }}
      tabIndex={onDrillDown ? 0 : undefined}
      style={{ cursor: onDrillDown ? 'pointer' : undefined }}
    >
      {/* ── 1. Financial Health Indicator ──────────────────────────────────── */}
      <div className="flex justify-end">
        <HealthBadge health={financialHealth} />
      </div>

      {/* ── 2. Trust Balance Hero ─────────────────────────────────────────── */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {trustNegative && (
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
                )}
                {trustZero && (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
                )}
                <span
                  className={cn(
                    'text-xl font-bold tabular-nums tracking-tight',
                    trustPositive && 'text-green-600 dark:text-green-400',
                    trustZero && 'text-amber-600 dark:text-amber-400',
                    trustNegative && 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatCurrency(trustBalanceCents)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Trust Balance
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] p-3 space-y-1.5">
            <p className="text-xs font-semibold">Trust Breakdown</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right tabular-nums">
                {formatCurrency(feeSnapshot.subtotalCents)}
              </span>
              <span className="text-muted-foreground">Tax</span>
              <span className="text-right tabular-nums">
                {formatCurrency(feeSnapshot.taxCents)}
              </span>
              <span className="text-muted-foreground">Total Fees</span>
              <span className="text-right tabular-nums">
                {formatCurrency(feeSnapshot.totalCents)}
              </span>
              <span className="text-muted-foreground font-medium pt-1 border-t">
                Trust Held
              </span>
              <span className="text-right tabular-nums font-medium pt-1 border-t">
                {formatCurrency(trustBalanceCents)}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* ── 3. Fee Snapshot Grid ──────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total Billed</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(totalBilledCents)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trust Held</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              'text-green-600 dark:text-green-400'
            )}
          >
            {formatCurrency(trustBalanceCents)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Outstanding</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              outstandingCents > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            )}
          >
            {formatCurrency(outstandingCents)}
          </span>
        </div>
      </div>

      {/* ── 4. Last 5 Transactions (mini-ledger) ──────────────────────────── */}
      {recentTransactions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Recent Transactions
          </p>
          <div className="space-y-1">
            {recentTransactions.map((tx) => {
              const isCredit = tx.amountCents > 0
              const dateStr = new Date(tx.createdAt).toLocaleDateString('en-CA', {
                month: 'short',
                day: 'numeric',
              })
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-[11px] gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {isCredit ? (
                      <ArrowDownLeft className="h-3 w-3 shrink-0 text-green-500" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 shrink-0 text-red-500" />
                    )}
                    <span className="text-muted-foreground truncate">
                      {tx.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'tabular-nums font-medium',
                        isCredit
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {isCredit ? '+' : ''}{formatCurrency(tx.amountCents)}
                    </span>
                    <span className="text-muted-foreground/60 tabular-nums">
                      {dateStr}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 5. Aging Buckets Visualisation ────────────────────────────────── */}
      <AgingBar
        currentCents={aging.currentCents}
        thirtyDayCents={aging.thirtyDayCents}
        sixtyPlusCents={aging.sixtyPlusCents}
      />

      {/* ── 6. Billing Type Badge ─────────────────────────────────────────── */}
      {billingType && (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 gap-1">
            <CreditCard className="h-3 w-3 shrink-0" />
            {billingType}
          </Badge>
        </div>
      )}
    </div>
  )
}
