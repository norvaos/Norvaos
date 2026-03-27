'use client'

/**
 * useLivePreview  -  Debounced PDF Preview Hook
 *
 * Watches the form wizard store for changes and renders a live preview
 * via the Python sidecar. Uses a 600ms debounce to avoid spamming the
 * server while the clerk is actively typing.
 *
 * Returns base64 PNG images of the filled PDF, ready for <img> rendering.
 * Falls back gracefully on error with user-friendly status messages.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useFormWizardStore } from '@/lib/stores/form-wizard-store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreviewImage {
  page: number
  base64_png: string
  width: number
  height: number
}

export interface LivePreviewState {
  /** Current preview images (one per rendered page) */
  images: PreviewImage[]
  /** Total page count of the filled PDF */
  pageCount: number
  /** Whether a render is in flight */
  isSyncing: boolean
  /** Last render time in ms (for performance monitoring) */
  lastRenderMs: number | null
  /** User-facing error message, or null */
  error: string | null
  /** Force a re-render (e.g. after changing the active page) */
  refresh: () => void
}

// ── Debounce interval ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 600

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLivePreview(): LivePreviewState {
  const formData = useFormWizardStore((s) => s.formData)
  const activeFormId = useFormWizardStore((s) => s.activeFormId)
  const activeFormCode = useFormWizardStore((s) => s.activeFormCode)
  const activePreviewPage = useFormWizardStore((s) => s.activePreviewPage)

  const [images, setImages] = useState<PreviewImage[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Abort controller ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)
  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Sequence counter to discard stale responses
  const seqRef = useRef(0)

  const doRender = useCallback(async () => {
    if (!activeFormId || !activeFormCode) return
    if (Object.keys(formData).length === 0) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const seq = ++seqRef.current
    setIsSyncing(true)
    setError(null)

    try {
      const response = await fetch('/api/ircc/live-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: activeFormId,
          formCode: activeFormCode,
          profileData: formData,
          page: activePreviewPage,
          dpi: 100,
        }),
        signal: controller.signal,
      })

      // If a newer request has been fired, discard this response
      if (seq !== seqRef.current) return

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Unknown error' }))

        // Rate limit  -  not an error, just inform the user
        if (response.status === 429) {
          setError(null) // Don't show error  -  the preview will refresh shortly
          return
        }

        setError(body.error ?? `Preview failed (${response.status})`)
        return
      }

      const result = await response.json()

      // Discard if stale
      if (seq !== seqRef.current) return

      const validImages = (result.images ?? []).filter(
        (img: PreviewImage & { error?: string }) => img.base64_png && !img.error,
      )

      setImages(validImages)
      setPageCount(result.page_count ?? 0)
      setLastRenderMs(result.render_ms ?? null)
      setError(null)
    } catch (err) {
      // Ignore aborted requests (user typed again before render finished)
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (seq !== seqRef.current) return

      setError('Preview connection lost. Still saving locally.')
    } finally {
      if (seq === seqRef.current) {
        setIsSyncing(false)
      }
    }
  }, [activeFormId, activeFormCode, formData, activePreviewPage])

  // Debounced watcher: fires 600ms after last formData change
  useEffect(() => {
    if (!activeFormId || !activeFormCode) return
    if (Object.keys(formData).length === 0) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doRender, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [formData, activePreviewPage, doRender])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const refresh = useCallback(() => {
    doRender()
  }, [doRender])

  return {
    images,
    pageCount,
    isSyncing,
    lastRenderMs,
    error,
    refresh,
  }
}
