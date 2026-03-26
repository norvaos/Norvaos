'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Activity Tracker Hook  -  detects meaningful interaction events.
 *
 * Sends heartbeat events every 60s when active.
 * Detects 10-minute idle gaps → logs idle_gap event with duration.
 * Reports 30-minute idle → triggers alert callback.
 *
 * "Meaningful" activity: click, keypress, scroll, focus.
 * NOT: mouse move (too noisy).
 */

interface UseActivityTrackerOptions {
  /** Whether tracking is enabled (e.g., only when on shift) */
  enabled: boolean
  /** Heartbeat interval in ms (default 60_000) */
  heartbeatInterval?: number
  /** Idle threshold in ms to log idle_gap event (default 10 * 60_000 = 10 min) */
  idleThresholdMs?: number
  /** Long idle threshold to trigger alert (default 30 * 60_000 = 30 min) */
  longIdleThresholdMs?: number
  /** Called to log a front desk event */
  onLogEvent: (eventType: string, eventData?: Record<string, unknown>) => void
  /** Called when idle exceeds longIdleThresholdMs */
  onLongIdle?: () => void
}

interface ActivityState {
  /** Minutes idle (since last meaningful activity) */
  idleMinutes: number
  /** Whether user is currently idle */
  isIdle: boolean
  /** Whether long idle threshold exceeded */
  isLongIdle: boolean
}

export function useActivityTracker(options: UseActivityTrackerOptions): ActivityState {
  const {
    enabled,
    heartbeatInterval = 60_000,
    idleThresholdMs = 10 * 60_000,
    longIdleThresholdMs = 30 * 60_000,
    onLogEvent,
    onLongIdle,
  } = options

  const lastActivityRef = useRef(Date.now())
  const idleLogged = useRef(false)
  const longIdleFired = useRef(false)
  const [state, setState] = useState<ActivityState>({
    idleMinutes: 0,
    isIdle: false,
    isLongIdle: false,
  })

  // Track meaningful events
  const markActive = useCallback(() => {
    const wasIdle = Date.now() - lastActivityRef.current > idleThresholdMs

    if (wasIdle && idleLogged.current) {
      // We were idle and now resuming  -  the idle_gap event was already logged
      idleLogged.current = false
      longIdleFired.current = false
    }

    lastActivityRef.current = Date.now()
    setState({ idleMinutes: 0, isIdle: false, isLongIdle: false })
  }, [idleThresholdMs])

  // Attach meaningful event listeners
  useEffect(() => {
    if (!enabled) return

    const events = ['click', 'keydown', 'scroll', 'focus'] as const
    for (const ev of events) {
      window.addEventListener(ev, markActive, { passive: true })
    }

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, markActive)
      }
    }
  }, [enabled, markActive])

  // Heartbeat + idle detection loop
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current
      const idleMin = Math.floor(elapsed / 60_000)

      // Send heartbeat
      onLogEvent('heartbeat', { idle_minutes: idleMin })

      // Check idle threshold
      if (elapsed >= idleThresholdMs && !idleLogged.current) {
        idleLogged.current = true
        onLogEvent('idle_gap', {
          duration_minutes: idleMin,
          started_idle_at: new Date(lastActivityRef.current).toISOString(),
        })
      }

      // Check long idle threshold
      if (elapsed >= longIdleThresholdMs && !longIdleFired.current) {
        longIdleFired.current = true
        onLongIdle?.()
      }

      setState({
        idleMinutes: idleMin,
        isIdle: elapsed >= idleThresholdMs,
        isLongIdle: elapsed >= longIdleThresholdMs,
      })
    }, heartbeatInterval)

    return () => clearInterval(interval)
  }, [enabled, heartbeatInterval, idleThresholdMs, longIdleThresholdMs, onLogEvent, onLongIdle])

  return state
}
