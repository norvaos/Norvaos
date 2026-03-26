'use client'

import { useState, useRef, useCallback, useMemo, type DragEvent } from 'react'
import {
  useDocumentSlots,
  useDocumentSlotVersions,
  useUploadToSlot,
  useReviewSlot,
  useRegenerateSlots,
  useCreateCustomSlot,
} from '@/lib/queries/document-slots'
import { useDownloadDocument } from '@/lib/queries/documents'
import { useMatterFolders } from '@/lib/queries/matter-folders'
import { formatDate } from '@/lib/utils/formatters'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { FolderTreePanel } from '@/components/matters/folder-tree-panel'

import { DOCUMENT_REJECTION_REASONS } from '@/lib/utils/constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Upload,
  FileText,
  Check,
  X,
  RotateCcw,
  History,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileDown,
  Plus,
  Share2,
  ScanSearch,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DocumentScanButton } from '@/components/shared/document-scan-button'
import { TamperStatusIndicator } from '@/components/matters/document-tamper-overlay'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DocumentSlotPanelProps {
  matterId: string
  tenantId: string
  enforcementEnabled: boolean
  /** Optional search query  -  filters visible slots by name (case-insensitive) */
  filterQuery?: string
  /** Optional status filter  -  shows only slots matching this status */
  filterStatus?: string
}

type SlotStatus = 'empty' | 'pending_review' | 'accepted' | 'needs_re_upload' | 'rejected'

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatPersonRole(role: string | null): string {
  if (!role) return ''
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export type { SlotStatus }

export const STATUS_CONFIG: Record<SlotStatus, {
  label: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  icon: typeof Check
  className: string
}> = {
  empty: {
    label: 'Empty',
    variant: 'outline',
    icon: AlertCircle,
    className: 'border-amber-300 text-amber-700 bg-amber-50',
  },
  pending_review: {
    label: 'Pending Review',
    variant: 'outline',
    icon: Clock,
    className: 'border-blue-300 text-blue-700 bg-blue-50',
  },
  accepted: {
    label: 'Accepted',
    variant: 'outline',
    icon: CheckCircle2,
    className: 'border-green-300 text-green-700 bg-green-50',
  },
  needs_re_upload: {
    label: 'Needs Re-upload',
    variant: 'default',
    icon: RotateCcw,
    className: 'bg-orange-500 text-white border-orange-500',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
    icon: XCircle,
    className: 'bg-red-500 text-white border-red-500',
  },
}

// ─── StatusBadge ────────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: SlotStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.empty
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ─── SlotCard ───────────────────────────────────────────────────────────────────

export function SlotCard({
  slot,
  matterId,
  onViewHistory,
}: {
  slot: ReturnType<typeof useDocumentSlots>['data'] extends (infer T)[] | undefined ? T : never
  matterId: string
  onViewHistory: (slotId: string) => void
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showViewer, setShowViewer] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [slotScanExtracted, setSlotScanExtracted] = useState<Record<string, string | number | null> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadToSlot()
  const downloadMutation = useDownloadDocument()

  const status = (slot.status as SlotStatus) ?? 'empty'
  const hasDocument = !!slot.current_document_id && slot.current_version > 0
  const currentDoc = (slot as { current_document?: { id: string; file_name: string; file_type: string | null; file_size: number | null; storage_path: string; storage_bucket: string | null; onedrive_web_url?: string | null; external_provider?: string | null; is_shared_with_client?: boolean | null; created_at: string } | null }).current_document
  const [sharedState, setSharedState] = useState<boolean>(currentDoc?.is_shared_with_client ?? false)

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setPendingFile(file)
      setSlotScanExtracted(null)
      setShowUpload(true)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    []
  )

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFile) return
    await uploadMutation.mutateAsync({
      file: pendingFile,
      slotId: slot.id,
      matterId,
    })
    setPendingFile(null)
    setSlotScanExtracted(null)
    setShowUpload(false)
  }, [pendingFile, slot.id, matterId, uploadMutation])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      setPendingFile(file)
      setSlotScanExtracted(null)
      setShowUpload(true)
    }
  }, [])

  return (
    <div
      className={cn(
        'border rounded-lg p-4 space-y-3',
        isDragging && 'border-primary border-dashed bg-primary/5'
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        </div>
      </div>

      {/* Document info (if uploaded) */}
      {hasDocument && currentDoc && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <FileText className="h-3 w-3" />
          <span>v{slot.current_version}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate max-w-[200px]">{currentDoc.file_name}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{formatFileSize(currentDoc.file_size)}</span>
          {/* Directive 016.1: Integrity Overlay  -  tamper status indicator */}
          <span className="text-muted-foreground/50">·</span>
          <TamperStatusIndicator
            documentId={currentDoc.id}
            tamperStatus={(currentDoc as { tamper_status?: string }).tamper_status as 'verified' | 'tampered' | 'unchecked' | undefined}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View button */}
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

        {/* Download button */}
        {hasDocument && currentDoc && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadMutation.mutate({ storagePath: currentDoc.storage_path, bucket: currentDoc.storage_bucket ?? undefined })
            }
            disabled={downloadMutation.isPending}
            className="h-7 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
        )}

        {/* Upload / Re-upload button */}
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

        {/* Review actions (only for pending_review status) */}
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

        {/* Share with client */}
        {hasDocument && (
          <Button
            variant={sharedState ? 'default' : 'outline'}
            size="sm"
            onClick={handleShareToggle}
            disabled={isSharing}
            className={sharedState ? 'h-7 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600' : 'h-7 text-xs'}
            title={sharedState ? 'Shared with client  -  click to unshare' : 'Share with client via portal'}
          >
            {isSharing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Share2 className="mr-1 h-3 w-3" />
            )}
            {sharedState ? 'Shared' : 'Share'}
          </Button>
        )}

        {/* Version history */}
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

      {/* Upload Confirmation Dialog (with Scan option) */}
      <Dialog open={showUpload} onOpenChange={(open) => {
        if (!open) { setShowUpload(false); setPendingFile(null); setSlotScanExtracted(null) }
      }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload to: {slot.slot_name}</DialogTitle>
            <DialogDescription>
              {pendingFile ? pendingFile.name : 'Select a file to upload'}
            </DialogDescription>
          </DialogHeader>
          {pendingFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="truncate">{pendingFile.name}</span>
                <span className="text-xs">({formatFileSize(pendingFile.size)})</span>
              </div>

              {/* Scan Button */}
              <div className="flex items-center gap-2">
                <DocumentScanButton
                  file={pendingFile}
                  documentTypeHint={slot.slot_slug}
                  onFieldsExtracted={(fields) => {
                    setSlotScanExtracted(fields)
                  }}
                  disabled={uploadMutation.isPending}
                />
                <span className="text-xs text-muted-foreground">Optional  -  extract data before uploading</span>
              </div>

              {/* Scan Results */}
              {slotScanExtracted && (
                <div className="border rounded-lg bg-green-50/50 border-green-200 divide-y divide-green-100">
                  <div className="px-3 py-1.5 text-xs font-medium text-green-700 flex items-center gap-1.5">
                    <ScanSearch className="h-3.5 w-3.5" />
                    Extracted Information
                  </div>
                  {Object.entries(slotScanExtracted)
                    .filter(([, v]) => v !== null)
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between px-3 py-1.5 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUpload(false); setPendingFile(null); setSlotScanExtracted(null) }}>
              Cancel
            </Button>
            <Button onClick={handleConfirmUpload} disabled={uploadMutation.isPending || !pendingFile}>
              {uploadMutation.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Uploading...</>
              ) : (
                <><Upload className="mr-1 h-4 w-4" />Upload</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      {showReview && (
        <SlotReviewDialog
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

// ─── SlotReviewDialog ───────────────────────────────────────────────────────────

export function SlotReviewDialog({
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
              placeholder="Internal notes for this review..."
              className="mt-1"
              rows={2}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Client Guidance (optional)</label>
            <Textarea
              value={clientGuidance}
              onChange={(e) => setClientGuidance(e.target.value)}
              placeholder="Instructions for the client on what to re-submit..."
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
              id="notify-client"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="notify-client" className="text-sm">
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
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReview('needs_re_upload')}
            disabled={reviewMutation.isPending}
            className="text-orange-600 border-orange-200 hover:bg-orange-50"
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

// ─── VersionHistorySheet ────────────────────────────────────────────────────────

export function VersionHistorySheet({
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
                <div
                  key={version.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        v{version.version_number}
                      </span>
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
                      Uploaded by {uploaderName} on{' '}
                      {formatDate(version.created_at)}
                    </p>
                    {reviewerName && version.reviewed_at && (
                      <p>
                        Reviewed by {reviewerName} on{' '}
                        {formatDate(version.reviewed_at)}
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

      {/* Document Viewer for version preview */}
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

// ─── DocumentSlotPanel (Main Export) ────────────────────────────────────────────

export function DocumentSlotPanel({
  matterId,
  tenantId,
  enforcementEnabled,
  filterQuery,
  filterStatus,
}: DocumentSlotPanelProps) {
  const { data: slotsRaw, isLoading, error } = useDocumentSlots(matterId)
  const slots = useMemo(() => {
    if (!slotsRaw) return slotsRaw
    return slotsRaw.filter((s) => {
      if (filterQuery && !s.slot_name.toLowerCase().includes(filterQuery.toLowerCase())) return false
      if (filterStatus && filterStatus !== 'all') {
        if (filterStatus === 'shared') {
          return (s as { current_document?: { is_shared_with_client?: boolean | null } | null }).current_document?.is_shared_with_client === true
        }
        if (s.status !== filterStatus) return false
      }
      return true
    })
  }, [slotsRaw, filterQuery, filterStatus])
  const { data: folders } = useMatterFolders(matterId)
  const hasFolders = folders && folders.length > 0
  const regenerateMutation = useRegenerateSlots()
  const createCustomSlot = useCreateCustomSlot()
  const [historySlotId, setHistorySlotId] = useState<string | null>(null)
  const [bundleLoading, setBundleLoading] = useState<'view' | 'download' | null>(null)
  const [bundleViewUrl, setBundleViewUrl] = useState<string | null>(null)
  const [addingDoc, setAddingDoc] = useState(false)
  const [newDocName, setNewDocName] = useState('')

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

  const handleBundle = useCallback(async (mode: 'view' | 'download') => {
    setBundleLoading(mode)
    try {
      const res = await fetch(`/api/matters/${matterId}/document-bundle`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate bundle')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      if (mode === 'view') {
        setBundleViewUrl(url)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'document-bundle.pdf'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Bundle error:', err)
      alert(err instanceof Error ? err.message : 'Failed to generate document bundle')
    } finally {
      setBundleLoading(null)
    }
  }, [matterId])

  // Group slots by category
  const groupedSlots = useMemo(() => {
    if (!slots) return {}
    const groups: Record<string, typeof slots> = {}
    for (const slot of slots) {
      const cat = slot.category || 'general'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(slot)
    }
    return groups
  }, [slots])

  const categories = useMemo(
    () => Object.keys(groupedSlots).sort(),
    [groupedSlots]
  )

  // Summary stats
  const stats = useMemo(() => {
    if (!slots) return { total: 0, required: 0, accepted: 0, pending: 0, empty: 0 }
    const required = slots.filter((s) => s.is_required)
    return {
      total: slots.length,
      required: required.length,
      accepted: required.filter((s) => s.status === 'accepted').length,
      pending: slots.filter((s) => s.status === 'pending_review').length,
      empty: slots.filter((s) => s.status === 'empty').length,
    }
  }, [slots])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load document slots. Please try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Document Requirements</CardTitle>
            <div className="flex items-center gap-2">
              {/* Summary */}
              {stats.total > 0 && (
                <span className="text-xs text-muted-foreground">
                  {stats.accepted}/{stats.required} required accepted
                </span>
              )}
              {/* Bundle  -  View (eye icon only) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBundle('view')}
                disabled={!!bundleLoading || stats.empty === stats.total}
                className="h-7 w-7 p-0"
                title="View all documents as one PDF"
              >
                {bundleLoading === 'view' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              {/* Bundle  -  Download */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBundle('download')}
                disabled={!!bundleLoading || stats.empty === stats.total}
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
              {/* Regenerate button */}
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
              {/* Add Document button */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAddingDoc((v) => !v)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Document
              </Button>
            </div>
          </div>

          {/* Inline add-document row */}
          {addingDoc && (
            <div className="flex items-center gap-2 mt-2 pb-2 border-b">
              <Input
                autoFocus
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddDocument() }
                  if (e.key === 'Escape') { setAddingDoc(false); setNewDocName('') }
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
                {createCustomSlot.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setAddingDoc(false); setNewDocName('') }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {categories.length === 0 && !hasFolders && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No document requirements configured for this matter type.
            </p>
          )}

          {/* Folder tree view (when folders exist) */}
          {hasFolders && slots ? (
            <FolderTreePanel
              folders={folders}
              slots={slots.map((s) => ({
                id: s.id,
                slot_name: s.slot_name,
                description: s.description,
                category: s.category,
                person_role: s.person_role,
                is_required: s.is_required,
                status: s.status,
                current_version: s.current_version,
                current_document_id: s.current_document_id,
                folder_id: (s as { folder_id?: string | null }).folder_id ?? null,
              }))}
              matterId={matterId}
              renderSlot={(slot) => {
                const fullSlot = slots.find((s) => s.id === slot.id)
                if (!fullSlot) return null
                return (
                  <SlotCard
                    key={slot.id}
                    slot={fullSlot}
                    matterId={matterId}
                    onViewHistory={setHistorySlotId}
                  />
                )
              }}
            />
          ) : (
            /* Flat category-grouped view (fallback) */
            <>
              {categories.map((category) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                    {formatCategory(category)}
                  </h3>
                  <div className="space-y-3">
                    {groupedSlots[category]?.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        matterId={matterId}
                        onViewHistory={setHistorySlotId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Version History Sheet */}
      {historySlotId && (
        <VersionHistorySheet
          slotId={historySlotId}
          open={!!historySlotId}
          onOpenChange={(open) => {
            if (!open) setHistorySlotId(null)
          }}
        />
      )}

      {/* Bundle PDF Viewer */}
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
    </>
  )
}
