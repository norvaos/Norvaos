'use client'

/**
 * useLocale — Bifurcated i18n hook (Directive 18.0)
 *
 * Provides:
 *   - `locale`: current locale code
 *   - `setLocale(code)`: switch + persist (clamped to audience)
 *   - `t(key)`: translate a dictionary key
 *   - `dir`: text direction ('ltr' | 'rtl')
 *   - `isRTL`: boolean shorthand
 *   - `audience`: 'admin' | 'client'
 *   - `availableLocales`: locales valid for this audience
 *
 * Admin (staff/lawyer): locked to en/fr
 * Client (intake/portal): Full Global 15
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  type LocaleCode,
  type LocaleAudience,
  DEFAULT_LOCALE,
  detectBrowserLocale,
  getPersistedLocale,
  persistLocale,
  isRTL as checkRTL,
  getLocalesForAudience,
  clampLocaleForAudience,
} from './config'
import { en } from './dictionaries/en'
import type { DictionaryKey } from './dictionaries/en'
import { loadDictionary } from './dictionaries'

interface UseLocaleOptions {
  /** Which audience is this hook serving? Defaults to 'client'. */
  audience?: LocaleAudience
}

export function useLocale(options?: UseLocaleOptions) {
  const audience = options?.audience ?? 'client'

  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)
  const [dictionary, setDictionary] = useState<Record<DictionaryKey, string>>(en)

  // Available locales for this audience
  const availableLocales = useMemo(() => getLocalesForAudience(audience), [audience])

  // Hydrate locale from persistence or browser detection
  useEffect(() => {
    const persisted = getPersistedLocale()
    if (persisted) {
      // Clamp to audience — admin user with 'es' stored gets 'en'
      setLocaleState(clampLocaleForAudience(persisted, audience))
    } else {
      const detected = detectBrowserLocale(audience)
      setLocaleState(detected)
      persistLocale(detected)
    }
  }, [audience])

  // Load dictionary when locale changes
  useEffect(() => {
    let cancelled = false
    loadDictionary(locale).then((dict) => {
      if (!cancelled) setDictionary(dict)
    })
    return () => { cancelled = true }
  }, [locale])

  // Set locale + persist (clamped to audience)
  const setLocale = useCallback((code: LocaleCode) => {
    const clamped = clampLocaleForAudience(code, audience)
    setLocaleState(clamped)
    persistLocale(clamped)
    // Update document direction for RTL languages (Directive 15.0 Auto-Mirror)
    if (typeof document !== 'undefined') {
      const rtl = checkRTL(clamped)
      document.documentElement.dir = rtl ? 'rtl' : 'ltr'
      document.documentElement.lang = clamped
      if (rtl) {
        document.documentElement.setAttribute('data-rtl', 'true')
      } else {
        document.documentElement.removeAttribute('data-rtl')
      }
    }
  }, [audience])

  // Translation function
  const t = useCallback(
    (key: DictionaryKey, fallback?: string): string => {
      return dictionary[key] ?? en[key] ?? fallback ?? key
    },
    [dictionary],
  )

  const dir = useMemo(() => (checkRTL(locale) ? 'rtl' : 'ltr'), [locale])
  const isRTL = dir === 'rtl'

  return { locale, setLocale, t, dir, isRTL, audience, availableLocales } as const
}
