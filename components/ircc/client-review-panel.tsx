'use client'

/**
 * ClientReviewPanel — Manages the IRCC client review flow.
 *
 * Flow:
 *  1. Staff initiates review — creates ircc_client_reviews record
 *  2. Staff sends the plain-English summary PDF to client for review
 *  3. Staff marks it as sent + records signing request ID (if using e-sign)
 *  4. On client signature → staff marks as signed → final form pack unlocks
 *
 * The panel shows the current status, allows status updates, and
 * displays contextual instructions based on the current state.
 */

import { format } from 'date-fns'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Send,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import {
  useIrccClientReview,
  useCreateIrccClientReview,
  useMarkIrccReviewSent,
  useMarkIrccReviewSigned,
  useMarkIrccReviewDeclined,
  type IrccClientReview,
} from '@/lib/queries/ircc-client-review'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClientReviewPanelProps {
  matterId: string
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    colour: 'text-slate-600 bg-slate-100 border-slate-200',
    description: 'Review initiated but not yet sent to client.',
  },
  sent: {
    label: 'Sent to Client',
    icon: Send,
    colour: 'text-blue-700 bg-blue-50 border-blue-200',
    description: 'Plain-English summary sent to client for review and signature.',
  },
  signed: {
    label: 'Signed',
    icon: CheckCircle2,
    colour: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    description: 'Client has signed the summary. Final form pack is now unlocked.',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    colour: 'text-red-700 bg-red-50 border-red-200',
    description: 'Client declined or requested changes. Please follow up.',
  },
  expired: {
    label: 'Expired',
    icon: AlertCircle,
    colour: 'text-amber-700 bg-amber-50 border-amber-200',
    description: 'Review link has expired. Create a new review request.',
  },
} as const

// ── Component ──────────────────────────────────────────────────────────────────

export function ClientReviewPanel({ matterId }: ClientReviewPanelProps) {
  const { data: review, isLoading } = useIrccClientReview(matterId)
  const createReview = useCreateIrccClientReview()
  const markSent = useMarkIrccReviewSent()
  const markSigned = useMarkIrccReviewSigned()
  const markDeclined = useMarkIrccReviewDeclined()

  const [signingId, setSigningId] = useState('')
  const [showSigningInput, setShowSigningInput] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-10 bg-slate-100 rounded-md" />
        <div className="h-16 bg-slate-100 rounded-md" />
      </div>
    )
  }

  // No review initiated yet
  if (!review) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Once the IRCC questionnaire is complete, send a plain-English summary to the client
          for their review and electronic signature. The final form pack generation will remain
          locked until the client has signed off on the information.
        </p>
        <Button
          onClick={() => createReview.mutate({ matterId })}
          disabled={createReview.isPending}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Initiate Client Review
        </Button>
      </div>
    )
  }

  const statusMeta = STATUS_CONFIG[review.status]
  const StatusIcon = statusMeta.icon

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        statusMeta.colour
      )}>
        <StatusIcon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Client Review: {statusMeta.label}</p>
            <Badge variant="outline" className={cn('text-[10px] border', statusMeta.colour)}>
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-xs mt-0.5 opacity-80">{statusMeta.description}</p>
          {review.sent_at && (
            <p className="text-xs mt-1 opacity-70">
              Sent {format(new Date(review.sent_at), 'MMM d, yyyy')}
            </p>
          )}
          {review.signed_at && (
            <p className="text-xs mt-1 font-medium">
              Signed {format(new Date(review.signed_at), 'MMM d, yyyy HH:mm')}
            </p>
          )}
        </div>
      </div>

      {/* Action area */}
      {review.status === 'pending' && (
        <PendingActions
          review={review}
          matterId={matterId}
          signingId={signingId}
          setSigningId={setSigningId}
          showSigningInput={showSigningInput}
          setShowSigningInput={setShowSigningInput}
          markSent={markSent}
        />
      )}

      {review.status === 'sent' && (
        <SentActions
          review={review}
          matterId={matterId}
          markSigned={markSigned}
          markDeclined={markDeclined}
        />
      )}

      {review.status === 'signed' && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">
            File is unlocked — you can now generate the final form pack.
          </p>
        </div>
      )}

      {(review.status === 'declined' || review.status === 'expired') && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {review.status === 'declined'
                ? 'The client declined or flagged issues. Discuss the concerns, update the questionnaire if needed, then initiate a new review.'
                : 'The review link has expired. Create a new review request to send an updated summary.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createReview.mutate({ matterId })}
            disabled={createReview.isPending}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Start New Review
          </Button>
        </div>
      )}

      <Separator />

      {/* Collapsible instructions */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        onClick={() => setShowInstructions((v) => !v)}
      >
        {showInstructions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        How does the client review flow work?
      </button>

      {showInstructions && (
        <div className="rounded-md bg-slate-50 border px-4 py-3 text-xs text-slate-600 space-y-1.5">
          <p className="font-medium text-slate-700">Client Review Flow</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click <strong>Initiate Client Review</strong> to start the process.</li>
            <li>Generate the plain-English PDF summary from the IRCC questionnaire data.</li>
            <li>Send it to the client via email or the e-sign system.</li>
            <li>Mark as <strong>Sent</strong> with the e-sign request ID (if applicable).</li>
            <li>Once the client signs, click <strong>Mark as Signed</strong>.</li>
            <li>The final form pack generation unlocks automatically.</li>
          </ol>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function PendingActions({
  review,
  matterId,
  signingId,
  setSigningId,
  showSigningInput,
  setShowSigningInput,
  markSent,
}: {
  review: IrccClientReview
  matterId: string
  signingId: string
  setSigningId: (v: string) => void
  showSigningInput: boolean
  setShowSigningInput: (v: boolean) => void
  markSent: ReturnType<typeof useMarkIrccReviewSent>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Review record created. Send the plain-English questionnaire summary to the client, then
        mark it as sent below.
      </p>

      {!showSigningInput ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowSigningInput(true)}
        >
          <Send className="h-3.5 w-3.5" />
          Mark as Sent to Client
        </Button>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">E-Sign Request ID (optional)</Label>
          <div className="flex gap-2">
            <Input
              value={signingId}
              onChange={(e) => setSigningId(e.target.value)}
              placeholder="e.g., esign_abc123 (leave blank if sent by email)"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 shrink-0"
              disabled={markSent.isPending}
              onClick={() =>
                markSent.mutate({
                  reviewId: review.id,
                  matterId,
                  signingRequestId: signingId || undefined,
                })
              }
            >
              <Send className="h-3.5 w-3.5" />
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowSigningInput(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SentActions({
  review,
  matterId,
  markSigned,
  markDeclined,
}: {
  review: IrccClientReview
  matterId: string
  markSigned: ReturnType<typeof useMarkIrccReviewSigned>
  markDeclined: ReturnType<typeof useMarkIrccReviewDeclined>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Waiting for client signature. Once you receive the signed document, confirm below.
      </p>
      {review.signing_request_id && (
        <p className="text-xs text-muted-foreground">
          E-Sign ID: <code className="bg-slate-100 px-1 rounded text-[10px]">{review.signing_request_id}</code>
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={markSigned.isPending}
          onClick={() => markSigned.mutate({ reviewId: review.id, matterId })}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Mark as Signed
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50"
          disabled={markDeclined.isPending}
          onClick={() => markDeclined.mutate({ reviewId: review.id, matterId })}
        >
          <XCircle className="h-3.5 w-3.5" />
          Mark as Declined
        </Button>
      </div>
    </div>
  )
}
