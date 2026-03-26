'use client'

/**
 * Sovereign Seal — Directive 015 / 015.1
 *
 * Emerald Green: All compliance pillars met, no sequence violations.
 * Amber:         Genesis sealed but has compliance issues or sequence violation.
 * Red (Revoked): Genesis was revoked by a Partner — needs re-sealing.
 * Grey:          No genesis block — click to seal.
 */

import { useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, Lock, AlertTriangle, Link2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useGenesisBlock, useGenerateGenesisBlock } from '@/lib/queries/genesis'
import { cn } from '@/lib/utils'

interface SovereignSealProps {
  matterId: string
  className?: string
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Unknown'
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDecision(decision: string | null): string {
  if (!decision) return 'No decision'
  return decision.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0.00'
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`
}

export function SovereignSeal({ matterId, className }: SovereignSealProps) {
  const { data: status, isLoading } = useGenesisBlock(matterId)
  const generateMutation = useGenerateGenesisBlock()
  const [open, setOpen] = useState(false)

  if (isLoading) {
    return (
      <div className={cn('inline-flex items-center', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const exists = status?.exists ?? false
  const isCompliant = status?.isCompliant ?? false
  const hasSeqViolation = status?.hasSequenceViolation ?? false
  const isRevoked = status?.isRevoked ?? false
  const genesis = status?.genesis

  // Determine seal colour
  const sealColour = isRevoked
    ? 'text-red-600 dark:text-red-400'
    : exists && isCompliant && !hasSeqViolation
      ? 'text-emerald-600 dark:text-emerald-400'
      : exists
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'

  const iconColour = isRevoked
    ? 'text-red-500'
    : exists && isCompliant && !hasSeqViolation
      ? 'text-emerald-500'
      : exists
        ? 'text-amber-500'
        : undefined

  const SealIcon = isRevoked ? ShieldX : exists ? ShieldCheck : ShieldAlert

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            sealColour,
            className,
          )}
          title={
            isRevoked
              ? 'Genesis Revoked — Re-seal required'
              : exists && isCompliant && !hasSeqViolation
                ? 'Genesis Verified — All compliance standards met'
                : exists && hasSeqViolation
                  ? 'Compliance Warning: Sequence Violation'
                  : exists
                    ? 'Genesis Sealed — Compliance issues noted'
                    : 'No Genesis Block — Click to seal'
          }
        >
          <SealIcon className={cn('h-4 w-4', iconColour)} />
          <span className="hidden sm:inline">
            {isRevoked ? 'Revoked' : exists ? 'Sovereign Seal' : 'Seal Genesis'}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        {exists && genesis ? (
          <div className="space-y-3 p-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <SealIcon className={cn('h-5 w-5', iconColour)} />
              <div>
                <p className="text-sm font-semibold">
                  {isRevoked
                    ? 'Genesis Revoked'
                    : isCompliant && !hasSeqViolation
                      ? 'Genesis Verified'
                      : 'Genesis Sealed'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isRevoked
                    ? 'Revoked by Partner — re-seal available'
                    : isCompliant && !hasSeqViolation
                      ? 'This file met all Law Society Compliance standards'
                      : hasSeqViolation
                        ? 'Compliance Warning: Sequence Violation detected'
                        : 'Compliance issues noted — review required'}
                </p>
              </div>
            </div>

            {/* Sequence Violation Warning */}
            {hasSeqViolation && !isRevoked && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Conflict check was performed <strong>after</strong> the retainer was signed.
                  Law Society rules require conflicts cleared before engagement.
                </p>
              </div>
            )}

            {/* Revocation Info */}
            {isRevoked && genesis.revoked_at && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
                <ShieldX className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 dark:text-red-300">
                  <p>Revoked on {formatTimestamp(genesis.revoked_at)}</p>
                  {genesis.revocation_reason && (
                    <p className="mt-0.5 opacity-80">{genesis.revocation_reason}</p>
                  )}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Sealed on</p>
              <p className="text-sm font-medium">{formatTimestamp(genesis.generated_at)}</p>
            </div>

            <Separator />

            {/* Three Pillars */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Compliance Pillars
              </p>

              {/* Conflict Check */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Conflict Check</span>
                <Badge
                  variant={
                    genesis.conflict_decision === 'no_conflict' ||
                    genesis.conflict_decision === 'proceed_with_caution' ||
                    genesis.conflict_decision === 'waiver_obtained'
                      ? 'default'
                      : 'destructive'
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {formatDecision(genesis.conflict_decision)}
                </Badge>
              </div>

              {/* KYC Verification */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">KYC Verification</span>
                <Badge
                  variant={genesis.kyc_status === 'verified' ? 'default' : 'destructive'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {genesis.kyc_status === 'verified'
                    ? `Verified (${genesis.kyc_document_type ?? 'ID'})`
                    : genesis.kyc_status ?? 'Not Verified'}
                </Badge>
              </div>

              {/* Retainer Agreement */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Retainer Agreement</span>
                <Badge
                  variant={genesis.retainer_status === 'signed' ? 'default' : 'destructive'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {genesis.retainer_status === 'signed'
                    ? `Signed (${formatCents(genesis.retainer_total_cents)})`
                    : genesis.retainer_status ?? 'None'}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Trust Ledger Anchor (015.1) */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Trust Ledger Anchor
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Initial Trust Balance</span>
                <span className="font-mono text-[11px]">
                  {formatCents(genesis.initial_trust_balance)}
                </span>
              </div>
              {genesis.last_trust_audit_hash && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={genesis.last_trust_audit_hash}>
                    Chain: {genesis.last_trust_audit_hash.slice(0, 12)}...{genesis.last_trust_audit_hash.slice(-6)}
                  </span>
                </div>
              )}
            </div>

            {/* Compliance Notes */}
            {genesis.compliance_notes && genesis.compliance_notes !== 'All compliance pillars met' && (
              <>
                <Separator />
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-medium">Notes:</p>
                  <p>{genesis.compliance_notes}</p>
                </div>
              </>
            )}

            {/* Hash */}
            <Separator />
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
              <Lock className="h-3 w-3 shrink-0" />
              <span className="truncate" title={genesis.genesis_hash}>
                SHA-256: {genesis.genesis_hash.slice(0, 16)}...{genesis.genesis_hash.slice(-8)}
              </span>
            </div>

            {/* Re-seal button if revoked */}
            {isRevoked && (
              <>
                <Separator />
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(matterId)}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Re-sealing...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-3 w-3" />
                      Re-seal Genesis Block
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">No Genesis Block</p>
                <p className="text-xs text-muted-foreground">
                  Seal the Sovereign Birth Certificate to lock compliance status
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The Genesis Protocol captures a permanent snapshot of the conflict check,
              KYC verification, retainer agreement, and initial trust balance at the
              moment of matter opening. This record is immutable and chain-linked to
              the firm&apos;s global trust audit ledger.
            </p>

            <Button
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate(matterId)}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Sealing...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-3 w-3" />
                  Seal Genesis Block
                </>
              )}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
