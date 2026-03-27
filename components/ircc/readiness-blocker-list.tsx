'use client'

/**
 * ReadinessBlockerList  -  Clickable Error Navigation
 *
 * Renders all blockers from the Readiness Matrix as a scrollable list.
 * Each blocker is clickable:
 *   - 'question' type: dispatches a scroll-to-field event targeting the
 *     profile_path in the form wizard, and briefly highlights the input.
 *   - 'document' type: opens the document slot panel.
 *
 * Designed for the Auditor Sidebar in the IRCC Workspace and the
 * Readiness panel in the SovereignSplitPreview.
 *
 * Uses a custom event system (norva:scroll-to-field) so it works across
 * any component tree without prop drilling.
 */

import { useCallback } from 'react'
import type { BlockerDetail, ReadinessMatrix, DomainReadiness } from '@/lib/services/readiness-matrix-engine'
import { DOMAIN_LABELS } from '@/lib/services/readiness-matrix-engine'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  XCircle,
  FileText,
  HelpCircle,
  ChevronRight,
  Target,
} from 'lucide-react'

// ── Custom Event Type ────────────────────────────────────────────────────────

/**
 * Custom DOM event dispatched when a blocker is clicked.
 * Form input components listen for this event and scroll + highlight.
 *
 * Usage in form inputs:
 *
 *   useEffect(() => {
 *     const handler = (e: CustomEvent<ScrollToFieldDetail>) => {
 *       if (e.detail.profilePath === myProfilePath) {
 *         myInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
 *         myInputRef.current?.focus()
 *         myInputRef.current?.classList.add('ring-2', 'ring-red-500')
 *         setTimeout(() => myInputRef.current?.classList.remove('ring-2', 'ring-red-500'), 2000)
 *       }
 *     }
 *     window.addEventListener('norva:scroll-to-field', handler as EventListener)
 *     return () => window.removeEventListener('norva:scroll-to-field', handler as EventListener)
 *   }, [myProfilePath])
 */
export interface ScrollToFieldDetail {
  profilePath: string
  blockerType: 'question' | 'document'
  domain?: string
}

/** Dispatch the scroll-to-field event */
export function dispatchScrollToField(detail: ScrollToFieldDetail) {
  window.dispatchEvent(
    new CustomEvent('norva:scroll-to-field', { detail }),
  )
}

// ── Hook: useScrollToFieldListener ──────────────────────────────────────────

import { useEffect, useRef } from 'react'

/**
 * Hook for form field inputs to listen for scroll-to-field events.
 * Returns a ref to attach to the input element.
 *
 * Usage:
 *   const inputRef = useScrollToFieldListener('personal.first_name')
 *   <input ref={inputRef} ... />
 */
export function useScrollToFieldListener(profilePath: string) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ScrollToFieldDetail>).detail
      if (detail.profilePath !== profilePath) return

      const el = ref.current
      if (!el) return

      // Scroll into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Focus the element (works for inputs, textareas, selects)
      if ('focus' in el && typeof el.focus === 'function') {
        el.focus()
      }

      // Flash highlight
      el.classList.add('ring-2', 'ring-red-500', 'ring-offset-1')
      const timer = setTimeout(() => {
        el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-1')
      }, 2500)

      return () => clearTimeout(timer)
    }

    window.addEventListener('norva:scroll-to-field', handler)
    return () => window.removeEventListener('norva:scroll-to-field', handler)
  }, [profilePath])

  return ref
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ReadinessBlockerListProps {
  /** Full readiness matrix (from useImmigrationReadiness or computeReadinessMatrix) */
  matrix: ReadinessMatrix | null
  /** Show only blockers that block filing (default: show all) */
  filingOnly?: boolean
  /** Show only blockers that block drafting */
  draftingOnly?: boolean
  /** Callback when a document blocker is clicked */
  onDocumentClick?: (slotSlug: string) => void
  /** Maximum items to show before "Show more" */
  maxVisible?: number
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReadinessBlockerList({
  matrix,
  filingOnly,
  draftingOnly,
  onDocumentClick,
  maxVisible = 20,
  className,
}: ReadinessBlockerListProps) {
  if (!matrix) return null

  let blockers = matrix.allBlockers
  if (filingOnly) blockers = matrix.filingBlockers
  if (draftingOnly) blockers = matrix.draftingBlockers

  if (blockers.length === 0) return null

  // Group by domain
  const grouped = groupByDomain(blockers)

  const handleBlockerClick = useCallback(
    (blocker: BlockerDetail) => {
      if (blocker.type === 'question') {
        dispatchScrollToField({
          profilePath: blocker.identifier,
          blockerType: 'question',
          domain: blocker.domain,
        })
      } else if (blocker.type === 'document' && onDocumentClick) {
        onDocumentClick(blocker.identifier)
      }
    },
    [onDocumentClick],
  )

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Target className="size-3.5 text-red-500" />
          {blockers.length} Blocker{blockers.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Click to navigate
        </span>
      </div>

      {Object.entries(grouped).map(([domain, domainBlockers]) => (
        <div key={domain} className="space-y-1">
          {/* Domain header */}
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain}
          </p>

          {/* Blocker items */}
          {domainBlockers.slice(0, maxVisible).map((blocker) => (
            <button
              key={`${blocker.type}-${blocker.identifier}-${blocker.person_name ?? ''}`}
              type="button"
              onClick={() => handleBlockerClick(blocker)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-all',
                blocker.blocks_filing
                  ? 'bg-red-500/8 text-red-700 dark:text-red-300 hover:bg-red-500/15'
                  : 'bg-amber-500/8 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15',
              )}
            >
              {/* Icon */}
              {blocker.type === 'question' ? (
                blocker.blocks_filing ? (
                  <XCircle className="size-3 shrink-0 opacity-70" />
                ) : (
                  <AlertTriangle className="size-3 shrink-0 opacity-70" />
                )
              ) : (
                <FileText className="size-3 shrink-0 opacity-70" />
              )}

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{blocker.label}</span>
                {blocker.person_name && (
                  <span className="ml-1 text-[9px] opacity-60">
                    ({blocker.person_name})
                  </span>
                )}
              </div>

              {/* Navigate arrow (appears on hover) */}
              <ChevronRight className="size-3 shrink-0 opacity-0 group-hover:opacity-70 transition-opacity" />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Group blockers by their domain field */
function groupByDomain(blockers: BlockerDetail[]): Record<string, BlockerDetail[]> {
  const result: Record<string, BlockerDetail[]> = {}
  for (const blocker of blockers) {
    const domain = blocker.domain ?? 'other'
    if (!result[domain]) result[domain] = []
    result[domain].push(blocker)
  }
  return result
}
