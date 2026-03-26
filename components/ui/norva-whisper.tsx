'use client'

/**
 * NorvaWhisper  -  Branded contextual tooltip ("Norva Whispers").
 *
 * Unlike the generic HelperTip (ⓘ icon → plain text), NorvaWhisper shows
 * a branded tooltip with a tiny Norva logo, an intent headline, and a
 * descriptive body. The goal is "Zero-Training UX": every complex action
 * explains itself on hover.
 *
 * Two usage patterns:
 *   1. Dictionary-driven (contentKey): pulls from NORVA_WHISPERS dict
 *   2. Inline (title + children): for one-off dynamic content
 *
 * Performance: zero external libs, Radix Tooltip (already loaded), SVG inline.
 * 0ms TBT guaranteed  -  no lazy imports or heavy renders.
 */

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { NORVA_WHISPERS, type NorvaWhisperKey } from '@/lib/config/norva-whispers'
import { cn } from '@/lib/utils'

// ── Tiny inline Norva "N" mark (no SVG import overhead) ─────────────────────

function NorvaInlineMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 32 32"
      fill="none"
      className="inline-block flex-none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7.5" fill="#4f46e5" />
      <rect x="6.5" y="7" width="3.5" height="18" rx="1" fill="white" />
      <polygon points="10,7 13.5,7 22,25 18.5,25" fill="white" />
      <rect x="22" y="7" width="3.5" height="18" rx="1" fill="white" />
    </svg>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface NorvaWhisperDictProps {
  /** Key into the NORVA_WHISPERS dictionary */
  contentKey: NorvaWhisperKey
  children?: never
  title?: never
}

interface NorvaWhisperInlineProps {
  /** Inline headline */
  title: string
  /** Inline body text */
  children: React.ReactNode
  contentKey?: never
}

type NorvaWhisperProps = (NorvaWhisperDictProps | NorvaWhisperInlineProps) & {
  /** Additional CSS classes for the trigger icon */
  className?: string
  /** Which side the tooltip appears on */
  side?: 'top' | 'bottom' | 'left' | 'right'
}

// ── Component ───────────────────────────────────────────────────────────────

export function NorvaWhisper({ className, side = 'top', ...props }: NorvaWhisperProps) {
  let headline: string
  let body: React.ReactNode

  if ('contentKey' in props && props.contentKey) {
    const entry = NORVA_WHISPERS[props.contentKey]
    if (!entry) return null
    headline = entry.title
    body = entry.body
  } else {
    headline = (props as NorvaWhisperInlineProps).title
    body = (props as NorvaWhisperInlineProps).children
  }

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'ml-1 inline-flex cursor-help opacity-40 transition-opacity hover:opacity-100',
            className,
          )}
          aria-label="Norva Whisper"
        >
          <NorvaInlineMark />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-[320px] p-0 overflow-hidden"
      >
        {/* Branded header bar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white">
          <NorvaInlineMark />
          <span className="text-[11px] font-semibold leading-tight">{headline}</span>
        </div>
        {/* Body */}
        <div className="px-3 py-2 text-xs leading-relaxed">
          {body}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
