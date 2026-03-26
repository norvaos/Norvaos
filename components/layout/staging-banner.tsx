'use client'

import { getStagingBanner } from '@/lib/config/deployment'

/**
 * Sticky banner shown only on the Green (staging) slot.
 * Lets the Principal know they're reviewing unreleased features.
 */
export function StagingBanner() {
  const text = getStagingBanner()
  if (!text) return null

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-center gap-2 bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white">
      <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
      {text}
    </div>
  )
}
