'use client'

/**
 * SovereignSplitPreview  -  The Live Mirror
 *
 * 40/60 split-screen layout:
 *   Left  (40%): Form input panel (children slot)
 *   Right (60%): Live PDF preview rendered by the Python sidecar
 *
 * Features:
 *   - Debounced live preview via useLivePreview hook (600ms)
 *   - Page navigation for multi-page PDFs
 *   - Sync status indicator with last-saved timestamp
 *   - Emerald ghosting overlay during render
 *   - Graceful error handling with auto-retry
 *   - Responsive: collapses to stacked on narrow viewports
 *
 * Usage:
 *   <SovereignSplitPreview formCode="IMM5257E" title="Visitor Visa Application">
 *     <YourFormComponent />
 *   </SovereignSplitPreview>
 */

import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { useFormWizardStore } from '@/lib/stores/form-wizard-store'
import { useLivePreview } from '@/lib/hooks/use-live-preview'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Eye,
  FileText,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'

// ── Props ────────────────────────────────────────────────────────────────────

interface SovereignSplitPreviewProps {
  /** Human-readable form title for the header */
  title: string
  /** IRCC form code (e.g. 'IMM5257E') */
  formCode: string
  /** Form input panel content */
  children: ReactNode
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function SovereignSplitPreview({
  title,
  formCode,
  children,
  className,
}: SovereignSplitPreviewProps) {
  const lastSavedAt = useFormWizardStore((s) => s.lastSavedAt)
  const formData = useFormWizardStore((s) => s.formData)
  const fieldMeta = useFormWizardStore((s) => s.fieldMeta)
  const setPreviewPage = useFormWizardStore((s) => s.setPreviewPage)
  const activePreviewPage = useFormWizardStore((s) => s.activePreviewPage)

  const {
    images,
    pageCount,
    isSyncing,
    lastRenderMs,
    error,
    refresh,
  } = useLivePreview()

  const [previewCollapsed, setPreviewCollapsed] = useState(false)

  // Compute field stats for the status bar
  const fieldCount = Object.keys(formData).length
  const verifiedCount = Object.values(fieldMeta).filter((m) => m.freshness === 'verified').length
  const staleCount = Object.values(fieldMeta).filter((m) => m.freshness === 'stale').length

  const currentImage = images[0] // Live preview renders one page at a time

  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', className)}>

      {/* ── LEFT PANEL: Form Input (40% / 100% when preview collapsed) ───── */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border transition-all duration-200',
          previewCollapsed ? 'w-full' : 'w-[40%] min-w-[360px]',
        )}
      >
        {/* Input Header */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            <span className="text-[10px] font-mono text-muted-foreground">{formCode}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Field stats */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {fieldCount > 0 && (
                <>
                  <span>{fieldCount} fields</span>
                  {verifiedCount > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-600">
                      <ShieldCheck className="size-3" />{verifiedCount}
                    </span>
                  )}
                  {staleCount > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-600">
                      <ShieldAlert className="size-3" />{staleCount}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Auto-save indicator */}
            {lastSavedAt && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-3" />
                      <span>{new Date(lastSavedAt).toLocaleTimeString()}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Auto-saved to browser. Data persists across refreshes and tab closures.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Toggle preview panel */}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setPreviewCollapsed((v) => !v)}
                  >
                    {previewCollapsed ? (
                      <PanelLeftOpen className="size-3.5" />
                    ) : (
                      <PanelLeftClose className="size-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {previewCollapsed ? 'Show live preview' : 'Hide preview for more space'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Form content (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      {/* ── RIGHT PANEL: Live PDF Mirror (60%) ──────────────────────────── */}
      {!previewCollapsed && (
        <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-muted/10">

          {/* Preview Header */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-emerald-600" />
              <span className="text-sm font-semibold">Live IRCC Mirror</span>
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 animate-pulse">
                  <Loader2 className="size-3 animate-spin" />
                  Rendering...
                </span>
              )}
              {lastRenderMs !== null && !isSyncing && (
                <span className="text-[10px] text-muted-foreground">
                  {lastRenderMs}ms
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Page navigation */}
              {pageCount > 1 && (
                <div className="flex items-center gap-1 mr-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={activePreviewPage <= 0}
                    onClick={() => setPreviewPage(Math.max(0, activePreviewPage - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums min-w-[3ch] text-center">
                    {activePreviewPage + 1}/{pageCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={activePreviewPage >= pageCount - 1}
                    onClick={() => setPreviewPage(Math.min(pageCount - 1, activePreviewPage + 1))}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}

              {/* Manual refresh */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={refresh}
                      disabled={isSyncing}
                    >
                      <RefreshCw className={cn('size-3.5', isSyncing && 'animate-spin')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Force re-render preview</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Preview Canvas */}
          <div className="flex-1 overflow-auto flex justify-center items-start p-6">
            {currentImage ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${currentImage.base64_png}`}
                  alt={`${formCode} page ${activePreviewPage + 1} preview`}
                  width={currentImage.width}
                  height={currentImage.height}
                  className={cn(
                    'max-w-full rounded-sm border border-border shadow-lg transition-opacity duration-300',
                    'select-none pointer-events-none',
                    isSyncing && 'opacity-60',
                  )}
                  style={{
                    // Scale down large renders to fit viewport while staying crisp
                    maxHeight: 'calc(100vh - 12rem)',
                    objectFit: 'contain',
                  }}
                />
                {/* Sync overlay */}
                {isSyncing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/5 rounded-sm backdrop-blur-[0.5px] transition-opacity">
                    <Loader2 className="size-8 text-emerald-500/40 animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="size-16 opacity-20 mb-4" />
                <p className="text-sm">Start typing to see the live preview</p>
                <p className="text-xs mt-1 opacity-60">
                  The {formCode} form will appear here as you fill in the fields
                </p>
              </div>
            )}
          </div>

          {/* Error bar */}
          {error && (
            <div className="border-t bg-destructive/5 px-4 py-2 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              <span className="truncate">{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0 h-6 text-[10px]"
                onClick={refresh}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
