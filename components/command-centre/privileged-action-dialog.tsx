'use client'

import { useState, useCallback } from 'react'
import { useCommandCentre } from './command-centre-context'
import { createClient } from '@/lib/supabase/client'
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
import { Textarea } from '@/components/ui/textarea'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Json } from '@/lib/types/database'

// ─── Component ──────────────────────────────────────────────────────

interface PrivilegedActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Display title for the action */
  actionTitle: string
  /** Description of what this action does */
  actionDescription: string
  /** Audit log action name (e.g. 'lead_converted', 'price_override') */
  auditAction: string
  /** Entity info for audit log */
  entityType: string
  entityId: string
  /** Called when the user confirms with a reason */
  onConfirm: (reason: string) => Promise<void> | void
  /** Whether the user has permission */
  hasPermission: boolean
}

export function PrivilegedActionDialog({
  open,
  onOpenChange,
  actionTitle,
  actionDescription,
  auditAction,
  entityType,
  entityId,
  onConfirm,
  hasPermission,
}: PrivilegedActionDialogProps) {
  const { tenantId, userId } = useCommandCentre()

  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = useCallback(async () => {
    if (!reason.trim()) {
      toast.error('A reason is required for this action')
      return
    }
    setIsSubmitting(true)
    try {
      // Log audit entry
      const supabase = createClient()
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        action: auditAction,
        changes: { reason: reason.trim() } as unknown as Json,
        metadata: { privileged: true, timestamp: new Date().toISOString() } as unknown as Json,
      })

      // Execute the privileged action
      await onConfirm(reason.trim())

      onOpenChange(false)
      setReason('')
    } catch (err) {
      toast.error('Action failed')
      console.error('[PrivilegedAction]', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [reason, tenantId, userId, entityType, entityId, auditAction, onConfirm, onOpenChange])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {actionTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {actionDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!hasPermission ? (
          <div className="rounded-md border border-red-500/20 bg-red-950/30 p-3">
            <p className="text-sm text-red-400 font-medium">
              You do not have permission to perform this action.
            </p>
            <p className="text-xs text-red-600 mt-1">
              Contact your administrator if you believe this is an error.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/20 bg-amber-950/30 p-3">
              <p className="text-xs text-amber-400">
                This action requires authorization and will be logged in the audit trail.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Reason *</Label>
              <Textarea
                placeholder="Explain why this action is being taken..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              setReason('')
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          {hasPermission && (
            <Button
              onClick={handleConfirm}
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
