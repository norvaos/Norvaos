'use client'

/**
 * Norva Ledger  -  Government Fee Disbursement Card
 *
 * Three states:
 *   1. PRE-AUTHORIZATION: Shows fee breakdown + readiness gate status
 *   2. RESERVED: Funds locked, shows payment reference (visible only if readiness >= 95%)
 *   3. DISBURSED: Shows completed transaction with receipt
 *
 * Norva Whispers (contextual tooltips) on every action.
 */

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Shield,
  Banknote,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  XCircle,
  Info,
} from 'lucide-react'
import {
  useGovernmentDisbursement,
  useAuthorizeDisbursement,
  useConfirmDisbursement,
  useCancelDisbursement,
} from '@/lib/queries/government-disbursement'
import type { GovernmentFee } from '@/lib/queries/government-disbursement'

interface GovernmentDisbursementCardProps {
  matterId: string
}

// ── Norva Whisper: contextual tooltip wrapper ─────────────────────────────────

function NorvaWhisper({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p>{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Fee breakdown row ─────────────────────────────────────────────────────────

function FeeRow({ fee }: { fee: GovernmentFee }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{fee.description}</span>
      <span className="font-mono font-medium">
        ${(fee.amount_cents / 100).toFixed(2)}
      </span>
    </div>
  )
}

// ── Main Card ─────────────────────────────────────────────────────────────────

export function GovernmentDisbursementCard({ matterId }: GovernmentDisbursementCardProps) {
  const { data, isLoading, error } = useGovernmentDisbursement(matterId)
  const authorizeMutation = useAuthorizeDisbursement(matterId)
  const confirmMutation = useConfirmDisbursement(matterId)
  const cancelMutation = useCancelDisbursement(matterId)

  const [showAuthorizeDialog, setShowAuthorizeDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [receiptRef, setReceiptRef] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [copied, setCopied] = useState(false)

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="border-dashed border-amber-500/30 dark:border-amber-700">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-amber-600" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  // No government fees configured  -  don't render
  if (error || !data || data.government_fee_cents === 0) {
    return null
  }

  const {
    readiness_score,
    readiness_gate_met,
    government_fee_cents,
    government_fee_dollars,
    trust_balance_cents,
    funds_sufficient,
    fee_breakdown,
    disbursement,
  } = data

  const isReserved = disbursement?.status === 'pending_approval'
  const isDisbursed = disbursement?.status === 'approved' && disbursement?.transaction_id

  // ── Copy payment reference to clipboard ───────────────────────────────────
  const copyRef = () => {
    if (disbursement?.payment_reference) {
      navigator.clipboard.writeText(disbursement.payment_reference)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Card border colour based on state ─────────────────────────────────────
  const borderClass = isDisbursed
    ? 'border-green-400 dark:border-green-700 bg-emerald-950/30/30 dark:bg-green-950/20'
    : isReserved
      ? 'border-amber-400 dark:border-amber-700 bg-amber-950/30/30 dark:bg-amber-950/20'
      : 'border-dashed border-slate-300 dark:border-slate-700'

  return (
    <>
      <Card className={borderClass}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-sm font-semibold">
                Norva Ledger  -  Government Fee Disbursement
              </CardTitle>
            </div>
            {isDisbursed && (
              <Badge variant="outline" className="border-green-500 text-emerald-400 dark:text-green-400 text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Disbursed
              </Badge>
            )}
            {isReserved && (
              <Badge variant="outline" className="border-amber-500 text-amber-400 dark:text-amber-400 text-xs">
                <Lock className="mr-1 h-3 w-3" />
                Reserved for Filing
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* ── Fee Breakdown ─────────────────────────────────────────────── */}
          <div className="space-y-1">
            {fee_breakdown.map((fee, i) => (
              <FeeRow key={i} fee={fee} />
            ))}
            <div className="flex items-center justify-between border-t pt-1 font-medium text-sm">
              <span>Total Government Fees</span>
              <span className="font-mono">${government_fee_dollars}</span>
            </div>
          </div>

          {/* ── Readiness Gate ────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 text-xs">
            <NorvaWhisper tip="Norva Intelligence requires a readiness score of 95% or higher before government fees can be disbursed. This ensures the file is complete and ready for IRCC submission.">
              <div className="flex items-center gap-1.5 cursor-help">
                {readiness_gate_met ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={readiness_gate_met ? 'text-emerald-400 dark:text-green-400' : 'text-muted-foreground'}>
                  Readiness: {readiness_score}%
                  {!readiness_gate_met && ' (95% required)'}
                </span>
                <Info className="h-3 w-3 text-muted-foreground/60" />
              </div>
            </NorvaWhisper>
          </div>

          {/* ── Trust Balance Check ───────────────────────────────────────── */}
          {!isDisbursed && (
            <div className="flex items-center gap-2 text-xs">
              <NorvaWhisper tip="The client trust account must hold enough funds to cover the full government fee amount. This prevents filing delays due to insufficient funds.">
                <div className="flex items-center gap-1.5 cursor-help">
                  {funds_sufficient ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={funds_sufficient ? 'text-emerald-400 dark:text-green-400' : 'text-red-600'}>
                    Trust Balance: ${(trust_balance_cents / 100).toFixed(2)}
                    {!funds_sufficient && ` (need $${government_fee_dollars})`}
                  </span>
                  <Info className="h-3 w-3 text-muted-foreground/60" />
                </div>
              </NorvaWhisper>
            </div>
          )}

          {/* ── Payment Reference (only when reserved + readiness met) ────── */}
          {isReserved && readiness_gate_met && disbursement?.payment_reference && (
            <div className="rounded-md border border-amber-500/30 dark:border-amber-700 bg-amber-950/30 dark:bg-amber-950/40 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 dark:text-amber-300">
                <Banknote className="h-3.5 w-3.5" />
                IRCC Payment Reference
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white dark:bg-slate-900 border px-3 py-1.5 font-mono text-sm font-bold tracking-wider">
                  {disbursement.payment_reference}
                </code>
                <NorvaWhisper tip="Copy this reference to use when paying fees on the IRCC portal. It links the payment back to this file for audit purposes.">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={copyRef}
                  >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </NorvaWhisper>
              </div>
            </div>
          )}

          {/* ── Completed State ───────────────────────────────────────────── */}
          {isDisbursed && (
            <div className="rounded-md border border-emerald-500/30 dark:border-green-700 bg-emerald-950/30 dark:bg-green-950/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 dark:text-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Disbursement Complete
              </div>
              <p className="text-xs text-emerald-400 dark:text-green-400">
                ${(disbursement.amount_cents / 100).toFixed(2)} transferred.
                Trust-to-General ledger entry recorded automatically.
                Ref: {disbursement.payment_reference}
              </p>
            </div>
          )}

          {/* ── Action Buttons ────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 pt-1">
            {/* Pre-authorization: Authorize button */}
            {!isReserved && !isDisbursed && (
              <NorvaWhisper tip="Reserves the government fee amount in the trust account. Funds are locked until you confirm IRCC payment or cancel.">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!readiness_gate_met || !funds_sufficient || authorizeMutation.isPending}
                  onClick={() => setShowAuthorizeDialog(true)}
                >
                  <Lock className="mr-1.5 h-3 w-3" />
                  {authorizeMutation.isPending ? 'Reserving...' : 'Reserve for Filing'}
                </Button>
              </NorvaWhisper>
            )}

            {/* Reserved: Confirm + Cancel buttons */}
            {isReserved && (
              <>
                <NorvaWhisper tip="Confirm that IRCC fees have been paid. This records the disbursement in the trust ledger and generates the Trust-to-General transfer entry.">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={confirmMutation.isPending}
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    <CheckCircle2 className="mr-1.5 h-3 w-3" />
                    {confirmMutation.isPending ? 'Confirming...' : 'Confirm Payment'}
                  </Button>
                </NorvaWhisper>
                <NorvaWhisper tip="Cancel this reservation and release the funds back to the available trust balance.">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={cancelMutation.isPending}
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <Unlock className="mr-1.5 h-3 w-3" />
                    Cancel
                  </Button>
                </NorvaWhisper>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Authorize Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={showAuthorizeDialog} onOpenChange={setShowAuthorizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Reserve Government Fees
            </DialogTitle>
            <DialogDescription>
              This will reserve <strong>${government_fee_dollars}</strong> from
              the client trust account for IRCC government filing fees. The
              funds will be locked until you confirm payment or cancel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {fee_breakdown.map((fee, i) => (
              <FeeRow key={i} fee={fee} />
            ))}
            <div className="border-t pt-2 flex justify-between font-medium">
              <span>Total to Reserve</span>
              <span className="font-mono">${government_fee_dollars}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuthorizeDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={authorizeMutation.isPending}
              onClick={() => {
                authorizeMutation.mutate(undefined, {
                  onSuccess: () => setShowAuthorizeDialog(false),
                })
              }}
            >
              <Lock className="mr-1.5 h-4 w-4" />
              {authorizeMutation.isPending ? 'Reserving...' : 'Reserve Funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Payment Dialog ─────────────────────────────────────────── */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Confirm IRCC Payment
            </DialogTitle>
            <DialogDescription>
              Confirm that ${(disbursement?.amount_cents ?? 0) / 100} has been
              paid to IRCC. This will record the disbursement in the Norva
              Ledger and generate the Trust-to-General transfer entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              IRCC Receipt / Confirmation Number (optional)
            </label>
            <Input
              placeholder="e.g. IRCC-2026-ABC123"
              value={receiptRef}
              onChange={(e) => setReceiptRef(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={confirmMutation.isPending}
              onClick={() => {
                confirmMutation.mutate(receiptRef || undefined, {
                  onSuccess: () => {
                    setShowConfirmDialog(false)
                    setReceiptRef('')
                  },
                })
              }}
            >
              {confirmMutation.isPending ? 'Recording...' : 'Confirm & Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Cancel Fee Reservation
            </DialogTitle>
            <DialogDescription>
              This will release the reserved funds back to the available trust
              balance. You can re-authorise later if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for cancellation</label>
            <Input
              placeholder="e.g. Client requested delay"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Reservation
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                cancelMutation.mutate(cancelReason || undefined, {
                  onSuccess: () => {
                    setShowCancelDialog(false)
                    setCancelReason('')
                  },
                })
              }}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
