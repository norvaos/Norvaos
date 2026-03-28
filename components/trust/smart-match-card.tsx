'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sparkles,
  ArrowRight,
  Check,
  AlertTriangle,
  Loader2,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useTransactionMatches,
  useApplyTrustMatch,
  type TransactionMatch,
} from '@/lib/queries/trust-matching'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function matchTypeBadge(type: TransactionMatch['match_type']) {
  switch (type) {
    case 'exact':
      return { label: 'Exact Match', cls: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' }
    case 'partial':
      return { label: 'Partial', cls: 'bg-amber-950/40 text-amber-400 border-amber-500/20' }
    case 'overpayment':
      return { label: 'Overpayment', cls: 'bg-blue-950/40 text-blue-400 border-blue-500/20' }
  }
}

// ─── Single Match Card ──────────────────────────────────────────────────────

function MatchSuggestion({
  match,
  onApply,
  isApplying,
}: {
  match: TransactionMatch
  onApply: (match: TransactionMatch) => void
  isApplying: boolean
}) {
  const badge = matchTypeBadge(match.match_type)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-950/30/50 dark:border-green-700 dark:bg-green-950/20 p-3 transition-colors hover:bg-emerald-950/30 dark:hover:bg-green-950/30">
      {/* Left  -  Deposit info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('text-[10px] font-medium', badge.cls)}>
            {badge.label}
          </Badge>
          {match.reference && (
            <span className="text-[10px] text-muted-foreground font-mono">
              Ref: {match.reference}
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-foreground">
          Deposit of{' '}
          <span className="tabular-nums text-emerald-400 dark:text-green-400">
            {fmtCents(match.deposit_cents)}
          </span>
        </p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span>
            Apply{' '}
            <span className="font-medium tabular-nums text-foreground">
              {fmtCents(match.apply_cents)}
            </span>{' '}
            to Invoice{' '}
            <span className="font-medium text-foreground">
              {match.invoice_number ?? ' - '}
            </span>
          </span>
        </div>

        {match.match_type === 'partial' && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Covers {Math.round((match.apply_cents / match.remaining_cents) * 100)}% of{' '}
            {fmtCents(match.remaining_cents)} remaining
          </p>
        )}

        {match.description && (
          <p className="text-[10px] text-muted-foreground truncate">
            {match.description}
          </p>
        )}
      </div>

      {/* Right  -  Apply button */}
      <Button
        size="sm"
        variant="default"
        className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
        onClick={() => onApply(match)}
        disabled={isApplying}
      >
        {isApplying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5 mr-1" />
        )}
        Apply
      </Button>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface SmartMatchCardProps {
  matterId: string
}

export function SmartMatchCard({ matterId }: SmartMatchCardProps) {
  const { data: suggestions, isLoading, error } = useTransactionMatches(matterId)
  const applyMutation = useApplyTrustMatch(matterId)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [confirmMatch, setConfirmMatch] = useState<TransactionMatch | null>(null)

  // Don't render anything if loading or no suggestions
  if (isLoading) {
    return (
      <Card className="border-dashed border-emerald-500/30 dark:border-green-700">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-600" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || !suggestions || suggestions.length === 0) {
    return null // Silent  -  no suggestions, no card
  }

  const exactMatches = suggestions.filter((s) => s.match_type === 'exact')
  const partialMatches = suggestions.filter((s) => s.match_type === 'partial')
  const overpayments = suggestions.filter((s) => s.match_type === 'overpayment')

  function handleApplyClick(match: TransactionMatch) {
    setConfirmMatch(match)
  }

  async function handleConfirmApply() {
    if (!confirmMatch) return
    setApplyingId(confirmMatch.transaction_id)
    try {
      await applyMutation.mutateAsync({
        invoiceId: confirmMatch.invoice_id,
        transactionId: confirmMatch.transaction_id,
        amountCents: confirmMatch.apply_cents,
        notes: `Smart-Match: ${confirmMatch.match_type} match applied`,
      })
    } finally {
      setApplyingId(null)
      setConfirmMatch(null)
    }
  }

  return (
    <>
      <Card className="border-dashed border-emerald-500/30 bg-emerald-950/30/30 dark:border-green-700 dark:bg-green-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
            Smart-Match Suggestions
            <Badge variant="secondary" className="text-[10px] ml-auto">
              {suggestions.length} found
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            We found deposits that match open invoices. Review and apply with one click.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Exact matches first */}
          {exactMatches.map((m) => (
            <MatchSuggestion
              key={`${m.transaction_id}-${m.invoice_id}`}
              match={m}
              onApply={handleApplyClick}
              isApplying={applyingId === m.transaction_id}
            />
          ))}

          {/* Then partials */}
          {partialMatches.map((m) => (
            <MatchSuggestion
              key={`${m.transaction_id}-${m.invoice_id}`}
              match={m}
              onApply={handleApplyClick}
              isApplying={applyingId === m.transaction_id}
            />
          ))}

          {/* Then overpayments */}
          {overpayments.map((m) => (
            <MatchSuggestion
              key={`${m.transaction_id}-${m.invoice_id}`}
              match={m}
              onApply={handleApplyClick}
              isApplying={applyingId === m.transaction_id}
            />
          ))}
        </CardContent>
      </Card>

      {/* Confirmation Dialog  -  human-in-the-loop */}
      <Dialog open={!!confirmMatch} onOpenChange={() => setConfirmMatch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Confirm Allocation
            </DialogTitle>
            <DialogDescription>
              This will apply trust funds to the invoice. The action creates an
              immutable audit trail.
            </DialogDescription>
          </DialogHeader>

          {confirmMatch && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deposit</span>
                <span className="font-medium tabular-nums">
                  {fmtCents(confirmMatch.deposit_cents)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-medium">
                  {confirmMatch.invoice_number ?? ' - '}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount to Apply</span>
                <span className="font-bold tabular-nums text-emerald-400 dark:text-green-400">
                  {fmtCents(confirmMatch.apply_cents)}
                </span>
              </div>
              {confirmMatch.remaining_cents !== confirmMatch.apply_cents && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining After</span>
                  <span className="tabular-nums text-amber-600">
                    {fmtCents(confirmMatch.remaining_cents - confirmMatch.apply_cents)}
                  </span>
                </div>
              )}
              {confirmMatch.reference && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono">{confirmMatch.reference}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmMatch(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirmApply}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Confirm &amp; Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
