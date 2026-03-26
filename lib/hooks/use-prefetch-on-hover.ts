'use client'

import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Returns an onMouseEnter handler that fires a prefetch callback
 * after a short debounce (default 80ms) to avoid excessive fetches
 * when the user quickly scans through a list.
 */
export function usePrefetchOnHover(
  prefetchFn: (queryClient: ReturnType<typeof useQueryClient>) => void,
  delay = 80
) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      prefetchFn(queryClient)
    }, delay)
  }, [prefetchFn, queryClient, delay])

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { onMouseEnter, onMouseLeave }
}
