'use client'

/**
 * DocumentsTab  -  Zone D tab #2
 *
 * Replaces the bare DocumentSlotPanel with an enhanced layout:
 *   Left sidebar   -  collapsible category folder tree (~250 px)
 *   Right content  -  slot cards with upload, review, version history,
 *                   share, and document-bundle actions
 *   Top bar        -  progress summary (X of Y documents uploaded)
 *
 * DB findings (via Supabase MCP, 2026-03-17):
 *   • document_slots   -  no expiry_date column  → expiry tracking SKIPPED
 *   • document_versions  -  no expiry_date column → expiry tracking SKIPPED
 *   • matter_types  -  no document_naming_template column → auto-naming SKIPPED
 *   • matter.matter_number exists → used in suggested filenames (manual only)
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useDocumentSlots,
  useUploadToSlot,
  useReviewSlot,
  useRegenerateSlots,
  useCreateCustomSlot,
  useDocumentSlotVersions,
} from '@/lib/queries/document-slots'
import { useMatterTypeNamingTemplate } from '@/lib/queries/matter-types'
import { useDownloadDocument } from '@/lib/queries/documents'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DocumentViewer } from '@/components/shared/document-viewer'
import {
  StatusBadge,
  formatCategory,
  formatFileSize,
  formatPersonRole,
  STATUS_CONFIG,
  type SlotStatus,
} from '@/components/matters/document-slot-panel'

import { DOCUMENT_REJECTION_REASONS } from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  FileImage,
  File,
  Upload,
  Check,
  X,
  RotateCcw,
  History,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileDown,
  Plus,
  Share2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentsTabProps {
  matterId: string
  tenantId: string
  enforcementEnabled: boolean
  matterNumber?: string
  matterTypeId?: string | null
}

type SlotRow = ReturnType<typeof useDocumentSlots>['data'] extends (infer T)[] | undefined ? T : never

// ─── File-type icon helper ────────────────────────────────────────────────────

function FileTypeIcon({ acceptedTypes }: { acceptedTypes: string[] | null }) {
  const types = acceptedTypes ?? []
  const joined = types.join(',').toLowerCase()

  if (joined.includes('pdf')) {
    return <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />
  }
  if (joined.includes('docx') || joined.includes('doc') || joined.includes('word')) {
    return <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
  }
  if (joined.includes('image') || joined.includes('png') || joined.includes('jpg') || joined.includes('jpeg')) {
    return <FileImage className="h-3.5 w-3.5 text-green-500 shrink-0" />
  }
  return <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
}

// ─── Expiry badge helper ──────────────────────────────────────────────────────

function getExpiryBadge(expiryDate: string | null) {
  if (!expiryDate) return null
  const today = new Date()
  const expiry = new Date(expiryDate)
  const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return <Badge variant="destructive" className="text-xs">Expired {Math.abs(daysUntilExpiry)}d ago</Badge>
  }
  if (daysUntilExpiry <= 30) {
    return <Badge className="bg-amber-950/40 text-amber-800 border-amber-200 text-xs">Expires in {daysUntilExpiry}d</Badge>
  }
  return null // No badge needed if >30 days away
}

// ─── CategoryNode  -  collapsible folder in the sidebar ────────────────────────

function CategoryNode({
  category,
  slots,
  selectedSlotId,
  onSelectSlot,
}: {
  category: string
  slots: SlotRow[]
  selectedSlotId: string | null
  onSelectSlot: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  const total = slots.length
  const accepted = slots.filter((s) => s.status === 'accepted').length
  const allDone = total > 0 && accepted === total
  const anyEmpty = slots.some((s) => s.status === 'empty')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left',
            'text-xs font-medium hover:bg-muted/60 transition-colors',
            'group',
          )}
        >
          <span className="text-muted-foreground group-data-[state=open]:hidden">
            <ChevronRight className="h-3 w-3" />
          </span>
          <span className="text-muted-foreground group-data-[state=closed]:hidden">
            <ChevronDown className="h-3 w-3" />
          </span>
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
          <span className="flex-1 truncate">{formatCategory(category)}</span>
          <span
            className={cn(
              'text-[10px] font-mono rounded px-1 py-0.5',
              allDone
                ? 'bg-emerald-950/40 text-emerald-400'
                : anyEmpty
                  ? 'bg-amber-950/40 text-amber-400'
                  : 'bg-blue-950/40 text-blue-400',
            )}
          >
            {accepted}/{total}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul className="ml-3 border-l border-border/60 pl-2 space-y-0.5 py-0.5">
          {slots.map((slot) => (
            <li key={slot.id}>
              <button
                onClick={() => onSelectSlot(slot.id)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left',
                  'text-[11px] hover:bg-muted/60 transition-colors',
                  selectedSlotId === slot.id && 'bg-primary/10 text-primary font-medium',
                )}
              >
                <FileTypeIcon acceptedTypes={slot.accepted_file_types} />
                <span className="flex-1 truncate leading-snug">{slot.slot_name}</span>
                {slot.status === 'accepted' && (
                  <Check className="h-2.5 w-2.5 text-green-600 shrink-0" />
                )}
                {slot.status === 'empty' && slot.is_required && (
                  <AlertCircle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── SlotCard  -  individual document slot card ─────────────────────────────────

function SlotCard({
  slot,
  matterId,
  matterNumber,
  namingTemplate,
  onViewHistory,
  highlighted,
  cardRef,
}: {
  slot: SlotRow
  matterId: string
  matterNumber: string
  namingTemplate: string | null
  onViewHistory: (slotId: string) => void
  highlighted: boolean
  cardRef?: (el: HTMLDivElement | null) => void
}) {
  const [showReview, setShowReview] = useState(false)
  const [showViewer, setShowViewer] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadToSlot()
  const downloadMutation = useDownloadDocument()

  const status = (slot.status as SlotStatus) ?? 'empty'
  const hasDocument = !!slot.current_document_id && slot.current_version > 0
  const currentDoc = (
    slot as {
      current_document?: {
        id: string
        file_name: string
        file_type: string | null
        file_size: number | null
        storage_path: string
        storage_bucket: string | null
        onedrive_web_url?: string | null
        external_provider?: string | null
        is_shared_with_client?: boolean | null
        created_at: string
      } | null
    }
  ).current_document

  const [sharedState, setSharedState] = useState<boolean>(
    currentDoc?.is_shared_with_client ?? false,
  )

  const handleShareToggle = useCallback(async () => {
    if (!currentDoc?.id) return
    setIsSharing(true)
    try {
      const newShared = !sharedState
      const res = await fetch('/api/documents/share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: currentDoc.id, share: newShared }),
      })
      if (res.ok) setSharedState(newShared)
    } finally {
      setIsSharing(false)
    }
  }, [currentDoc?.id, sharedState])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.files?.[0]
      if (!raw) return
      // Auto-naming: if a template exists, rename the file before uploading
      let file: globalThis.File = raw
      if (namingTemplate) {
        const ext = raw.name.includes('.') ? raw.name.split('.').pop() ?? '' : ''
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10) // YYYY-MM-DD
        const generated = namingTemplate
          .replace(/\{matter_number\}/g, matterNumber)
          .replace(/\{slot_name\}/g, slot.slot_name.replace(/\s+/g, '_'))
          .replace(/\{date\}/g, dateStr)
          .replace(/\{ext\}/g, ext)
        const named = ext ? `${generated}.${ext}` : generated
        file = new globalThis.File([raw], named, { type: raw.type })
      }
      await uploadMutation.mutateAsync({ file, slotId: slot.id, matterId })
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [slot.id, slot.slot_name, matterId, matterNumber, namingTemplate, uploadMutation],
  )

  return (
    <div
      ref={cardRef}
      id={`slot-${slot.id}`}
      className={cn(
        'border rounded-lg p-4 space-y-3 transition-colors',
        highlighted && 'ring-2 ring-primary/40 border-primary/40 bg-primary/5',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{slot.slot_name}</h4>
            {slot.person_role && (
              <span className="text-xs text-muted-foreground">
                ({formatPersonRole(slot.person_role)})
              </span>
            )}
          </div>
          {slot.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {slot.is_required && (
            <Badge variant="outline" className="text-xs">
              Required
            </Badge>
          )}
          <StatusBadge status={status} />
          {getExpiryBadge((slot as { expiry_date?: string | null }).expiry_date ?? null)}
        </div>
      </div>

      {/* Optimistic upload state */}
      {uploadMutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Uploading…</span>
        </div>
      )}

      {/* Document info */}
      {hasDocument && currentDoc && !uploadMutation.isPending && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <FileText className="h-3 w-3" />
          <span>v{slot.current_version}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate max-w-[200px]">{currentDoc.file_name}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{formatFileSize(currentDoc.file_size)}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasDocument && currentDoc && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowViewer(true)}
            className="h-7 text-xs"
          >
            <Eye className="mr-1 h-3 w-3" />
            View
          </Button>
        )}

        {hasDocument && currentDoc && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadMutation.mutate({
                storagePath: currentDoc.storage_path,
                bucket: currentDoc.storage_bucket ?? undefined,
              })
            }
            disabled={downloadMutation.isPending}
            className="h-7 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
        )}

        <Button
          variant={hasDocument ? 'outline' : 'default'}
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="h-7 text-xs"
        >
          {uploadMutation.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Upload className="mr-1 h-3 w-3" />
          )}
          {hasDocument ? 'Upload New' : 'Upload'}
        </Button>

        {status === 'pending_review' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReview(true)}
            className="h-7 text-xs"
          >
            Review
          </Button>
        )}

        {hasDocument && (
          <Button
            variant={sharedState ? 'default' : 'outline'}
            size="sm"
            onClick={handleShareToggle}
            disabled={isSharing}
            className={
              sharedState
                ? 'h-7 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600'
                : 'h-7 text-xs'
            }
            title={
              sharedState
                ? 'Shared with client  -  click to unshare'
                : 'Share with client via portal'
            }
          >
            {isSharing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Share2 className="mr-1 h-3 w-3" />
            )}
            {sharedState ? 'Shared' : 'Share'}
          </Button>
        )}

        {slot.current_version > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewHistory(slot.id)}
            className="h-7 text-xs"
          >
            <History className="mr-1 h-3 w-3" />
            History
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={slot.accepted_file_types?.join(',') ?? undefined}
        onChange={handleFileSelect}
      />

      {/* Review Dialog */}
      {showReview && (
        <InlineReviewDialog
          slotId={slot.id}
          slotName={slot.slot_name}
          matterId={matterId}
          open={showReview}
          onOpenChange={setShowReview}
        />
      )}

      {/* Document Viewer */}
      {showViewer && currentDoc && (
        <DocumentViewer
          storagePath={currentDoc.storage_path}
          fileName={currentDoc.file_name}
          fileType={currentDoc.file_type ?? ''}
          storageBucket={currentDoc.storage_bucket ?? undefined}
          externalUrl={currentDoc.onedrive_web_url}
          open={showViewer}
          onOpenChange={setShowViewer}
        />
      )}
    </div>
  )
}

// ─── InlineReviewDialog ───────────────────────────────────────────────────────

function InlineReviewDialog({
  slotId,
  slotName,
  matterId,
  open,
  onOpenChange,
}: {
  slotId: string
  slotName: string
  matterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rejectionReason, setRejectionReason] = useState('')
  const [reason, setReason] = useState('')
  const [clientGuidance, setClientGuidance] = useState('')
  const [notifyClient, setNotifyClient] = useState(true)
  const reviewMutation = useReviewSlot()

  const handleReview = async (action: 'accept' | 'needs_re_upload' | 'reject') => {
    const fullReason = [
      rejectionReason && action !== 'accept'
        ? DOCUMENT_REJECTION_REASONS.find((r) => r.value === rejectionReason)?.label
        : null,
      reason,
    ]
      .filter(Boolean)
      .join(': ')

    await reviewMutation.mutateAsync({
      slotId,
      matterId,
      action,
      reason: fullReason || undefined,
      clientGuidance: clientGuidance || undefined,
      notifyClient: action !== 'accept' ? notifyClient : false,
    })
    onOpenChange(false)
    setRejectionReason('')
    setReason('')
    setClientGuidance('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review: {slotName}</DialogTitle>
          <DialogDescription>
            Review this document and choose an action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Rejection Reason</label>
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select reason (if rejecting)" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_REJECTION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Internal Notes (optional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Internal notes for this review…"
              className="mt-1"
              rows={2}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Client Guidance (optional)</label>
            <Textarea
              value={clientGuidance}
              onChange={(e) => setClientGuidance(e.target.value)}
              placeholder="Instructions for the client on what to re-submit…"
              className="mt-1"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This message will be shown to the client in the portal.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notify-client-dt"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="notify-client-dt" className="text-sm">
              Notify client (for rejection / re-upload)
            </label>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReview('reject')}
            disabled={reviewMutation.isPending}
            className="text-red-600 border-red-500/20 hover:bg-red-950/30"
          >
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReview('needs_re_upload')}
            disabled={reviewMutation.isPending}
            className="text-orange-600 border-orange-500/20 hover:bg-orange-950/30"
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Needs Re-upload
          </Button>
          <Button
            size="sm"
            onClick={() => handleReview('accept')}
            disabled={reviewMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {reviewMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── VersionHistorySheet ──────────────────────────────────────────────────────

function VersionHistorySheet({
  slotId,
  open,
  onOpenChange,
}: {
  slotId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: versions, isLoading } = useDocumentSlotVersions(slotId)
  const downloadMutation = useDownloadDocument()
  const [viewingVersion, setViewingVersion] = useState<{
    storagePath: string
    fileName: string
    fileType: string | null
  } | null>(null)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
            <SheetDescription>
              All versions uploaded to this document slot.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {isLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            )}

            {versions?.map((version) => {
              const reviewStatus = version.review_status as SlotStatus
              const uploaderName = version.uploader
                ? [version.uploader.first_name, version.uploader.last_name]
                    .filter(Boolean)
                    .join(' ') || 'Unknown'
                : 'Unknown'
              const reviewerName = version.reviewer
                ? [version.reviewer.first_name, version.reviewer.last_name]
                    .filter(Boolean)
                    .join(' ') || null
                : null

              return (
                <div key={version.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">v{version.version_number}</span>
                      <StatusBadge status={reviewStatus} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setViewingVersion({
                            storagePath: version.storage_path,
                            fileName: version.file_name,
                            fileType: version.file_type,
                          })
                        }
                        className="h-7"
                        title="View"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadMutation.mutate({ storagePath: version.storage_path })
                        }
                        disabled={downloadMutation.isPending}
                        className="h-7"
                        title="Download"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      {version.file_name} · {formatFileSize(version.file_size)}
                    </p>
                    <p>
                      Uploaded by {uploaderName} on {formatDate(version.created_at)}
                    </p>
                    {reviewerName && version.reviewed_at && (
                      <p>
                        Reviewed by {reviewerName} on {formatDate(version.reviewed_at)}
                      </p>
                    )}
                    {version.review_reason && (
                      <p className="text-muted-foreground/80 italic">
                        &quot;{version.review_reason}&quot;
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {!isLoading && (!versions || versions.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No versions uploaded yet.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {viewingVersion && (
        <DocumentViewer
          storagePath={viewingVersion.storagePath}
          fileName={viewingVersion.fileName}
          fileType={viewingVersion.fileType}
          open={!!viewingVersion}
          onOpenChange={(isOpen) => {
            if (!isOpen) setViewingVersion(null)
          }}
        />
      )}
    </>
  )
}

// ─── StatusSummaryBar ─────────────────────────────────────────────────────────

function StatusSummaryBar({
  slots,
}: {
  slots: SlotRow[]
}) {
  const stats = useMemo(() => {
    const required = slots.filter((s) => s.is_required)
    const uploaded = slots.filter(
      (s) => s.status !== 'empty',
    )
    return {
      total: slots.length,
      uploaded: uploaded.length,
      required: required.length,
      acceptedRequired: required.filter((s) => s.status === 'accepted').length,
      pendingReview: slots.filter((s) => s.status === 'pending_review').length,
      accepted: slots.filter((s) => s.status === 'accepted').length,
      empty: slots.filter((s) => s.status === 'empty').length,
      needsReupload: slots.filter((s) => s.status === 'needs_re_upload').length,
    }
  }, [slots])

  const pct = stats.total > 0 ? Math.round((stats.uploaded / stats.total) * 100) : 0

  return (
    <div className="border-b bg-card px-4 py-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium whitespace-nowrap">
            {stats.uploaded} of {stats.total} documents uploaded
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ({stats.acceptedRequired}/{stats.required} required accepted)
          </span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{pct}%</span>
      </div>

      <Progress value={pct} className="h-1.5" />

      <div className="flex items-center gap-3 flex-wrap">
        {stats.accepted > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            {stats.accepted} accepted
          </span>
        )}
        {stats.pendingReview > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />
            {stats.pendingReview} pending review
          </span>
        )}
        {stats.needsReupload > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-orange-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-950/300 inline-block" />
            {stats.needsReupload} needs re-upload
          </span>
        )}
        {stats.empty > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
            {stats.empty} empty
          </span>
        )}
      </div>
    </div>
  )
}

// ─── DocumentsTab (main export) ───────────────────────────────────────────────

export function DocumentsTab({
  matterId,
  tenantId,
  enforcementEnabled,
  matterNumber = '',
  matterTypeId = null,
}: DocumentsTabProps) {
  const { data: slotsRaw, isLoading, error } = useDocumentSlots(matterId)
  const { data: namingTemplate = null } = useMatterTypeNamingTemplate(matterTypeId)
  const regenerateMutation = useRegenerateSlots()
  const createCustomSlot = useCreateCustomSlot()

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [historySlotId, setHistorySlotId] = useState<string | null>(null)
  const [bundleLoading, setBundleLoading] = useState<'view' | 'download' | null>(null)
  const [bundleViewUrl, setBundleViewUrl] = useState<string | null>(null)
  const [addingDoc, setAddingDoc] = useState(false)
  const [newDocName, setNewDocName] = useState('')

  // Refs map for scroll-into-view
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const handleSelectSlot = useCallback((slotId: string, category: string) => {
    setSelectedSlotId(slotId)
    setSelectedCategory(category)
    // Scroll the card into view
    setTimeout(() => {
      const el = cardRefs.current.get(slotId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [])

  const groupedSlots = useMemo(() => {
    if (!slotsRaw) return {} as Record<string, SlotRow[]>
    const groups: Record<string, SlotRow[]> = {}
    for (const slot of slotsRaw) {
      const cat = slot.category ?? 'general'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(slot)
    }
    return groups
  }, [slotsRaw])

  const categories = useMemo(() => Object.keys(groupedSlots).sort(), [groupedSlots])

  // Filter slots for the main content area by selected category (or show all)
  const visibleSlots = useMemo(() => {
    if (!slotsRaw) return []
    if (selectedCategory) return groupedSlots[selectedCategory] ?? []
    return slotsRaw
  }, [slotsRaw, selectedCategory, groupedSlots])

  const handleAddDocument = () => {
    const trimmed = newDocName.trim()
    if (!trimmed || createCustomSlot.isPending) return
    createCustomSlot.mutate(
      { matterId, slotName: trimmed },
      {
        onSuccess: () => {
          setNewDocName('')
          setAddingDoc(false)
        },
      },
    )
  }

  const handleBundle = useCallback(
    async (mode: 'view' | 'download') => {
      setBundleLoading(mode)
      try {
        const res = await fetch(`/api/matters/${matterId}/document-bundle`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || 'Failed to generate bundle')
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (mode === 'view') {
          setBundleViewUrl(url)
        } else {
          const a = document.createElement('a')
          a.href = url
          a.download =
            res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
            'document-bundle.pdf'
          a.click()
          URL.revokeObjectURL(url)
        }
      } catch (err) {
        console.error('Bundle error:', err)
        toast.error(err instanceof Error ? err.message : 'Failed to generate document bundle')
      } finally {
        setBundleLoading(null)
      }
    },
    [matterId],
  )

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-1.5 w-full" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[250px] shrink-0 border-r p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
          <div className="flex-1 p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-destructive">
          Failed to load document requirements. Please try again.
        </p>
      </div>
    )
  }

  const slots = slotsRaw ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Status summary bar ─────────────────────────────────────────────── */}
      {slots.length > 0 && <StatusSummaryBar slots={slots} />}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="border-b bg-card px-4 py-2 flex items-center gap-2 shrink-0">
        {/* Bundle  -  view */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleBundle('view')}
          disabled={!!bundleLoading || slots.every((s) => s.status === 'empty')}
          className="h-7 w-7 p-0"
          title="View all documents as one PDF"
        >
          {bundleLoading === 'view' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Bundle  -  download */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBundle('download')}
          disabled={!!bundleLoading || slots.every((s) => s.status === 'empty')}
          className="h-7 text-xs"
          title="Download all documents as one PDF"
        >
          {bundleLoading === 'download' ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <FileDown className="mr-1 h-3 w-3" />
          )}
          Download Bundle
        </Button>

        {/* Regenerate */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => regenerateMutation.mutate({ matterId })}
          disabled={regenerateMutation.isPending}
          className="h-7 text-xs"
        >
          {regenerateMutation.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Refresh
        </Button>

        {/* Add Document */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs ml-auto"
          onClick={() => setAddingDoc((v) => !v)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Document
        </Button>
      </div>

      {/* Inline add-document row */}
      {addingDoc && (
        <div className="border-b px-4 py-2 flex items-center gap-2 bg-muted/30 shrink-0">
          <Input
            autoFocus
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddDocument()
              }
              if (e.key === 'Escape') {
                setAddingDoc(false)
                setNewDocName('')
              }
            }}
            placeholder="Document name, e.g. Employment letter"
            className="h-8 text-sm flex-1"
            disabled={createCustomSlot.isPending}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleAddDocument}
            disabled={!newDocName.trim() || createCustomSlot.isPending}
          >
            {createCustomSlot.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              'Add'
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              setAddingDoc(false)
              setNewDocName('')
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* ── Main body: sidebar + content ───────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar  -  folder tree */}
        <div className="w-[250px] shrink-0 border-r overflow-y-auto bg-sidebar/30 p-2 space-y-1">
          {/* "All" item */}
          <button
            onClick={() => {
              setSelectedCategory(null)
              setSelectedSlotId(null)
            }}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left',
              'text-xs font-medium hover:bg-muted/60 transition-colors',
              selectedCategory === null && 'bg-primary/10 text-primary',
            )}
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1">All Documents</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {slots.length}
            </span>
          </button>

          {categories.map((cat) => (
            <div key={cat}>
              <CategoryNode
                category={cat}
                slots={groupedSlots[cat] ?? []}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(slotId) => handleSelectSlot(slotId, cat)}
              />
            </div>
          ))}
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Category heading when filtered */}
          {selectedCategory && (
            <div className="flex items-center gap-2 pb-1 border-b">
              <FolderOpen className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">{formatCategory(selectedCategory)}</h3>
              <Badge variant="outline" className="text-xs">
                {visibleSlots.length} slot{visibleSlots.length !== 1 ? 's' : ''}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 text-xs text-muted-foreground"
                onClick={() => {
                  setSelectedCategory(null)
                  setSelectedSlotId(null)
                }}
              >
                Show all
              </Button>
            </div>
          )}

          {/* Empty state */}
          {visibleSlots.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No document requirements configured for this matter type.
            </p>
          )}

          {/* Grouped by category (only when showing all) */}
          {!selectedCategory &&
            categories.map((cat) => (
              <div key={cat} className="space-y-3">
                <button
                  onClick={() => setSelectedCategory(cat)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                  {formatCategory(cat)}
                  <span className="normal-case tracking-normal font-mono">
                    ({groupedSlots[cat]?.length ?? 0})
                  </span>
                </button>
                <div className="space-y-3">
                  {(groupedSlots[cat] ?? []).map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      matterId={matterId}
                      matterNumber={matterNumber}
                      namingTemplate={namingTemplate}
                      onViewHistory={setHistorySlotId}
                      highlighted={slot.id === selectedSlotId}
                      cardRef={(el) => {
                        if (el) cardRefs.current.set(slot.id, el)
                        else cardRefs.current.delete(slot.id)
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

          {/* Filtered category slots */}
          {selectedCategory &&
            visibleSlots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                matterId={matterId}
                matterNumber={matterNumber}
                namingTemplate={namingTemplate}
                onViewHistory={setHistorySlotId}
                highlighted={slot.id === selectedSlotId}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(slot.id, el)
                  else cardRefs.current.delete(slot.id)
                }}
              />
            ))}
        </div>
      </div>

      {/* ── Version History Sheet ──────────────────────────────────────────── */}
      {historySlotId && (
        <VersionHistorySheet
          slotId={historySlotId}
          open={!!historySlotId}
          onOpenChange={(open) => {
            if (!open) setHistorySlotId(null)
          }}
        />
      )}

      {/* ── Bundle PDF Viewer ──────────────────────────────────────────────── */}
      {bundleViewUrl && (
        <Dialog
          open={!!bundleViewUrl}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              URL.revokeObjectURL(bundleViewUrl)
              setBundleViewUrl(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Document Bundle</DialogTitle>
              <DialogDescription className="sr-only">
                Combined PDF of all uploaded documents
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-slate-50">
              <iframe
                src={bundleViewUrl}
                className="w-full h-full border-0"
                title="Document Bundle"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
