'use client'

/**
 * Portal Analytics  -  Client-side event emitter for portal usage tracking.
 *
 * Non-blocking, fire-and-forget. Buffers events in memory, flushes every 10s.
 * Uses navigator.sendBeacon on page unload for reliable delivery.
 */

import type { PortalEventType } from '@/lib/types/portal'

// ── State ────────────────────────────────────────────────────────────────────

let _token: string | null = null
let _buffer: Array<{ event_type: PortalEventType; event_data: Record<string, unknown> }> = []
let _flushTimer: ReturnType<typeof setInterval> | null = null
let _initialized = false

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the analytics emitter. Call once on portal page mount.
 * Automatically records `portal_opened` and `device_context` events.
 */
export function initPortalAnalytics(token: string): void {
  if (_initialized) return
  _initialized = true
  _token = token

  // Record session start
  track('portal_opened', { session_start: new Date().toISOString() })

  // Record device context
  track('device_context', {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    is_mobile: window.innerWidth < 768,
    user_agent_class: getUserAgentClass(),
  })

  // Auto-flush every 10 seconds
  _flushTimer = setInterval(flush, 10_000)

  // Flush on page unload via sendBeacon
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush(true)
      }
    })
    window.addEventListener('pagehide', () => flush(true))
  }
}

/**
 * Track a portal event. Non-blocking, never throws.
 */
export function track(
  eventType: PortalEventType,
  eventData?: Record<string, unknown>,
): void {
  try {
    _buffer.push({
      event_type: eventType,
      event_data: eventData ?? {},
    })
  } catch {
    // Never throw  -  analytics must not break the portal
  }
}

/**
 * Cleanup  -  call on unmount if needed.
 */
export function destroyPortalAnalytics(): void {
  if (_flushTimer) {
    clearInterval(_flushTimer)
    _flushTimer = null
  }
  flush(true)
  _initialized = false
  _token = null
}

// ── Internal ─────────────────────────────────────────────────────────────────

function flush(useSendBeacon = false): void {
  if (!_token || _buffer.length === 0) return

  const events = _buffer.splice(0, 20) // Max 20 per batch
  const url = `/api/portal/${_token}/events`
  const body = JSON.stringify({ events })

  try {
    if (useSendBeacon && typeof navigator?.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Never throw
  }

  // If there are remaining events (buffer had >20), schedule another flush
  if (_buffer.length > 0) {
    setTimeout(() => flush(useSendBeacon), 100)
  }
}

function getUserAgentClass(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android')) return 'mobile'
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  return 'desktop'
}
