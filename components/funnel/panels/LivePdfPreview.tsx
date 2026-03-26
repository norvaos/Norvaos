'use client'

import { useState, useEffect } from 'react'
import {
  useLivePdfPreview,
  usePrimaryFormId,
  useStreamForms,
} from '@/lib/queries/pdf-preview'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface LivePdfPreviewProps {
  matterId: string
  matterTypeId: string | null
  profileOverrides: Record<string, unknown>
}

// ── LivePdfPreview ──────────────────────────────────────────────────────────

export function LivePdfPreview({
  matterTypeId,
  profileOverrides,
}: LivePdfPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)

  // Fetch available forms + primary form for this matter type
  const { data: forms } = useStreamForms(matterTypeId)
  const { data: primaryFormId } = usePrimaryFormId(matterTypeId)

  // Default to primary form when it loads
  useEffect(() => {
    if (primaryFormId && !selectedFormId) {
      setSelectedFormId(primaryFormId)
    }
  }, [primaryFormId, selectedFormId])

  // Live preview query
  const {
    data: previewData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useLivePdfPreview(selectedFormId, profileOverrides, currentPage)

  const hasOverrides = Object.keys(profileOverrides).length > 0
  const pageCount = previewData?.page_count ?? 1
  const currentImage = previewData?.images?.[0]

  // Show a pulsing overlay while a new preview is generating but we
  // already have a stale image on screen (covers the debounce window).
  const isRefreshing = isFetching && !isLoading && !!currentImage

  // Reset to page 1 when form changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedFormId])

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: Form Selector ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
        <Select
          value={selectedFormId ?? ''}
          onValueChange={(val) => {
            setSelectedFormId(val)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select a form" />
          </SelectTrigger>
          <SelectContent>
            {forms?.map((form) => (
              <SelectItem key={form.formId} value={form.formId}>
                {form.formCode ? `${form.formCode}  -  ` : ''}
                {form.formName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Main Preview Area ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {/* No form selected */}
        {!selectedFormId && !isLoading && (
          <div className="text-muted-foreground text-center">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">
              Select a form to see a live preview
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="w-full space-y-3">
            <Skeleton className="mx-auto aspect-[8.5/11] w-full max-w-sm" />
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              <span className="text-muted-foreground text-xs">
                Generating preview...
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center">
            <p className="mb-2 text-sm text-red-600">
              {error instanceof Error
                ? error.message
                : 'Failed to generate preview'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Rendered image (with refreshing overlay during debounce window) */}
        {currentImage && !isLoading && !isError && (
          <div className="relative w-full">
            <img
              src={`data:image/png;base64,${currentImage.base64_png}`}
              alt={`PDF preview page ${currentPage}`}
              className="max-h-full w-full object-contain"
              style={{
                aspectRatio: `${currentImage.width} / ${currentImage.height}`,
              }}
            />
            {isRefreshing && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-md bg-background/90 px-3 py-1.5 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Generating preview…
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer: Page Navigation ───────────────────────────────────── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 border-t px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-muted-foreground text-xs">
            Page {currentPage} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() =>
              setCurrentPage((p) => Math.min(pageCount, p + 1))
            }
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
