'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Lock } from 'lucide-react'
import { useTransactionLog } from '@/lib/queries/trust-transaction-log'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function eventTypeBadge(eventType: string): { label: string; cls: string } {
  switch (eventType) {
    case 'deposit_recorded':
      return { label: 'Deposit Recorded', cls: 'bg-green-50 text-green-700 border-green-200' }
    case 'disbursement_recorded':
      return { label: 'Disbursement Recorded', cls: 'bg-red-50 text-red-700 border-red-200' }
    case 'transfer_recorded':
      return { label: 'Transfer Recorded', cls: 'bg-purple-50 text-purple-700 border-purple-200' }
    case 'reversal_recorded':
      return { label: 'Reversal Recorded', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
    case 'hold_created':
      return { label: 'Hold Created', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'hold_released':
      return { label: 'Hold Released', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'hold_cancelled':
      return { label: 'Hold Cancelled', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'reconciliation_started':
      return { label: 'Reconciliation Started', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'reconciliation_completed':
      return { label: 'Reconciliation Completed', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'reconciliation_discrepancy':
      return { label: 'Reconciliation Discrepancy', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'balance_warning':
      return { label: 'Balance Warning', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
    case 'overdraft_prevented':
      return { label: 'Overdraft Prevented', cls: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: eventType.replace(/_/g, ' '), cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

function truncateId(id: string, length = 8): string {
  if (!id) return '\u2014'
  return id.length > length ? `${id.slice(0, length)}\u2026` : id
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TransactionLogViewerProps {
  matterId?: string
  trustAccountId?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function TransactionLogViewer({
  matterId,
  trustAccountId,
}: TransactionLogViewerProps) {
  const { data, isLoading } = useTransactionLog({ matterId, trustAccountId })
  const entries = (
    data as {
      entries?: Array<{
        id: string
        sequence_number: number
        performed_at: string
        event_type: string
        description: string
        amount_cents: number
        balance_before_cents: number
        balance_after_cents: number
        performed_by: string
      }>
    }
  )?.entries ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4 text-muted-foreground" />
          Transaction Log
          <span className="text-[10px] font-normal text-muted-foreground">
            Append-only audit trail  -  immutable
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No transaction log entries
          </p>
        ) : (
          <div className="space-y-1 overflow-x-auto">
            {/* Header row */}
            <div className="grid grid-cols-[60px_150px_160px_1fr_110px_180px_90px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b min-w-[900px]">
              <span>Seq #</span>
              <span>Timestamp</span>
              <span>Event Type</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Balance Before &rarr; After</span>
              <span>Performed By</span>
            </div>

            {/* Data rows */}
            {entries.map((entry) => {
              const badge = eventTypeBadge(entry.event_type)
              const isPositive = entry.amount_cents >= 0
              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-[60px_150px_160px_1fr_110px_180px_90px] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50 min-w-[900px]"
                >
                  <span className="text-xs font-mono text-muted-foreground">
                    {entry.sequence_number}
                  </span>
                  <span className="text-xs">
                    {formatTimestamp(entry.performed_at)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 w-fit ${badge.cls}`}
                  >
                    {badge.label}
                  </Badge>
                  <span className="text-xs truncate">{entry.description}</span>
                  <span
                    className={`text-xs font-medium text-right ${
                      isPositive ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {fmtCents(entry.amount_cents)}
                  </span>
                  <span className="text-xs text-right text-muted-foreground">
                    {fmtCents(entry.balance_before_cents)} &rarr;{' '}
                    {fmtCents(entry.balance_after_cents)}
                  </span>
                  <span
                    className="text-xs text-muted-foreground truncate"
                    title={entry.performed_by}
                  >
                    {truncateId(entry.performed_by)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
