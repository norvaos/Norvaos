'use client'

import { useState, useCallback } from 'react'
import { Eye, EyeOff, Shield, ShieldOff, Clock, Lock } from 'lucide-react'
import { usePiiMask, maskPiiValue, type PiiFieldType } from '@/lib/hooks/use-pii-mask'
import { usePiiMaskingConfig } from '@/lib/hooks/use-pii-masking-config'
import { useUser } from '@/lib/hooks/use-user'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Reveal Reasons ──────────────────────────────────────────────────────────

const PII_REVEAL_REASONS = [
  { value: 'filing_application', label: 'Filing Application' },
  { value: 'client_verification', label: 'Client Verification' },
  { value: 'document_preparation', label: 'Document Preparation' },
  { value: 'court_submission', label: 'Court/Tribunal Submission' },
  { value: 'government_correspondence', label: 'Government Correspondence' },
  { value: 'client_request', label: 'Client Request' },
  { value: 'data_correction', label: 'Data Correction' },
  { value: 'audit_review', label: 'Audit / Compliance Review' },
] as const

// ── Props ───────────────────────────────────────────────────────────────────

interface PiiFieldProps {
  /** Field display label */
  label: string
  /** The raw (unmasked) PII value */
  value: string | null | undefined
  /** Type of PII field  -  controls masking pattern */
  fieldType: PiiFieldType
  /** Field key for audit logging */
  fieldKey: string
  /** Matter ID for audit context */
  matterId?: string
  /** Callback when the user clicks the display value to edit (delegates to InlineTextField) */
  onEdit?: () => void
  /** Additional className for the display value */
  className?: string
  /** Placeholder when value is null/empty */
  placeholder?: string
  /** For date fields, a formatter function */
  formatDisplay?: (val: string) => string
}

export function PiiField({
  label,
  value,
  fieldType,
  fieldKey,
  matterId,
  onEdit,
  className,
  placeholder = 'Not set',
  formatDisplay,
}: PiiFieldProps) {
  const { appUser } = useUser()
  const pii = usePiiMask()
  const { config: maskingConfig } = usePiiMaskingConfig()
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [selectedReason, setSelectedReason] = useState<string>('')

  // Role-based masking: admin sees everything, write_only can never reveal
  const isNoMasking = maskingConfig.maskingLevel === 'none'
  const isWriteOnly = maskingConfig.maskingLevel === 'write_only'
  const canReveal = maskingConfig.canReveal && !isWriteOnly

  const handleRevealRequest = useCallback(() => {
    if (!canReveal) return
    setSelectedReason('')
    setShowReasonDialog(true)
  }, [canReveal])

  const handleConfirmReveal = useCallback(async () => {
    if (!selectedReason) return

    setShowReasonDialog(false)
    pii.reveal(selectedReason)

    // Fire-and-forget audit log to SENTINEL
    try {
      await fetch('/api/pii/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldKey,
          reason: selectedReason,
          matterId,
          entityType: 'matter_immigration',
        }),
      })
    } catch {
      // Non-blocking  -  the reveal still works even if logging fails
      console.error('[PII] Failed to log reveal event')
    }
  }, [selectedReason, pii, fieldKey, matterId])

  // If no value, show placeholder without masking UI
  if (!value) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">{label}</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className={`block text-left text-sm text-slate-400 italic hover:bg-slate-50 rounded px-2 py-1 -mx-2 transition-colors cursor-text min-h-[28px] ${className ?? ''}`}
          >
            {placeholder}
          </button>
        </div>
      </div>
    )
  }

  const maskedValue = maskPiiValue(value, fieldType)

  // Admin (no masking)  -  show raw value, no shield
  if (isNoMasking) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">{label}</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className={`block text-left text-sm text-slate-900 hover:bg-slate-50 rounded px-2 py-1 -mx-2 transition-colors cursor-text min-h-[28px] ${className ?? ''}`}
          >
            {formatDisplay ? formatDisplay(value) : value}
          </button>
        </div>
      </div>
    )
  }

  const displayValue = pii.isRevealed
    ? (formatDisplay ? formatDisplay(value) : value)
    : maskedValue

  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs text-slate-500 flex items-center gap-1">
          {isWriteOnly ? (
            <Lock className="h-3 w-3 text-red-500" />
          ) : (
            <Shield className="h-3 w-3 text-amber-500" />
          )}
          {label}
          {isWriteOnly && (
            <span className="text-[10px] text-red-500 font-medium ml-1">Write-only</span>
          )}
        </Label>
        <div className="flex items-center gap-1.5">
          {isWriteOnly ? (
            <>
              {/* Write-only: always show masked, clicking opens edit (value hidden) */}
              <span
                className={`block text-left text-sm text-slate-500 font-mono tracking-wider rounded px-2 py-1 -mx-2 min-h-[28px] ${className ?? ''}`}
              >
                {maskedValue}
              </span>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                  onClick={onEdit}
                  title="Edit field (value hidden for your role)"
                >
                  Edit
                </Button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={pii.isRevealed ? onEdit : undefined}
                className={`block text-left text-sm rounded px-2 py-1 -mx-2 transition-colors min-h-[28px] ${
                  pii.isRevealed
                    ? 'text-slate-900 hover:bg-slate-50 cursor-text'
                    : 'text-slate-500 font-mono tracking-wider cursor-default'
                } ${className ?? ''}`}
              >
                {displayValue}
              </button>

              {pii.isRevealed ? (
                <div className="flex items-center gap-1">
                  {pii.secondsRemaining !== null && (
                    <span className="text-[10px] text-amber-600 flex items-center gap-0.5 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      {pii.secondsRemaining}s
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                    onClick={pii.mask}
                    title="Re-mask field"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : canReveal ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-slate-400 hover:text-amber-600"
                  onClick={handleRevealRequest}
                  title="Reveal protected field"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <span title="Reveal not available for your role">
                  <ShieldOff className="h-3.5 w-3.5 text-slate-300" />
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Reason Selection Dialog ──────────────────────────────────────────── */}
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Access Protected Information
            </DialogTitle>
            <DialogDescription>
              This field contains personally identifiable information (PII).
              Select a reason for accessing this data. Your access will be
              logged and the field will auto-mask after 60 seconds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Reason for access</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {PII_REVEAL_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Accessed by: {appUser?.email ?? 'Unknown'}  -  This event is logged to the
              immutable SENTINEL audit trail.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReveal}
              disabled={!selectedReason}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Eye className="h-4 w-4 mr-2" />
              Reveal for 60s
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
