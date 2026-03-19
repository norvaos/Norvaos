'use client'

import { useMemo } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, ExternalLink, FileQuestion } from 'lucide-react'

interface DocumentViewerProps {
  storagePath: string
  fileName: string
  fileType: string | null
  storageBucket?: string
  /** External URL for documents stored outside Supabase (e.g. OneDrive). When
   *  provided and storagePath is empty, the viewer shows an "Open" button
   *  instead of the broken download fallback. */
  externalUrl?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Document viewer that streams files through the server-side API endpoint.
 * Uses /api/documents/view which bypasses storage RLS via admin client
 * and serves files from the same origin — no X-Frame-Options blocking.
 *
 * For externally-stored documents (OneDrive etc.) with no local storage_path,
 * pass externalUrl to show an "Open in browser" button instead of a dead fallback.
 */
export function DocumentViewer({
  storagePath,
  fileName,
  fileType,
  storageBucket,
  externalUrl,
  open,
  onOpenChange,
}: DocumentViewerProps) {
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType?.startsWith('image/')
  const canPreview = isPdf || isImage

  // Build server-side view URL (same-origin, no CORS/X-Frame-Options issues)
  const viewUrl = useMemo(() => {
    if (!storagePath) return null
    const params = new URLSearchParams({ path: storagePath })
    if (storageBucket) params.set('bucket', storageBucket)
    return `/api/documents/view?${params.toString()}`
  }, [storagePath, storageBucket])

  const isExternal = !viewUrl && !!externalUrl

  const handleDownload = () => {
    if (!viewUrl) return
    const a = document.createElement('a')
    a.href = viewUrl
    a.download = fileName
    a.click()
  }

  const handleOpenExternal = () => {
    if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{fileName}</DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {fileName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-slate-50">
          {viewUrl && isPdf ? (
            <iframe
              src={viewUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : viewUrl && isImage ? (
            <div className="flex items-center justify-center h-full p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isExternal ? (
            /* OneDrive / external storage — can't embed, offer open-in-browser */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <ExternalLink className="h-16 w-16 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">
                  This document is stored externally
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Click below to open it in a new tab
                </p>
              </div>
              <Button onClick={handleOpenExternal}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Browser
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <FileQuestion className="h-16 w-16 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">
                  {canPreview ? 'Unable to load preview' : 'Preview not available'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {canPreview
                    ? 'Try downloading the file instead'
                    : 'This file type cannot be previewed in the browser'}
                </p>
              </div>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download File
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
