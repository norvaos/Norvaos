'use client'

/**
 * I18nProvider — Global i18n context (Directive 32.0 Nuclear Fix)
 *
 * Single source of truth for locale, dictionary, and text direction.
 * Locale changes propagate to all consumers via React context.
 *
 * PERSISTENCE HIERARCHY (Database is Supreme Commander):
 *   1. DB `users.locale_preference` — authoritative, loaded via userLocalePreference prop
 *   2. localStorage `norva-locale` — client-side cache, PURGED if DB disagrees
 *   3. Browser detection — fallback only if both DB and localStorage are empty
 *
 * On setLocale:
 *   - Updates React state immediately
 *   - Persists to localStorage
 *   - Calls onLocaleChange callback → parent persists to DB
 *   - Updates document direction (dir, lang, data-rtl)
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  type LocaleCode,
  type LocaleAudience,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
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

// ── Context shape ────────────────────────────────────────────────────────────

interface I18nContextValue {
  /** Current locale code */
  locale: LocaleCode
  /** Switch locale — persists to localStorage, DB, and updates document direction */
  setLocale: (code: LocaleCode) => void
  /** Translate a dot-path dictionary key; falls back to English, then the raw key */
  t: (key: DictionaryKey, fallback?: string) => string
  /** Currently loaded dictionary */
  dictionary: Record<DictionaryKey, string>
  /** Whether the current locale is right-to-left */
  isRTL: boolean
  /** DB preference value (for debug display) */
  dbPreference: string | null
  /** Whether the provider has completed initial hydration */
  isHydrated: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: ReactNode
  /** Which audience is this provider serving? Defaults to 'client'. */
  audience?: LocaleAudience
  /** DB locale_preference from the users table — Supreme Commander */
  userLocalePreference?: string | null
  /** Whether the user data is still loading */
  userLoading?: boolean
  /** Callback to persist locale to DB when user changes it */
  onLocaleChange?: (code: string) => void
}

export function I18nProvider({
  children,
  audience = 'client',
  userLocalePreference = null,
  userLoading = false,
  onLocaleChange,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)
  const [dictionary, setDictionary] = useState<Record<DictionaryKey, string>>(en)
  const [isHydrated, setIsHydrated] = useState(false)
  const dbSyncedRef = useRef(false)

  // Available locales for this audience
  const availableLocales = useMemo(() => getLocalesForAudience(audience), [audience])

  // ── NUCLEAR FIX #1: DB is Supreme Commander ────────────────────────────────
  // When userLocalePreference arrives from DB, it OVERRIDES everything.
  // localStorage is purged if it conflicts.
  // CRITICAL: Dictionary is loaded BEFORE isHydrated is set — no flash of English.
  useEffect(() => {
    // Don't hydrate until user loading is complete
    if (userLoading) return
    if (dbSyncedRef.current) return

    let targetLocale: LocaleCode

    if (userLocalePreference) {
      // DB has a preference → it is the supreme commander
      targetLocale = clampLocaleForAudience(userLocalePreference, audience)
      console.info('[I18nProvider] DB Supreme Commander:', userLocalePreference, '→ clamped:', targetLocale)

      // NUCLEAR FIX #2: Purge conflicting localStorage
      const localStored = getPersistedLocale()
      if (localStored !== targetLocale) {
        console.info('[I18nProvider] Purging localStorage conflict:', localStored, '→', targetLocale)
        persistLocale(targetLocale)
      }
    } else {
      // No DB preference — fall back to localStorage → browser detection
      const persisted = getPersistedLocale()
      if (persisted) {
        targetLocale = clampLocaleForAudience(persisted, audience)
      } else {
        targetLocale = detectBrowserLocale(audience)
        persistLocale(targetLocale)
      }
    }

    dbSyncedRef.current = true
    applyDocumentDirection(targetLocale)
    setLocaleState(targetLocale)

    // Load the dictionary BEFORE marking hydrated — no English flash
    loadDictionary(targetLocale).then((dict) => {
      console.info('[I18nProvider] Dictionary loaded for:', targetLocale, '— keys:', Object.keys(dict).length)
      setDictionary(dict)
      setIsHydrated(true)
    })
  }, [userLocalePreference, userLoading, audience])

  // ── Load dictionary lazily when locale changes AFTER initial hydration ───
  const initialLocaleRef = useRef<LocaleCode | null>(null)
  useEffect(() => {
    // Skip the initial load — handled by the hydration effect above
    if (!isHydrated) return
    if (initialLocaleRef.current === null) {
      initialLocaleRef.current = locale
      return
    }
    if (locale === initialLocaleRef.current) return
    initialLocaleRef.current = locale

    let cancelled = false
    loadDictionary(locale).then((dict) => {
      if (!cancelled) {
        console.info('[I18nProvider] Dictionary switched to:', locale)
        setDictionary(dict)
      }
    })
    return () => {
      cancelled = true
    }
  }, [locale, isHydrated])

  // ── setLocale: persist to localStorage + DB + update document direction ──
  const setLocale = useCallback(
    (code: LocaleCode) => {
      const clamped = clampLocaleForAudience(code, audience)
      setLocaleState(clamped)
      persistLocale(clamped)
      applyDocumentDirection(clamped)

      // Persist to DB via callback (Supreme Commander sync)
      onLocaleChange?.(clamped)
    },
    [audience, onLocaleChange],
  )

  // ── Translation function ─────────────────────────────────────────────────
  const t = useCallback(
    (key: DictionaryKey, fallback?: string): string => {
      return dictionary[key] ?? en[key] ?? fallback ?? key
    },
    [dictionary],
  )

  const isRTL = useMemo(() => checkRTL(locale), [locale])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      dictionary,
      isRTL,
      dbPreference: userLocalePreference ?? null,
      isHydrated,
    }),
    [locale, setLocale, t, dictionary, isRTL, userLocalePreference, isHydrated],
  )

  // NUCLEAR FIX #1: Block rendering until hydrated — no flash of English
  if (!isHydrated) {
    return (
      <I18nContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </I18nContext.Provider>
    )
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// ── Consumer hook ────────────────────────────────────────────────────────────

/**
 * Access the global i18n context.
 *
 * Must be used within an <I18nProvider>.
 *
 * Returns: { locale, setLocale, t, dictionary, isRTL, dbPreference, isHydrated }
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n() must be used within an <I18nProvider>')
  }
  return ctx
}

// ── Helpers (private) ────────────────────────────────────────────────────────

/**
 * Set document.documentElement.dir, lang, and data-rtl attribute.
 * Matches the behaviour in the existing useLocale hook (Directive 15.0 Auto-Mirror).
 */
function applyDocumentDirection(code: LocaleCode): void {
  if (typeof document === 'undefined') return
  const rtl = checkRTL(code)
  document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  document.documentElement.lang = code
  if (rtl) {
    document.documentElement.setAttribute('data-rtl', 'true')
  } else {
    document.documentElement.removeAttribute('data-rtl')
  }
}
