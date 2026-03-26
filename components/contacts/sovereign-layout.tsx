'use client'

/**
 * SovereignLayout — Directive 32.0 Contact-Level Wrapper
 *
 * Wraps the contact detail page with:
 *   1. AuraHeader (5000ms polyglot cycle + UniversalGlobeSelector)
 *   2. Locale enforcement based on contact's preferred_language custom field
 *   3. RTL cascade + Nastaliq font-weighting when preferred_language is Urdu/Farsi/Arabic
 *
 * If contact.preferred_language = 'ur', the entire page flips to dir="rtl"
 * with Nastaliq-safe line heights.
 */

import { useEffect, type ReactNode } from 'react'
import { AuraHeader } from '@/components/front-desk/AuraHeader'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { isRTL } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

// ── Language → locale mapping ────────────────────────────────────────────────

const LANG_TO_LOCALE: Record<string, LocaleCode> = {
  english: 'en',
  french: 'fr',
  spanish: 'es',
  arabic: 'ar',
  urdu: 'ur',
  hindi: 'hi',
  punjabi: 'pa',
  chinese: 'zh',
  tagalog: 'tl',
  portuguese: 'pt',
  farsi: 'fa',
  persian: 'fa',
  korean: 'ko',
  vietnamese: 'vi',
  ukrainian: 'uk',
  bengali: 'bn',
  // Also accept locale codes directly
  en: 'en',
  fr: 'fr',
  es: 'es',
  ar: 'ar',
  ur: 'ur',
  hi: 'hi',
  pa: 'pa',
  zh: 'zh',
  tl: 'tl',
  pt: 'pt',
  fa: 'fa',
  ko: 'ko',
  vi: 'vi',
  uk: 'uk',
  bn: 'bn',
}

// Nastaliq scripts need extra line-height
const NASTALIQ_LOCALES = new Set<LocaleCode>(['ur', 'fa'])

// ── Props ────────────────────────────────────────────────────────────────────

interface SovereignLayoutProps {
  /** Contact's preferred_language custom field value */
  preferredLanguage?: string | null
  /** Called when user selects a language via the globe — persist to contact */
  onLanguageChange?: (localeCode: string) => void
  children: ReactNode
}

// ── Component ────────────────────────────────────────────────────────────────

export function SovereignLayout({ preferredLanguage, onLanguageChange, children }: SovereignLayoutProps) {
  const { setLocale } = useI18n()

  // Resolve locale from the contact's preferred_language
  const resolved = preferredLanguage
    ? LANG_TO_LOCALE[preferredLanguage.toLowerCase()] ?? null
    : null
  const rtl = resolved ? isRTL(resolved) : false
  const nastaliq = resolved ? NASTALIQ_LOCALES.has(resolved) : false

  // Apply locale switch when contact has a preferred language
  useEffect(() => {
    if (resolved) {
      setLocale(resolved)
    }
  }, [resolved, setLocale])

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      lang={resolved ?? undefined}
      className={cn(
        'space-y-4',
        nastaliq && 'nastaliq-container',
      )}
      style={nastaliq ? { lineHeight: 1.8 } : undefined}
    >
      {/* AuraHeader — Polyglot Pulse with 5000ms cycle */}
      <AuraHeader className="mx-0" onLanguageChange={onLanguageChange} />

      {/* Page content */}
      {children}
    </div>
  )
}
