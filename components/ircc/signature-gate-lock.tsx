'use client'

/**
 * SignatureGateLock  -  Directive 082 / Target 12
 *
 * Visual hard-lock component that wraps the "Generate Final Package" or
 * "Launch" button. When the signature gate is locked, the button is
 * disabled and a clear reason is displayed.
 *
 * States:
 *   - LOCKED:    Red lock icon, disabled button, reason text
 *   - PARTIAL:   Amber warning, draft allowed, final blocked
 *   - UNLOCKED:  Emerald check, button enabled
 *   - LOADING:   Skeleton state while checking
 *
 * Designed for:
 *   - IRCC Workspace toolbar
 *   - Form wizard final step
 *   - Sovereign Split Preview header
 */

import { useEffect, useState, useCallback } from 'react'
import {
  checkSignatureGate,
  formatGateMessage,
  type SignatureGateResult,
  type GateStatus,
} from '@/lib/services/signature-gate'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  FileSignature,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Types ────────────────────────────────────────────────────────────────────

interface SignatureGateLockProps {
  matterId: string
  tenantId: string
  /** Form codes to check (defaults to IMM5257, IMM5709) */
  formCodes?: string[]
  /** Callback when "Generate Final" is clicked (only fires if unlocked) */
  onGenerateFinal?: () => void
  /** Callback when "Generate Draft" is clicked (fires if partial or unlocked) */
  onGenerateDraft?: () => void
  /** Hide the draft button */
  hideDraft?: boolean
  /** Compact mode (icon only for the lock status) */
  compact?: boolean
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function SignatureGateLock({
  matterId,
  tenantId,
  formCodes,
  onGenerateFinal,
  onGenerateDraft,
  hideDraft,
  compact,
  className,
}: SignatureGateLockProps) {
  const [result, setResult] = useState<SignatureGateResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const checkGate = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const gateResult = await checkSignatureGate(supabase, {
        matterId,
        tenantId,
        formCodes,
      })
      setResult(gateResult)
    } catch (err) {
      console.error('[signature-gate-lock] Check failed:', err)
    } finally {
      setLoading(false)
    }
  }, [matterId, tenantId, formCodes])

  useEffect(() => {
    checkGate()
  }, [checkGate])

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl border border-muted p-3', className)}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Verifying signatures...</span>
      </div>
    )
  }

  if (!result) return null

  // ── Status styling ─────────────────────────────────────────────────────

  const statusConfig: Record<GateStatus, {
    border: string
    bg: string
    icon: React.ReactNode
    label: string
    textColor: string
  }> = {
    locked: {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      icon: <Lock className="size-4 text-red-500" />,
      label: 'Locked: Signatures Missing',
      textColor: 'text-red-700 dark:text-red-300',
    },
    partial: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
      icon: <ShieldAlert className="size-4 text-amber-500" />,
      label: 'Partial: Draft Available',
      textColor: 'text-amber-700 dark:text-amber-300',
    },
    unlocked: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
      icon: <ShieldCheck className="size-4 text-emerald-500" />,
      label: 'Unlocked: Ready to Launch',
      textColor: 'text-emerald-700 dark:text-emerald-300',
    },
  }

  const config = statusConfig[result.status]

  // ── Compact mode ───────────────────────────────────────────────────────

  if (compact) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1.5', className)}>
              {config.icon}
              {result.status === 'unlocked' ? (
                <Button
                  size="sm"
                  className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={onGenerateFinal}
                >
                  <Unlock className="size-3" />
                  Launch
                </Button>
              ) : (
                <Button size="sm" className="h-7" variant="outline" disabled>
                  <Lock className="size-3" />
                  Locked
                </Button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {formatGateMessage(result)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // ── Full mode ──────────────────────────────────────────────────────────

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', config.border, config.bg, className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className={cn('text-xs font-semibold', config.textColor)}>
            {config.label}
          </span>
        </div>
        {result.requirements.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {result.requirements.length} checks
          </Button>
        )}
      </div>

      {/* Message */}
      <p className="text-[11px] text-muted-foreground">
        {formatGateMessage(result)}
      </p>

      {/* Expanded requirements list */}
      {expanded && (
        <div className="space-y-1 border-t border-muted/20 pt-2">
          {result.requirements.map((req) => (
            <div
              key={`${req.role}-${req.fieldKey}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-[10px]',
                req.present
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-500/10 text-red-700 dark:text-red-300',
              )}
            >
              {req.present ? (
                <ShieldCheck className="size-3 shrink-0" />
              ) : (
                <Lock className="size-3 shrink-0" />
              )}
              <span className="flex-1 font-medium">{req.label}</span>
              <span className="opacity-60">
                {req.present ? (req.value?.slice(0, 20) ?? 'Signed') : 'Missing'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        {/* Final generation button */}
        <Button
          size="sm"
          className={cn(
            'h-8 gap-1.5',
            result.canGenerateFinal
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : '',
          )}
          disabled={!result.canGenerateFinal}
          onClick={onGenerateFinal}
        >
          {result.canGenerateFinal ? (
            <Unlock className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
          Generate Final Package
        </Button>

        {/* Draft generation button */}
        {!hideDraft && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!result.canGenerateDraft}
            onClick={onGenerateDraft}
          >
            <FileSignature className="size-3.5" />
            Draft Only
          </Button>
        )}

        {/* Refresh button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 ml-auto text-[10px]"
          onClick={checkGate}
        >
          Re-check
        </Button>
      </div>
    </div>
  )
}
