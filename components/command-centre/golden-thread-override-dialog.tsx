'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Golden Thread — Compliance Override Dialog
 *  Protocol: ZIA-GOLDEN-001
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Allows Partner/Admin to bypass a locked gate with:
 *    - 50-character minimum justification
 *    - Partner PIN validation (hashed SHA-256)
 *    - RED_FLAG audit event generation
 *    - Persistent amber UI state after override
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback } from 'react'
import { useCommandCentre } from './command-centre-context'
import { useQueryClient } from '@tanstack/react-query'
import { masterProfileKeys } from '@/lib/queries/master-profile'
import type { GateState } from '@/lib/queries/master-profile'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ShieldAlert, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { toast } from 'sonner'

// ─── Props ──────────────────────────────────────────────────────────

interface GoldenThreadOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gate: GateState
  leadId: string
}

// ─── Gate descriptions for the modal ────────────────────────────────

const GATE_DESCRIPTIONS: Record<string, string> = {
  conflict_check:
    'You are bypassing the Conflict Check gate. This means the appointment panel will be unlocked without a cleared conflict scan. This action is audited and irreversible.',
  strategy_meeting:
    'You are bypassing the Strategy Meeting gate. This means the NorvaOS Capture panel will be unlocked without a completed consultation. This action is audited and irreversible.',
  id_capture:
    'You are bypassing the ID Capture gate. This means the Retainer Builder will be unlocked without verified identity. This action is audited and irreversible.',
}

const MIN_JUSTIFICATION_LENGTH = 50

// ─── Component ──────────────────────────────────────────────────────

export function GoldenThreadOverrideDialog({
  open,
  onOpenChange,
  gate,
  leadId,
}: GoldenThreadOverrideDialogProps) {
  const { tenantId, userId } = useCommandCentre()
  const queryClient = useQueryClient()

  const [justification, setJustification] = useState('')
  const [partnerPin, setPartnerPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const charCount = justification.trim().length
  const isJustificationValid = charCount >= MIN_JUSTIFICATION_LENGTH
  const isPinValid = partnerPin.trim().length >= 4
  const canSubmit = isJustificationValid && isPinValid && !isSubmitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/leads/${leadId}/golden-thread-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateKey: gate.key,
          justification: justification.trim(),
          partnerPin: partnerPin.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || 'Override failed')
        return
      }

      // Invalidate master profile to pick up the new override
      queryClient.invalidateQueries({ queryKey: masterProfileKeys.all })
      queryClient.invalidateQueries({ queryKey: ['conflicts'] })

      toast.warning(
        `Golden Thread override recorded — Gate "${gate.label}" bypassed. RED_FLAG audit logged.`,
        { duration: 8000 },
      )

      // Reset and close
      setJustification('')
      setPartnerPin('')
      onOpenChange(false)
    } catch (err) {
      setError('Network error — could not reach the server')
      console.error('[GoldenThreadOverride]', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [canSubmit, leadId, gate, justification, partnerPin, queryClient, onOpenChange])

  const handleClose = () => {
    if (!isSubmitting) {
      setJustification('')
      setPartnerPin('')
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <span>Compliance Override — {gate.label}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Override the {gate.label} gate for this lead
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Warning banner */}
        <div className="rounded-md border border-red-500/20 bg-red-950/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">
                This is a Compliance Override
              </p>
              <p className="text-xs text-red-600 mt-1">
                {GATE_DESCRIPTIONS[gate.key] ?? 'You are bypassing a Golden Thread gate.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-600 bg-red-950/40">
              RED_FLAG
            </Badge>
            <span className="text-[10px] text-red-500">
              SHA-256 hashed • Immutable audit trail • Genesis ledger amendment
            </span>
          </div>
        </div>

        {/* Justification */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center justify-between">
            <span>Justification *</span>
            <span className={`text-[10px] font-normal ${isJustificationValid ? 'text-emerald-600' : 'text-slate-400'}`}>
              {charCount}/{MIN_JUSTIFICATION_LENGTH} min
            </span>
          </Label>
          <Textarea
            placeholder="Explain the legal and procedural basis for bypassing this gate. Minimum 50 characters required for compliance audit trail..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
            className={!isJustificationValid && charCount > 0 ? 'border-red-500/30 focus-visible:ring-red-200' : ''}
          />
          {charCount > 0 && !isJustificationValid && (
            <p className="text-[10px] text-red-500">
              {MIN_JUSTIFICATION_LENGTH - charCount} more characters required
            </p>
          )}
        </div>

        {/* Partner PIN */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Partner PIN *
          </Label>
          <Input
            type="password"
            placeholder="Enter your Partner PIN"
            value={partnerPin}
            onChange={(e) => setPartnerPin(e.target.value)}
            autoComplete="off"
            className="font-mono tracking-widest"
          />
          <p className="text-[10px] text-slate-400">
            PIN will be SHA-256 hashed and stored in the compliance ledger
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-950/30 p-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Override Gate
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
