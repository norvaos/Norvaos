'use client'

import { useEffect } from 'react'
import { useDocumentSignedUrl, useDownloadDocument } from '@/lib/queries/documents'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Download, FileQuestion } from 'lucide-react'

interface DocumentViewerProps {
  storagePath: string
  fileName: string
  fileType: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentViewer({
  storagePath,
  fileName,
  fileType,
  open,
  onOpenChange,
}: DocumentViewerProps) {
  const signedUrlMutation = useDocumentSignedUrl()
  const downloadMutation = useDownloadDocument()

  useEffect(() => {
    if (open && storagePath) {
      signedUrlMutation.mutate(storagePath)
    }
    // Reset when closed
    if (!open) {
      signedUrlMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storagePath])

  const signedUrl = signedUrlMutation.data
  const isLoading = signedUrlMutation.isPending
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType?.startsWith('image/')

  const handleDownload = async () => {
    const blob = await downloadMutation.mutateAsync(storagePath)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
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
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : signedUrl && isPdf ? (
            <iframe
              src={signedUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : signedUrl && isImage ? (
            <div className="flex items-center justify-center h-full p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <FileQuestion className="h-16 w-16 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Preview not available</p>
                <p className="text-xs text-slate-400 mt-1">
                  This file type cannot be previewed in the browser
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={downloadMutation.isPending}
              >
                {downloadMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download File
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
