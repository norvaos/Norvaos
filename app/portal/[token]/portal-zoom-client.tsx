'use client'

import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'

const ZOOM_KEY = 'portal-zoom'
const ZOOM_MIN = 0.85
const ZOOM_MAX = 1.4
const ZOOM_STEP = 0.1
const ZOOM_DEFAULT = 1.05 // Slightly larger than standard for readability

export function PortalZoomWrapper({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const [mounted, setMounted] = useState(false)

  // Load saved zoom preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ZOOM_KEY)
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX) {
          setZoom(parsed)
        }
      }
    } catch {
      // ignore
    }
    setMounted(true)
  }, [])

  // Persist zoom preference
  useEffect(() => {
    if (!mounted) return
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // ignore
    }
  }, [zoom, mounted])

  // Apply zoom at the <html> element level so that Radix UI portals
  // (Select dropdowns, DatePicker popovers, etc.) which render into
  // document.body are also inside the zoomed context. Applying zoom
  // to a wrapper <div> can interfere with Radix portal positioning.
  useEffect(() => {
    if (!mounted) return
    document.documentElement.style.zoom = String(zoom)
    return () => {
      document.documentElement.style.zoom = ''
    }
  }, [zoom, mounted])

  // Add portal-force-light to <body> so Radix portals (rendered at body level)
  // also get light-mode styling — they'd otherwise inherit dark theme from <html>.
  useEffect(() => {
    document.body.classList.add('portal-force-light')
    return () => {
      document.body.classList.remove('portal-force-light')
    }
  }, [])

  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))
  const resetZoom = () => setZoom(ZOOM_DEFAULT)

  const pct = Math.round(zoom * 100)

  return (
    <>
      {children}

      {/* Floating zoom controls — bottom-right corner */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          className="min-w-[3rem] px-1 py-0.5 text-center text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
          title="Reset zoom"
        >
          {pct}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  )
}
