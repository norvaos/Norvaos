'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Shield,
  Loader2,
  FileSignature,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useLogComplianceBypass } from '@/lib/queries/command-centre'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ComplianceGateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  tenantId: string
  userId: string
  userRole: string
  /** Called when the user chooses to generate & send a retainer now */
  onGenerateRetainer: () => void
  /** Called when bypass is confirmed — proceeds with conversion */
  onBypassConfirmed: () => void
  isGeneratingRetainer?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ComplianceGateModal({
  open,
  onOpenChange,
  leadId,
  tenantId,
  userId,
  userRole,
  onGenerateRetainer,
  onBypassConfirmed,
  isGeneratingRetainer = false,
}: ComplianceGateModalProps) {
  const [bypassReason, setBypassReason] = useState('')
  const [showBypassForm, setShowBypassForm] = useState(false)

  const logBypass = useLogComplianceBypass()

  const isOwner = userRole === 'owner' || userRole === 'admin'
  const canBypass = isOwner && bypassReason.trim().length >= 10

  async function handleBypass() {
    if (!canBypass) return

    // Log the bypass for audit
    await logBypass.mutateAsync({
      tenantId,
      leadId,
      userId,
      gateName: 'retainer_signed',
      bypassReason: bypassReason.trim(),
      userRole,
    })

    setBypassReason('')
    setShowBypassForm(false)
    onBypassConfirmed()
  }

  function handleClose() {
    setBypassReason('')
    setShowBypassForm(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
            Compliance Alert
          </DialogTitle>
          <DialogDescription>
            No signed Retainer/Scope of Engagement was found on file for this lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning Banner */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  A signed retainer agreement is required before converting this lead to a matter.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  This is a compliance requirement to ensure proper legal engagement documentation
                  is in place before any legal work begins.
                </p>
              </div>
            </div>
          </div>

          {/* Option 1: Generate & Send Retainer */}
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <FileSignature className="h-4 w-4 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Generate &amp; Send Retainer Now</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a retainer agreement and send it to the client for signature.
                  This is the recommended path.
                </p>
                <Button
                  className="mt-3 bg-blue-600 hover:bg-blue-700"
                  size="sm"
                  onClick={onGenerateRetainer}
                  disabled={isGeneratingRetainer}
                >
                  {isGeneratingRetainer ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileSignature className="mr-2 h-4 w-4" />
                      Generate Retainer
                    </>
                  )}
                </Button>
              </div>
              <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                Recommended
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Option 2: Bypass (Emergency) */}
          <div className="rounded-lg border border-dashed border-red-200 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <Shield className="h-4 w-4 text-red-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">
                  Bypass — Emergency Case
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isOwner
                    ? 'Override the retainer gate. A written reason is required and will be recorded in the audit log.'
                    : 'Only users with the Owner role can bypass this compliance gate.'}
                </p>

                {isOwner && !showBypassForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => setShowBypassForm(true)}
                  >
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    I understand the risk — Bypass
                  </Button>
                )}

                {!isOwner && (
                  <Badge variant="outline" className="mt-2 text-[10px] text-slate-500 border-slate-300">
                    Requires Owner role
                  </Badge>
                )}

                {showBypassForm && (
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs text-red-700">
                      Bypass Reason <span className="text-red-500">*</span>
                      <span className="text-muted-foreground font-normal ml-1">(min. 10 characters)</span>
                    </Label>
                    <Textarea
                      value={bypassReason}
                      onChange={(e) => setBypassReason(e.target.value)}
                      placeholder="e.g. Emergency protective order — client in immediate danger, retainer to follow within 24 hours."
                      className="text-sm resize-none border-red-200 focus-visible:ring-red-400"
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">
                        This will be recorded in the audit log.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowBypassForm(false)
                            setBypassReason('')
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleBypass}
                          disabled={!canBypass || logBypass.isPending}
                        >
                          {logBypass.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Confirm Bypass
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
