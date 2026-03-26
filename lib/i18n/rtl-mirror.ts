/**
 * RTL Auto-Mirror — Directive 15.0 Protocol 2
 *
 * When Arabic, Urdu, or Farsi is selected, the entire UI flips:
 *   - "Back" button moves to the right
 *   - "Submit" button moves to the left
 *   - All flex/grid layouts reverse
 *
 * Implementation: Sets `dir="rtl"` on the root element and injects
 * Tailwind RTL-aware classes. No manual mirroring needed.
 */

import { isRTL } from './config'
import type { LocaleCode } from './config'

// ── Root Document Mirroring ──────────────────────────────────────────────────

/**
 * Apply RTL direction to the document root when locale changes.
 * Call this from the useLocale() hook or layout effect.
 */
export function applyDocumentDirection(locale: LocaleCode): void {
  if (typeof document === 'undefined') return

  const rtl = isRTL(locale)
  const html = document.documentElement

  html.dir = rtl ? 'rtl' : 'ltr'
  html.lang = locale

  // Toggle Tailwind RTL data attribute for rtl: variant
  if (rtl) {
    html.setAttribute('data-rtl', 'true')
  } else {
    html.removeAttribute('data-rtl')
  }
}

// ── CSS Class Helpers ────────────────────────────────────────────────────────

/**
 * Returns directional class names based on current locale.
 * Use for manual overrides where Tailwind RTL modifiers aren't sufficient.
 *
 * Example:
 *   className={dirClass(locale, 'ml-2', 'mr-2')}
 *   // In LTR: "ml-2", In RTL: "mr-2"
 */
export function dirClass(locale: LocaleCode, ltrClass: string, rtlClass: string): string {
  return isRTL(locale) ? rtlClass : ltrClass
}

/**
 * Flip "start" and "end" based on locale direction.
 * Useful for positioning (left/right, text-align, etc.)
 */
export function dirAlign(locale: LocaleCode): { start: 'left' | 'right'; end: 'left' | 'right' } {
  const rtl = isRTL(locale)
  return {
    start: rtl ? 'right' : 'left',
    end: rtl ? 'left' : 'right',
  }
}

/**
 * Returns the appropriate flex-direction for button rows.
 * In RTL: Back → right, Submit → left (row-reverse).
 */
export function dirFlexRow(locale: LocaleCode): string {
  return isRTL(locale) ? 'flex-row-reverse' : 'flex-row'
}

// ── Portal/Shell Integration ─────────────────────────────────────────────────

/**
 * Get the container props for a locale-aware wrapper.
 * Spread onto the outermost div of IntakePortal or MatterShell.
 *
 * Usage:
 *   <div {...getDirectionProps(locale)} className="...">
 */
export function getDirectionProps(locale: LocaleCode): {
  dir: 'ltr' | 'rtl'
  'data-rtl': string | undefined
} {
  const rtl = isRTL(locale)
  return {
    dir: rtl ? 'rtl' : 'ltr',
    'data-rtl': rtl ? 'true' : undefined,
  }
}
