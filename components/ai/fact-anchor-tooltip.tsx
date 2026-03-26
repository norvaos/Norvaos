'use client'

/**
 * FactAnchorTooltip  -  Directive 8.1: Ghost-Writer Fact-Check
 *
 * Wraps AI-drafted text and highlights sentences that have source attributions.
 * On hover, shows a pop-up with the source quote from Norva Ear sessions.
 *
 * Zero-dependency: uses native CSS tooltips (no heavy libraries, 0ms TBT).
 */

import { useMemo, useState, useRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceAttribution {
  /** The sentence in the draft that references source data */
  sentence: string
  /** The data field being referenced */
  field: string
  /** Source system (e.g., 'Norva Ear Session 03', 'Contact Profile') */
  source: string
  /** Optional: direct client quote from Norva Ear */
  sourceQuote?: string
  /** Optional: session title for Norva Ear references */
  sessionTitle?: string
}

interface FactAnchorTooltipProps {
  /** The full AI-drafted content (plain text or HTML) */
  content: string
  /** Source attributions from the AI response */
  attributions: SourceAttribution[]
  /** Additional class names */
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function FactAnchorTooltip({ content, attributions, className }: FactAnchorTooltipProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Build a map of sentence → attribution for quick lookup
  const attributionMap = useMemo(() => {
    const map = new Map<string, SourceAttribution>()
    for (const attr of attributions) {
      // Normalise: trim and lowercase for matching
      const key = attr.sentence.trim().toLowerCase()
      map.set(key, attr)
    }
    return map
  }, [attributions])

  // Split content into sentences and mark which ones have attributions
  const segments = useMemo(() => {
    if (attributions.length === 0) {
      return [{ text: content, attribution: null, index: 0 }]
    }

    // Split by sentence boundaries
    const sentences = content.split(/(?<=[.!?])\s+/)
    return sentences.map((sentence, index) => {
      const key = sentence.trim().toLowerCase()
      // Check for exact match or partial match
      let match: SourceAttribution | null = null
      for (const [attrKey, attr] of attributionMap) {
        if (key.includes(attrKey) || attrKey.includes(key)) {
          match = attr
          break
        }
      }
      return { text: sentence, attribution: match, index }
    })
  }, [content, attributions, attributionMap])

  const hasAnchors = segments.some(s => s.attribution !== null)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Attribution legend */}
      {hasAnchors && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dashed border-primary/20">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Source-Verified
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {attributions.length} fact anchor{attributions.length !== 1 ? 's' : ''} linked
          </span>
        </div>
      )}

      {/* Rendered content with inline tooltips */}
      <div className="text-sm leading-relaxed">
        {segments.map((segment) => {
          if (!segment.attribution) {
            return <span key={segment.index}>{segment.text} </span>
          }

          const attr = segment.attribution
          const isActive = activeIdx === segment.index
          const isEarSource = attr.sourceQuote || attr.sessionTitle

          return (
            <span key={segment.index} className="relative inline">
              <span
                className={cn(
                  'cursor-help border-b-2 border-dotted border-primary/40 transition-all duration-200',
                  'hover:border-primary hover:bg-primary/5 rounded-sm px-0.5 -mx-0.5',
                  isActive && 'border-primary bg-primary/10'
                )}
                onMouseEnter={() => setActiveIdx(segment.index)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                {segment.text}

                {/* Fact anchor indicator dot */}
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 ml-0.5 align-super" />
              </span>

              {/* Tooltip pop-up */}
              {isActive && (
                <span
                  className={cn(
                    'absolute z-50 bottom-full left-0 mb-2 w-72',
                    'bg-card border border-border rounded-lg shadow-lg p-3',
                    'animate-in fade-in-0 zoom-in-95 duration-150'
                  )}
                >
                  {/* Header */}
                  <span className="flex items-center gap-1.5 mb-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                      <path d="M7 1L9 5L13 5.5L10 8.5L10.8 12.5L7 10.5L3.2 12.5L4 8.5L1 5.5L5 5Z"
                        fill="currentColor" className="text-amber-500" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Fact Anchor
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {attr.field}
                    </span>
                  </span>

                  {/* Source quote (Norva Ear) */}
                  {isEarSource && (
                    <span className="block mb-2 p-2 bg-primary/5 rounded border-l-2 border-primary">
                      <span className="block text-[10px] text-muted-foreground mb-0.5">
                        Client&apos;s own words:
                      </span>
                      <span className="block text-xs italic text-foreground leading-snug">
                        &ldquo;{attr.sourceQuote}&rdquo;
                      </span>
                    </span>
                  )}

                  {/* Source info */}
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
                      <path d="M5 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                    {attr.sessionTitle
                      ? `Derived from Norva Ear: "${attr.sessionTitle}"`
                      : `Source: ${attr.source}`
                    }
                  </span>
                </span>
              )}

              <span> </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Helper: Parse attributions from AI draft response ────────────────────────

/**
 * Converts the AI draft response's contextSources and sourceAttributions
 * into the FactAnchorTooltip-compatible format.
 */
export function buildFactAnchors(
  sourceAttributions: Array<{ sentence: string; field: string; source: string }>,
  contextSources?: Array<{ field: string; value: string | null; source: string; table: string; column: string }>
): SourceAttribution[] {
  return sourceAttributions.map(attr => {
    // Try to find a matching Norva Ear source for richer tooltip
    const earSource = contextSources?.find(
      cs => cs.table === 'norva_ear_sessions' && cs.field.replace('ear.', '') === attr.field
    )

    return {
      sentence: attr.sentence,
      field: attr.field,
      source: attr.source,
      sourceQuote: earSource?.value ?? undefined,
      sessionTitle: earSource ? 'Consultation Session' : undefined,
    }
  })
}
