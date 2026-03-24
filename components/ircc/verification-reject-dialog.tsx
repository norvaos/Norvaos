'use client'

/**
 * VerificationRejectDialog — Modal for lawyers to reject fields/documents
 * during the verification flow.
 *
 * Features:
 *  - Dropdown of common rejection presets (auto-fills client message)
 *  - Custom note textarea for freeform instructions
 *  - Notify client checkbox (sends email via rejected-item-nudge template)
 *  - 2-click rejection: select preset → click "Reject"
 */

import { useState, useEffect } from 'react'
import { AlertCircle, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { VERIFICATION_REJECTION_PRESETS, type VerificationRejectionSlug } from '@/lib/utils/constants'
import { useVerifyTargets, type VerifyTarget } from '@/lib/queries/field-verifications'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface VerificationRejectDialogProps {
  /** Matter ID for the verify endpoint */
  matterId: string
  /** The targets to reject */
  targets: VerifyTarget[]
  /** Human label for the item(s) being rejected (e.g. field label or slot name) */
  itemLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after successful rejection */
  onRejected?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function VerificationRejectDialog({
  matterId,
  targets,
  itemLabel,
  open,
  onOpenChange,
  onRejected,
}: VerificationRejectDialogProps) {
  const [slug, setSlug] = useState<VerificationRejectionSlug | ''>('')
  const [customNote, setCustomNote] = useState('')
  const [notifyClient, setNotifyClient] = useState(true)
  const verifyMutation = useVerifyTargets(matterId)

  // Auto-fill custom note when a preset is selected
  useEffect(() => {
    if (!slug) return
    const preset = VERIFICATION_REJECTION_PRESETS.find((p) => p.slug === slug)
    if (preset && preset.clientMessage) {
      setCustomNote(preset.clientMessage)
    }
  }, [slug])

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSlug('')
      setCustomNote('')
      setNotifyClient(true)
    }
  }, [open])

  const handleReject = async () => {
    const rejectionReason = customNote.trim() ||
      VERIFICATION_REJECTION_PRESETS.find((p) => p.slug === slug)?.clientMessage ||
      'Rejected by lawyer.'

    try {
      await verifyMutation.mutateAsync({
        action: 'reject',
        targets,
        rejection_reason: rejectionReason,
        notes: slug ? `[${slug}] ${rejectionReason}` : rejectionReason,
      })

      // Send notification email if enabled (fire-and-forget)
      if (notifyClient) {
        fetch(`/api/matters/${matterId}/verify/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targets,
            rejection_reason: rejectionReason,
            rejection_slug: slug || null,
          }),
        }).catch(() => {
          // Non-fatal: toast if email fails but don't block
          console.warn('[verification-reject] Notification email failed')
        })
      }

      toast.success('Item rejected — client will be notified.')
      onOpenChange(false)
      onRejected?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to reject item',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Reject: {itemLabel}
          </DialogTitle>
          <DialogDescription>
            Select a reason and add instructions for the client. They will see
            this feedback in their portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preset dropdown */}
          <div>
            <label className="text-sm font-medium">Rejection Reason</label>
            <Select
              value={slug}
              onValueChange={(v) => setSlug(v as VerificationRejectionSlug)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select common issue..." />
              </SelectTrigger>
              <SelectContent>
                {VERIFICATION_REJECTION_PRESETS.map((preset) => (
                  <SelectItem key={preset.slug} value={preset.slug}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom note / client message */}
          <div>
            <label className="text-sm font-medium">
              Client Instructions
            </label>
            <Textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Explain what the client needs to fix..."
              className="mt-1"
              rows={3}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              This message is shown to the client in the portal.
            </p>
          </div>

          {/* Notify checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="vr-notify-client"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="vr-notify-client" className="text-sm">
              <Send className="mr-1 inline h-3 w-3" />
              Send email notification to client
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={verifyMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleReject}
            disabled={verifyMutation.isPending || (!slug && !customNote.trim())}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="mr-1 h-4 w-4" />
            )}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
