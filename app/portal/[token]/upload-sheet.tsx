'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Camera,
  FolderOpen,
  X,
  Loader2,
  Upload,
  FileText,
  AlertCircle,
  Asterisk,
} from 'lucide-react'
import {
  type StagedPage,
  createStagedPage,
  revokeStagedPages,
  combinePagesIntoPdf,
  formatFileSize,
} from '@/lib/utils/pdf-combine'
import { cn } from '@/lib/utils'
import {
  getTranslations,
  t,
  type PortalLocale,
} from '@/lib/utils/portal-translations'

// ─── Types ──────────────────────────────────────────────────────────────────

interface UploadSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slotId: string
  slotName: string
  description: string | null
  isRequired: boolean
  acceptedFileTypes: string[]
  maxFileSizeBytes: number
  token: string
  language?: PortalLocale
  onUploadComplete: (result: { versionNumber: number }) => void
  onUploadError: (error: string) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** MIME → extension mapping for the file picker accept attribute */
const MIME_EXT_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg,.jpeg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
}

/** Default accepted extensions when slot has no restrictions */
const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx'

/** Convert MIME types to file extensions for input accept attribute */
function mimeToAccept(types: string[]): string {
  if (types.length === 0) return DEFAULT_ACCEPT
  return types.map((t) => MIME_EXT_MAP[t] ?? t).join(',')
}

/** Check if the file type can be combined into a multi-page PDF (images + PDFs only) */
function isCombinable(type: string): boolean {
  return (
    type === 'image/jpeg' ||
    type === 'image/png' ||
    type === 'application/pdf'
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UploadSheet({
  open,
  onOpenChange,
  slotId,
  slotName,
  description,
  isRequired,
  acceptedFileTypes,
  maxFileSizeBytes,
  token,
  language = 'en',
  onUploadComplete,
  onUploadError,
}: UploadSheetProps) {
  const tr = getTranslations(language)
  const [pages, setPages] = useState<StagedPage[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [sheetError, setSheetError] = useState<string | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const filePickerInputRef = useRef<HTMLInputElement>(null)

  // Compute accept string for file picker
  const fileAccept = mimeToAccept(acceptedFileTypes)

  // Can we combine multiple pages into PDF?
  const canCombineToPdf =
    acceptedFileTypes.length === 0 || acceptedFileTypes.includes('application/pdf')

  // Running totals
  const totalSize = pages.reduce((sum, p) => sum + p.file.size, 0)
  const maxMB = Math.round(maxFileSizeBytes / (1024 * 1024))

  // ── Cleanup on close ────────────────────────────────────────────────
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        revokeStagedPages(pages)
        setPages([])
        setUploadProgress('')
        setSheetError(null)
      }
      onOpenChange(nextOpen)
    },
    [pages, onOpenChange]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revokeStagedPages(pages)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Does the current staging area contain a non-combinable document?
  const hasDocumentFile = pages.some((p) => p.type === 'document')
  // Can we still add more pages? Only if all current files are combinable (images/PDFs).
  const canAddMore = !hasDocumentFile

  // ── Add page ────────────────────────────────────────────────────────
  const addPage = useCallback(
    (file: File) => {
      // Check if this single file exceeds max (rough check)
      if (file.size > maxFileSizeBytes) {
        setSheetError(t(tr.upload_sheet_error_file_size, { name: file.name, max: maxMB }))
        return
      }

      const combinable = isCombinable(file.type)

      // If staging already has a non-combinable document, reject more files
      setPages((prev) => {
        const existingHasDocument = prev.some((p) => p.type === 'document')
        if (existingHasDocument) {
          setSheetError('Only one document file can be uploaded at a time. Remove the current file first.')
          return prev
        }

        // If adding a non-combinable file, it must be the only file
        if (!combinable && prev.length > 0) {
          setSheetError('Document files (Word, Excel) cannot be combined with other files. Remove existing pages first.')
          return prev
        }

        setSheetError(null)
        return [...prev, createStagedPage(file)]
      })
    },
    [maxFileSizeBytes, maxMB]
  )

  // ── Camera capture handler ──────────────────────────────────────────
  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) addPage(file)
      e.target.value = '' // Reset for next capture
    },
    [addPage]
  )

  // ── File picker handler (multi-select) ──────────────────────────────
  const handleFilesPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      for (const file of files) {
        addPage(file)
      }
      e.target.value = '' // Reset
    },
    [addPage]
  )

  // ── Remove page ─────────────────────────────────────────────────────
  const removePage = (pageId: string) => {
    setPages((prev) => {
      const removed = prev.find((p) => p.id === pageId)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((p) => p.id !== pageId)
    })
    setSheetError(null)
  }

  // ── Upload handler ──────────────────────────────────────────────────
  const handleUpload = async () => {
    if (pages.length === 0) return
    setIsUploading(true)
    setSheetError(null)

    try {
      let fileToUpload: File
      const allCombinable = pages.every((p) => p.type !== 'document')

      if (pages.length === 1 || !allCombinable) {
        // Single file or non-combinable document: upload as-is
        fileToUpload = pages[0].file
        setUploadProgress(tr.upload_sheet_uploading)
      } else if (!canCombineToPdf) {
        // Multiple files but slot doesn't accept PDF → upload only the first
        fileToUpload = pages[0].file
        setUploadProgress(tr.upload_sheet_uploading)
      } else {
        // Multiple combinable pages: combine into single PDF
        setUploadProgress(tr.upload_sheet_preparing)
        const safeName = slotName.replace(/[^a-zA-Z0-9\s-_()]/g, '').trim()
        fileToUpload = await combinePagesIntoPdf(pages, `${safeName}.pdf`)
        setUploadProgress(tr.upload_sheet_uploading)
      }

      // Validate combined file size
      if (fileToUpload.size > maxFileSizeBytes) {
        setSheetError(
          t(tr.upload_sheet_error_combined_size, { size: formatFileSize(fileToUpload.size), max: maxMB })
        )
        setIsUploading(false)
        setUploadProgress('')
        return
      }

      const formData = new FormData()
      formData.append('file', fileToUpload)
      formData.append('slot_id', slotId)

      const res = await fetch(`/api/portal/${token}/slot-upload`, {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()

      if (!res.ok || !result.success) {
        setSheetError(result.error || tr.error_upload_failed)
        onUploadError(result.error || 'Upload failed')
      } else {
        onUploadComplete({ versionNumber: result.version_number })
        // Sheet will be closed by parent
      }
    } catch {
      setSheetError(tr.error_generic)
      onUploadError('Network error')
    } finally {
      setIsUploading(false)
      setUploadProgress('')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85vh] rounded-t-xl sm:max-w-lg sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:rounded-xl sm:bottom-4 sm:border"
      >
        {/* Header */}
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <SheetTitle className="text-base truncate">{slotName}</SheetTitle>
              {isRequired && <Asterisk className="h-3 w-3 text-red-500 shrink-0" />}
            </div>
            {pages.length > 0 && (
              <Badge variant="outline" className="text-xs shrink-0">
                {pages.length} {pages.length !== 1 ? tr.upload_sheet_pages : tr.upload_sheet_page}
              </Badge>
            )}
          </div>
          {description && (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          )}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {/* Error message */}
          {sheetError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{sheetError}</p>
            </div>
          )}

          {/* Empty state */}
          {pages.length === 0 && !sheetError && (
            <div className="text-center py-6 space-y-1">
              <Upload className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">
                {tr.upload_sheet_scan_prompt}
              </p>
              {canCombineToPdf && (
                <p className="text-xs text-slate-400">
                  {tr.upload_sheet_combine_hint}
                </p>
              )}
            </div>
          )}

          {/* Thumbnail grid */}
          {pages.length > 0 && (
            <div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pages.map((page, idx) => (
                  <div
                    key={page.id}
                    className="relative aspect-[3/4] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden group"
                  >
                    {page.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.previewUrl}
                        alt={t(tr.upload_sheet_page_alt, { num: idx + 1 })}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full px-1">
                        <FileText className="h-8 w-8 text-blue-400" />
                        <span className="text-[10px] text-slate-500 mt-1 truncate max-w-full px-1">
                          {page.file.name}
                        </span>
                      </div>
                    )}

                    {/* Page number */}
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removePage(page.id)}
                      disabled={isUploading}
                      className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500 transition-colors"
                      aria-label={t(tr.upload_sheet_remove_page, { num: idx + 1 })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Running total */}
              <p className="text-xs text-slate-500 mt-2">
                {pages.length} {pages.length !== 1 ? tr.upload_sheet_pages : tr.upload_sheet_page} · {formatFileSize(totalSize)}
                {maxFileSizeBytes > 0 && (
                  <span className={cn('ml-1', totalSize > maxFileSizeBytes && 'text-red-500 font-medium')}>
                    / {t(tr.upload_sheet_max_size, { max: maxMB })}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {canAddMore && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start h-12 text-sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploading}
              >
                <Camera className="h-5 w-5 mr-3 text-blue-500" />
                {tr.upload_sheet_scan_camera}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full justify-start h-12 text-sm"
              onClick={() => filePickerInputRef.current?.click()}
              disabled={isUploading || hasDocumentFile}
            >
              <FolderOpen className="h-5 w-5 mr-3 text-amber-500" />
              {tr.upload_sheet_choose_files}
            </Button>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraCapture}
        />
        <input
          ref={filePickerInputRef}
          type="file"
          accept={fileAccept}
          multiple={canCombineToPdf && canAddMore}
          className="hidden"
          onChange={handleFilesPicked}
        />

        {/* Footer */}
        <SheetFooter>
          <Button
            onClick={handleUpload}
            disabled={pages.length === 0 || isUploading}
            className="w-full h-12 text-sm font-medium"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadProgress || tr.upload_sheet_uploading}
              </>
            ) : pages.length === 0 ? (
              tr.upload_sheet_add_pages
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {hasDocumentFile
                  ? (tr.upload_button ?? 'Upload')
                  : t(tr.upload_sheet_upload_pages, { count: pages.length })}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm text-slate-500"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading}
          >
            {tr.upload_sheet_cancel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
