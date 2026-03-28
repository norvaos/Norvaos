'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Download,
  CheckCircle2,
  Send,
  RefreshCw,
  Ban,
  FileText,
  Clock,
  PenLine,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react'
import { useDocumentInstance, useInstanceAction, useUpdateSignerStatus } from '@/lib/queries/document-engine'
import { DocumentStatusBadge } from './document-status-badge'

interface DocumentInstanceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: string | null
}

export function DocumentInstanceSheet({
  open,
  onOpenChange,
  instanceId,
}: DocumentInstanceSheetProps) {
  const { data, isLoading } = useDocumentInstance(instanceId)
  const actionMutation = useInstanceAction(instanceId ?? '')
  const signerMutation = useUpdateSignerStatus(instanceId ?? '')

  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  if (!instanceId) return null

  const instance = (data as Record<string, unknown>)?.instance as Record<string, unknown> | undefined
  const artifacts = ((data as Record<string, unknown>)?.artifacts ?? []) as Record<string, unknown>[]
  const events = ((data as Record<string, unknown>)?.events ?? []) as Record<string, unknown>[]
  const signers = ((data as Record<string, unknown>)?.signers ?? []) as Record<string, unknown>[]
  const signatureRequest = (data as Record<string, unknown>)?.signatureRequest as Record<string, unknown> | null
  const supersededBy = (data as Record<string, unknown>)?.supersededBy as Record<string, unknown> | null
  const supersedes = (data as Record<string, unknown>)?.supersedes as Record<string, unknown> | null

  const status = (instance?.status as string) ?? 'draft'

  function handleAction(action: string, extra?: Record<string, unknown>) {
    actionMutation.mutate({ action, ...extra })
  }

  function handleVoid() {
    handleAction('void', { reason: voidReason })
    setVoidDialogOpen(false)
    setVoidReason('')
  }

  function handleDownload() {
    window.open(`/api/document-engine/instances/${instanceId}?download=true`, '_blank')
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {isLoading ? 'Loading...' : (instance?.title as string) ?? 'Document'}
            </SheetTitle>
            <SheetDescription>
              {instance?.document_family as string}
            </SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6 mt-6">
              {/* Status & Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <DocumentStatusBadge status={status} />
                </div>

                {supersedes && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowRightLeft className="h-3 w-3" />
                    Supersedes document #{(supersedes.id as string)?.slice(0, 8)}
                  </div>
                )}

                {supersededBy && (
                  <div className="text-xs text-amber-600 flex items-center gap-1">
                    <ArrowRightLeft className="h-3 w-3" />
                    Superseded by document #{(supersededBy.id as string)?.slice(0, 8)}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                  </Button>

                  {(status === 'draft' || status === 'pending_review') && (
                    <Button size="sm" onClick={() => handleAction('approve')} disabled={actionMutation.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  )}

                  {status === 'approved' && (
                    <Button size="sm" onClick={() => handleAction('send')} disabled={actionMutation.isPending}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Mark Sent
                    </Button>
                  )}

                  {!['signed', 'declined', 'voided', 'expired', 'superseded'].includes(status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleAction('regenerate')} disabled={actionMutation.isPending}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setVoidDialogOpen(true)}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Void
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Signature Tracking */}
              {signatureRequest && signers.length > 0 && (
                <>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <PenLine className="h-4 w-4" /> Signature Tracking
                    </h4>
                    <div className="space-y-2">
                      {signers.map((signer) => (
                        <div key={signer.id as string} className="flex items-center justify-between border rounded-md px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{signer.name as string}</p>
                            <p className="text-xs text-muted-foreground">{signer.role_key as string}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <DocumentStatusBadge status={signer.status as string} />
                            {(signer.status === 'pending' || signer.status === 'sent' || signer.status === 'viewed') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => signerMutation.mutate({
                                  signerId: signer.id as string,
                                  status: 'signed',
                                })}
                                disabled={signerMutation.isPending}
                              >
                                Mark Signed
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Create Signature Request */}
              {status === 'approved' && !signatureRequest && (
                <>
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction('create_signature_request', {
                        signers: [
                          { roleKey: 'client', name: 'Client', email: 'client@example.com' },
                          { roleKey: 'lawyer', name: 'Lawyer', email: 'lawyer@example.com' },
                        ],
                      })}
                      disabled={actionMutation.isPending}
                    >
                      <PenLine className="h-3.5 w-3.5 mr-1" /> Create Signature Request
                    </Button>
                  </div>
                  <Separator />
                </>
              )}

              {/* Artifacts */}
              {artifacts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Artifacts</h4>
                  {artifacts.map((a) => (
                    <div key={a.id as string} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">{a.file_name as string}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.artifact_type as string}</Badge>
                        {Boolean(a.is_final) && (
                          <Badge variant="outline" className="text-green-600 border-emerald-500/20 bg-emerald-950/30 text-[10px]">Final</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Event Log */}
              {events.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> Event Log
                  </h4>
                  <div className="space-y-1">
                    {events.slice(0, 10).map((e) => (
                      <div key={e.id as string} className="text-xs text-muted-foreground border-l-2 border-gray-200 pl-3 py-1">
                        <span className="font-medium text-foreground">{e.event_type as string}</span>
                        {Boolean(e.from_status) && Boolean(e.to_status) && (
                          <span>  -  {e.from_status as string} → {e.to_status as string}</span>
                        )}
                        <br />
                        <span>{new Date(e.performed_at as string).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Void Confirmation Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Document</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The document will be permanently voided.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for voiding..."
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={!voidReason.trim()}>
              Void Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
