'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

const PII_REVEAL_TIMEOUT_MS = 60_000 // 60 seconds

export type PiiFieldType = 'passport' | 'uci' | 'date' | 'generic'

export interface PiiRevealState {
  /** Whether the raw value is currently visible */
  isRevealed: boolean
  /** The reason selected when revealing */
  reason: string | null
  /** Request reveal  -  will prompt for reason via callback */
  reveal: (reason: string) => void
  /** Manually re-mask the field */
  mask: () => void
  /** Seconds remaining before auto-mask (null when masked) */
  secondsRemaining: number | null
}

/**
 * Hook to manage PII field reveal/mask state with 60-second auto-mask.
 *
 * When `reveal(reason)` is called, the field is unmasked for 60 seconds,
 * then automatically re-masked via local state (no page refresh).
 */
export function usePiiMask(): PiiRevealState {
  const [isRevealed, setIsRevealed] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const mask = useCallback(() => {
    cleanup()
    setIsRevealed(false)
    setReason(null)
    setSecondsRemaining(null)
  }, [cleanup])

  const reveal = useCallback(
    (revealReason: string) => {
      cleanup()
      setIsRevealed(true)
      setReason(revealReason)
      setSecondsRemaining(60)

      // Countdown every second
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev === null || prev <= 1) return null
          return prev - 1
        })
      }, 1000)

      // Auto-mask after 60 seconds
      timerRef.current = setTimeout(() => {
        mask()
      }, PII_REVEAL_TIMEOUT_MS)
    },
    [cleanup, mask],
  )

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return { isRevealed, reason, reveal, mask, secondsRemaining }
}

/**
 * Client-side masking function (mirrors the PostgreSQL fn_get_masked_pii).
 * Used to mask PII values before display without a round-trip to the DB.
 */
export function maskPiiValue(value: string | null | undefined, fieldType: PiiFieldType = 'generic'): string {
  if (!value || value === '') return ''

  switch (fieldType) {
    case 'passport':
      return value.length > 3
        ? '*'.repeat(value.length - 3) + value.slice(-3)
        : '*'.repeat(value.length)

    case 'uci':
      return value.length > 4
        ? '*'.repeat(value.length - 4) + value.slice(-4)
        : '*'.repeat(value.length)

    case 'date':
      // Date: 1990-05-15 → ****-**-15
      if (value.length >= 10) {
        return '****-**-' + value.slice(-2)
      }
      return '*'.repeat(value.length)

    default:
      return value.length > 4
        ? '*'.repeat(value.length - 4) + value.slice(-4)
        : '*'.repeat(value.length)
  }
}
