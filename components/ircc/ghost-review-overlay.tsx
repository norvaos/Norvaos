'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Ghost Review Overlay  -  Launch Control Airlock (Target 17)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A full-screen split-screen overlay that appears AFTER "Generate" is clicked
 * but BEFORE the final PDF is saved/submitted. The Principal does one last
 * 60-second visual "sanity check."
 *
 * Layout:
 *   ┌─────────────────────┬─────────────────────┐
 *   │  ORIGINAL SOURCE    │  GENERATED FORM      │
 *   │  (scanned passport, │  (filled IMM 5257    │
 *   │   uploaded docs)    │   fields, preview)   │
 *   ├─────────────────────┴─────────────────────┤
 *   │  [Reject & Return]        [Approve & Save] │
 *   └───────────────────────────────────────────┘
 *
 * Left panel:  Original client uploads (passport scan, photo, supporting docs)
 * Right panel: Generated IRCC form preview (PNG pages from live-preview API)
 *
 * The overlay uses a 60-second countdown timer. The "Approve" button is
 * disabled for the first 5 seconds (forced review minimum).
 *
 * Designed to be triggered from:
 *   - The "Generate Final Package" flow in generation-service.ts
 *   - The SignatureGateLock component after unlocking
 *   - The IRCC Workspace toolbar "Approve & Generate" button
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  ShieldX,
  Clock,
  FileText,
  Eye,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GhostReviewSource {
  /** Display label (e.g. "Passport Scan", "Client Photo") */
  label: string
  /** Source type */
  type: 'image' | 'pdf_page'
  /** Base64 data URI or URL */
  src: string
  /** Category hint for display */
  category?: 'identity' | 'photo' | 'evidence' | 'form'
}

export interface GhostReviewFormPage {
  /** Page number (1-indexed) */
  page: number
  /** Base64 PNG data URI from the live-preview API */
  src: string
  /** Form code (e.g. "IMM5257") */
  formCode: string
}

export interface GhostReviewField {
  /** Field label */
  label: string
  /** Value as it appears in the generated form */
  value: string
  /** Whether this field was auto-filled from Heritage data */
  fromHeritage?: boolean
  /** Whether this field was from an OCR scan */
  fromScan?: boolean
  /** Profile path for scroll-to-field navigation */
  profilePath?: string
}

interface GhostReviewOverlayProps {
  /** Whether the overlay is visible */
  open: boolean
  /** Close the overlay (reject) */
  onClose: () => void
  /** Approve and proceed with generation */
  onApprove: () => void
  /** Original source documents (left panel) */
  sources: GhostReviewSource[]
  /** Generated form pages (right panel) */
  formPages: GhostReviewFormPage[]
  /** Key fields to highlight for review (optional detail panel) */
  keyFields?: GhostReviewField[]
  /** Applicant name */
  applicantName: string
  /** Form code being generated */
  formCode: string
  /** Whether the approval is in progress */
  approving?: boolean
  /** Minimum review time in seconds before Approve becomes active */
  minReviewSeconds?: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_REVIEW_SECONDS = 10
const REVIEW_TIMER_SECONDS = 60

// ── Component ────────────────────────────────────────────────────────────────

export function GhostReviewOverlay({
  open,
  onClose,
  onApprove,
  sources,
  formPages,
  keyFields,
  applicantName,
  formCode,
  approving,
  minReviewSeconds = DEFAULT_MIN_REVIEW_SECONDS,
}: GhostReviewOverlayProps) {
  // Timer state
  const [elapsed, setElapsed] = useState(0)
  const [canApprove, setCanApprove] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Navigation state
  const [sourceIndex, setSourceIndex] = useState(0)
  const [formPageIndex, setFormPageIndex] = useState(0)
  const [sourceZoom, setSourceZoom] = useState(1)
  const [formZoom, setFormZoom] = useState(1)
  const [showFields, setShowFields] = useState(false)

  // Reset state when overlay opens
  useEffect(() => {
    if (open) {
      setElapsed(0)
      setCanApprove(false)
      setSourceIndex(0)
      setFormPageIndex(0)
      setSourceZoom(1)
      setFormZoom(1)
      setShowFields(false)

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1
          if (next >= minReviewSeconds) {
            setCanApprove(true)
          }
          return next
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open, minReviewSeconds])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) {
          setSourceIndex((i) => Math.max(0, i - 1))
        } else {
          setFormPageIndex((i) => Math.max(0, i - 1))
        }
      } else if (e.key === 'ArrowRight') {
        if (e.shiftKey) {
          setSourceIndex((i) => Math.min(sources.length - 1, i + 1))
        } else {
          setFormPageIndex((i) => Math.min(formPages.length - 1, i + 1))
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, sources.length, formPages.length, onClose])

  const handleApprove = useCallback(() => {
    if (!canApprove || approving) return
    onApprove()
  }, [canApprove, approving, onApprove])

  if (!open) return null

  const currentSource = sources[sourceIndex]
  const currentFormPage = formPages[formPageIndex]
  const timerRemaining = Math.max(0, REVIEW_TIMER_SECONDS - elapsed)
  const lockRemaining = Math.max(0, minReviewSeconds - elapsed)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm">
      {/* ── Header Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <Eye className="size-5 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-white">
              Ghost Review  -  Launch Control Airlock
            </h2>
            <p className="text-[10px] text-white/50">
              {applicantName} · {formCode} · Visual sanity check before submission
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Timer */}
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className={cn(
              'size-3.5',
              timerRemaining < 10 ? 'text-red-400' : 'text-white/50',
            )} />
            <span className={cn(
              'font-mono tabular-nums',
              timerRemaining < 10 ? 'text-red-400' : 'text-white/70',
            )}>
              {Math.floor(timerRemaining / 60)}:{(timerRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>

          {/* Review minimum lock indicator */}
          {lockRemaining > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Review lock: {lockRemaining}s
            </span>
          )}

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-white/60 hover:text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Split Panel ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Original Source Documents */}
        <div className="flex w-1/2 flex-col border-r border-white/10">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              Original Source
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                onClick={() => setSourceZoom((z) => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="size-3" />
              </Button>
              <span className="text-[9px] font-mono text-white/40 w-8 text-center">
                {Math.round(sourceZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                onClick={() => setSourceZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="size-3" />
              </Button>
            </div>
          </div>

          {/* Source image */}
          <div className="flex-1 overflow-auto flex items-center justify-center bg-black/50 p-4">
            {currentSource ? (
              <img
                src={currentSource.src}
                alt={currentSource.label}
                className="max-w-full max-h-full object-contain transition-transform"
                style={{ transform: `scale(${sourceZoom})` }}
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/30">
                <FileText className="size-8" />
                <span className="text-xs">No source documents</span>
              </div>
            )}
          </div>

          {/* Source navigation */}
          {sources.length > 1 && (
            <div className="flex items-center justify-between border-t border-white/5 bg-white/5 px-3 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                disabled={sourceIndex === 0}
                onClick={() => setSourceIndex((i) => i - 1)}
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="text-[10px] text-white/50">
                {currentSource?.label ?? ''} ({sourceIndex + 1}/{sources.length})
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                disabled={sourceIndex === sources.length - 1}
                onClick={() => setSourceIndex((i) => i + 1)}
              >
                <ChevronRight className="size-3" />
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT: Generated Form Preview */}
        <div className="flex w-1/2 flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              Generated Form
            </span>
            <div className="flex items-center gap-1">
              {keyFields && keyFields.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-5 text-[9px] text-white/40 hover:text-white',
                    showFields && 'bg-white/10 text-white/70',
                  )}
                  onClick={() => setShowFields((v) => !v)}
                >
                  Key Fields
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                onClick={() => setFormZoom((z) => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="size-3" />
              </Button>
              <span className="text-[9px] font-mono text-white/40 w-8 text-center">
                {Math.round(formZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                onClick={() => setFormZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="size-3" />
              </Button>
            </div>
          </div>

          {/* Form preview + optional key fields sidebar */}
          <div className="flex flex-1 overflow-hidden">
            {/* Form page */}
            <div className={cn(
              'overflow-auto flex items-center justify-center bg-black/50 p-4',
              showFields ? 'w-3/5 shrink-0' : 'flex-1',
            )}>
              {currentFormPage ? (
                <img
                  src={currentFormPage.src}
                  alt={`${currentFormPage.formCode} page ${currentFormPage.page}`}
                  className="max-w-full max-h-full object-contain transition-transform"
                  style={{ transform: `scale(${formZoom})` }}
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/30">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="text-xs">Generating preview...</span>
                </div>
              )}
            </div>

            {/* Key fields panel */}
            {showFields && keyFields && keyFields.length > 0 && (
              <div className="w-2/5 shrink-0 overflow-y-auto border-l border-white/5 bg-white/5 p-3 space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-white/40 mb-2">
                  Critical Fields
                </p>
                {keyFields.map((field, i) => (
                  <div
                    key={`${field.label}-${i}`}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[10px]',
                      field.fromHeritage && 'bg-emerald-500/10 border border-emerald-500/20',
                      field.fromScan && 'bg-blue-500/10 border border-blue-500/20',
                      !field.fromHeritage && !field.fromScan && 'bg-white/5',
                    )}
                  >
                    <span className="text-white/50">{field.label}</span>
                    <p className="font-mono text-white/90 mt-0.5">{field.value || '—'}</p>
                    {field.fromHeritage && (
                      <span className="text-[8px] text-emerald-400">Heritage Data</span>
                    )}
                    {field.fromScan && (
                      <span className="text-[8px] text-blue-400">OCR Scanned</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form page navigation */}
          {formPages.length > 1 && (
            <div className="flex items-center justify-between border-t border-white/5 bg-white/5 px-3 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                disabled={formPageIndex === 0}
                onClick={() => setFormPageIndex((i) => i - 1)}
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="text-[10px] text-white/50">
                {currentFormPage?.formCode} · Page {formPageIndex + 1} of {formPages.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-white/40 hover:text-white"
                disabled={formPageIndex === formPages.length - 1}
                onClick={() => setFormPageIndex((i) => i + 1)}
              >
                <ChevronRight className="size-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: Action Buttons ──────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/10 bg-black/80 px-6 py-3">
        {/* Left: Reject */}
        <Button
          variant="outline"
          className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          onClick={onClose}
        >
          <ShieldX className="size-4" />
          Reject & Return to Editor
        </Button>

        {/* Center: Stats */}
        <div className="flex items-center gap-4 text-[10px] text-white/40">
          <span>{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{formPages.length} form page{formPages.length !== 1 ? 's' : ''}</span>
          {keyFields && (
            <>
              <span>·</span>
              <span>{keyFields.length} key field{keyFields.length !== 1 ? 's' : ''}</span>
            </>
          )}
          <span>·</span>
          <span>Reviewed {elapsed}s</span>
        </div>

        {/* Right: Approve */}
        <Button
          className={cn(
            'gap-2',
            canApprove && !approving
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-white/10 text-white/30 cursor-not-allowed',
          )}
          disabled={!canApprove || approving}
          onClick={handleApprove}
        >
          {approving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {approving
            ? 'Generating...'
            : canApprove
              ? 'Approve & Save Final Package'
              : `Review (${lockRemaining}s)...`
          }
        </Button>
      </div>
    </div>
  )
}

// ── Hook: useGhostReview ─────────────────────────────────────────────────────

/**
 * Hook to manage Ghost Review state in the IRCC Workspace.
 *
 * Usage:
 *   const ghostReview = useGhostReview()
 *
 *   // When generate button is clicked:
 *   ghostReview.open(sources, formPages, keyFields)
 *
 *   // In JSX:
 *   <GhostReviewOverlay
 *     open={ghostReview.isOpen}
 *     onClose={ghostReview.close}
 *     onApprove={ghostReview.approve}
 *     sources={ghostReview.sources}
 *     formPages={ghostReview.formPages}
 *     keyFields={ghostReview.keyFields}
 *     ...
 *   />
 */
export function useGhostReview(onApproved?: () => void | Promise<void>) {
  const [isOpen, setIsOpen] = useState(false)
  const [sources, setSources] = useState<GhostReviewSource[]>([])
  const [formPages, setFormPages] = useState<GhostReviewFormPage[]>([])
  const [keyFields, setKeyFields] = useState<GhostReviewField[]>([])
  const [approving, setApproving] = useState(false)

  const open = useCallback((
    newSources: GhostReviewSource[],
    newFormPages: GhostReviewFormPage[],
    newKeyFields?: GhostReviewField[],
  ) => {
    setSources(newSources)
    setFormPages(newFormPages)
    setKeyFields(newKeyFields ?? [])
    setApproving(false)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setApproving(false)
  }, [])

  const approve = useCallback(async () => {
    setApproving(true)
    try {
      await onApproved?.()
      setIsOpen(false)
    } catch (err) {
      console.error('[ghost-review] Approval failed:', err)
    } finally {
      setApproving(false)
    }
  }, [onApproved])

  return { isOpen, sources, formPages, keyFields, approving, open, close, approve }
}
