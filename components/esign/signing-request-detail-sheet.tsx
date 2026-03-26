'use client'

import { format } from 'date-fns'
import {
  FileSignature,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Bell,
  RotateCcw,
  ArrowRightLeft,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  useSigningRequestDetail,
  useResendESign,
  useCancelESign,
  useSendESignReminder,
  type SigningEvent,
} from '@/lib/queries/esign'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SigningRequestDetailSheetProps {
  requestId: string | null
  matterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Status Badge Styles ─────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  signed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
  superseded: 'bg-slate-100 text-slate-400',
}

// ─── Event Type Icons ────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: FileSignature,
  sent: Send,
  viewed: Eye,
  signed: CheckCircle2,
  declined: XCircle,
  expired: Clock,
  cancelled: X,
  reminder_sent: Bell,
  resent: RotateCcw,
  superseded: ArrowRightLeft,
}

// ─── Terminal Statuses ───────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['signed', 'declined', 'expired', 'cancelled', 'superseded'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(value: string | null): string {
  if (!value) return '--'
  try {
    return format(new Date(value), 'MMM d, yyyy h:mm a')
  } catch {
    return value
  }
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function truncateHash(hash: string | null): string {
  if (!hash) return '--'
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`
}

// ─── Timeline Item ───────────────────────────────────────────────────────────

function TimelineItem({ event }: { event: SigningEvent }) {
  const IconComponent = EVENT_ICONS[event.event_type] ?? FileSignature

  return (
    <div className="flex gap-3">
      {/* Icon */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
          <IconComponent className="h-3.5 w-3.5 text-slate-600" />
        </div>
        <div className="mt-1 w-px flex-1 bg-slate-200" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={event.event_type} />
          <span className="text-xs text-slate-400">
            {formatTimestamp(event.created_at)}
          </span>
        </div>

        <div className="mt-1 space-y-0.5">
          {/* Actor */}
          <p className="text-xs text-slate-500">
            By: <span className="font-medium text-slate-700 capitalize">{event.actor_type.replace(/_/g, ' ')}</span>
          </p>

          {/* IP address */}
          {event.ip_address && (
            <p className="text-xs text-slate-400">
              IP: {event.ip_address}
            </p>
          )}

          {/* Status transition */}
          {event.from_status && event.to_status && (
            <p className="text-xs text-slate-400">
              {event.from_status} &rarr; {event.to_status}
            </p>
          )}

          {/* Signed event extras */}
          {event.event_type === 'signed' && (
            <div className="mt-1.5 rounded-md bg-emerald-50 p-2 space-y-1">
              {event.signature_mode && (
                <p className="text-xs text-emerald-700">
                  Mode: <span className="font-medium capitalize">{event.signature_mode}</span>
                </p>
              )}
              {event.typed_name && (
                <p className="text-xs text-emerald-700">
                  Typed name: <span className="font-medium">{event.typed_name}</span>
                </p>
              )}
              {event.source_document_hash && (
                <p className="text-xs text-emerald-700 font-mono">
                  Source hash: {truncateHash(event.source_document_hash)}
                </p>
              )}
              {event.signed_document_hash && (
                <p className="text-xs text-emerald-700 font-mono">
                  Signed hash: {truncateHash(event.signed_document_hash)}
                </p>
              )}
              {event.consent_text && (
                <p className="text-xs text-emerald-600 italic mt-1">
                  &ldquo;{event.consent_text}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Declined reason via metadata */}
          {event.event_type === 'declined' && event.metadata && (
            <div className="mt-1.5 rounded-md bg-red-50 p-2">
              {typeof event.metadata === 'object' && 'reason' in event.metadata && (
                <p className="text-xs text-red-600">
                  Reason: {String(event.metadata.reason)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SigningRequestDetailSheet({
  requestId,
  matterId,
  open,
  onOpenChange,
}: SigningRequestDetailSheetProps) {
  const { data, isLoading, isError, error } = useSigningRequestDetail(requestId ?? '')

  const resendMutation = useResendESign()
  const cancelMutation = useCancelESign()
  const reminderMutation = useSendESignReminder()

  const request = data?.request ?? null
  const events = data?.events ?? []
  const status = request?.status ?? ''
  const doc = request?.signing_documents ?? null
  const isTerminal = TERMINAL_STATUSES.has(status)

  const canSendReminder = status === 'sent' || status === 'viewed'
  const canResend = status === 'sent' || status === 'viewed'
  const canCancel = status === 'pending' || status === 'sent' || status === 'viewed'

  const handleResend = () => {
    if (!requestId) return
    resendMutation.mutate({ signingRequestId: requestId, matterId })
  }

  const handleCancel = () => {
    if (!requestId) return
    cancelMutation.mutate({ signingRequestId: requestId, matterId })
  }

  const handleReminder = () => {
    if (!requestId) return
    reminderMutation.mutate({ signingRequestId: requestId, matterId })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="text-sm">Signing Request</SheetTitle>
        </SheetHeader>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center gap-2 py-20 px-4">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-red-600 text-center">
              {error instanceof Error ? error.message : 'Failed to load signing request'}
            </p>
          </div>
        )}

        {/* Content */}
        {!isLoading && !isError && request && (
          <div className="flex flex-col gap-0">
            {/* ── Document Info ────────────────────────────────────────── */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-900">
                  {doc?.title ?? 'Untitled Document'}
                </h3>
                <StatusBadge status={status} />
              </div>

              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-slate-400">Type</span>
                <span className="text-slate-700 capitalize">
                  {doc?.document_type?.replace(/_/g, ' ') ?? '--'}
                </span>

                <span className="text-slate-400">Source</span>
                <span className="text-slate-700 capitalize">
                  {doc?.source_entity_type?.replace(/_/g, ' ') ?? '--'}
                </span>

                <span className="text-slate-400">Created</span>
                <span className="text-slate-700">
                  {formatTimestamp(request.created_at)}
                </span>

                <span className="text-slate-400">Checksum</span>
                <span className="text-slate-700 font-mono text-[11px]">
                  {truncateHash(doc?.checksum_sha256 ?? null)}
                </span>
              </div>
            </div>

            <Separator />

            {/* ── Signer Info ─────────────────────────────────────────── */}
            <div className="px-4 py-3 space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Signer
              </h4>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                  {request.signer_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{request.signer_name}</p>
                  <p className="text-xs text-slate-400">{request.signer_email}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Key Timestamps ──────────────────────────────────────── */}
            <div className="px-4 py-3 space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Timestamps
              </h4>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-slate-400">Sent</span>
                <span className="text-slate-700">{formatTimestamp(request.sent_at)}</span>

                <span className="text-slate-400">Viewed</span>
                <span className="text-slate-700">{formatTimestamp(request.viewed_at)}</span>

                <span className="text-slate-400">Signed</span>
                <span className="text-slate-700">{formatTimestamp(request.signed_at)}</span>

                <span className="text-slate-400">Declined</span>
                <span className="text-slate-700">{formatTimestamp(request.declined_at)}</span>

                <span className="text-slate-400">Expires</span>
                <span className="text-slate-700">{formatTimestamp(request.expires_at)}</span>

                {request.decline_reason && (
                  <>
                    <span className="text-slate-400">Decline reason</span>
                    <span className="text-red-600">{request.decline_reason}</span>
                  </>
                )}

                {request.reminder_count > 0 && (
                  <>
                    <span className="text-slate-400">Reminders sent</span>
                    <span className="text-slate-700">{request.reminder_count}</span>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Event Timeline ──────────────────────────────────────── */}
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                Norva Vault
              </h4>

              {events.length === 0 ? (
                <p className="text-xs text-slate-400">No events recorded.</p>
              ) : (
                <div>
                  {events.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* ── Downloads & Actions ─────────────────────────────────── */}
            <div className="px-4 py-3 space-y-2">
              {/* Download links */}
              <div className="flex flex-col gap-1.5">
                <a
                  href={`/api/esign/requests/${requestId}/document`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Source PDF
                </a>

                {status === 'signed' && (
                  <a
                    href={`/api/esign/requests/${requestId}/signed`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Signed PDF
                  </a>
                )}
              </div>

              {/* Action buttons */}
              {!isTerminal && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canSendReminder && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReminder}
                        disabled={reminderMutation.isPending}
                        className="text-xs"
                      >
                        {reminderMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Bell className="mr-1.5 h-3 w-3" />
                        )}
                        Send Reminder
                      </Button>
                    )}

                    {canResend && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResend}
                        disabled={resendMutation.isPending}
                        className="text-xs"
                      >
                        {resendMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-1.5 h-3 w-3" />
                        )}
                        Resend
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancel}
                        disabled={cancelMutation.isPending}
                        className="text-xs text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <X className="mr-1.5 h-3 w-3" />
                        )}
                        Cancel
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
