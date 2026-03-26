/**
 * Polyglot Bridge  -  Bifurcated i18n Configuration (Directive 18.0)
 *
 * TWO-TIER LOCALIZATION:
 *   Admin-Core (staff/lawyer): English + French ONLY
 *   Client-Mesh (intake/retainer/notifications): Global 15
 *
 * Logic: user_role === 'staff' ? ADMIN_LOCALES : CLIENT_LOCALES
 *
 * Regulatory compliance:
 *   - LSO Rule 3.2-2: Communication in client's understood language
 *   - Canadian bilingual standard: Admin shell in en/fr
 *   - IRCC Accessibility: Global 15 for client-facing surfaces
 */

// ── Audience Types ───────────────────────────────────────────────────────────

export type LocaleAudience = 'admin' | 'client'

// ── Admin-Core Locales (en/fr only) ─────────────────────────────────────────

export const ADMIN_LOCALES = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' },
] as const

export type AdminLocaleCode = (typeof ADMIN_LOCALES)[number]['code']

// ── Client-Mesh Locales (Global 15) ─────────────────────────────────────────

export const CLIENT_LOCALES = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', dir: 'rtl' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'zh', label: 'Mandarin', nativeLabel: '中文', dir: 'ltr' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', dir: 'ltr' },
  { code: 'tl', label: 'Tagalog', nativeLabel: 'Tagalog', dir: 'ltr' },
  { code: 'fa', label: 'Farsi', nativeLabel: 'فارسی', dir: 'rtl' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt', dir: 'ltr' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', dir: 'ltr' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr' },
] as const

export type ClientLocaleCode = (typeof CLIENT_LOCALES)[number]['code']

// ── Unified type (superset) ─────────────────────────────────────────────────

/** All locale codes across both audiences */
export type LocaleCode = AdminLocaleCode | ClientLocaleCode

/** Backwards-compatible SUPPORTED_LOCALES = Client Global 15 (superset) */
export const SUPPORTED_LOCALES = CLIENT_LOCALES

export const DEFAULT_LOCALE: LocaleCode = 'en'
export const LOCALE_STORAGE_KEY = 'norva-locale'

// ── Role-gated locale resolver ──────────────────────────────────────────────

/**
 * Get available locales for a given audience.
 *
 * Admin/staff users: en/fr only (Canadian bilingual standard)
 * Clients: Full Global 15
 */
export function getLocalesForAudience(audience: LocaleAudience) {
  return audience === 'admin' ? ADMIN_LOCALES : CLIENT_LOCALES
}

/**
 * Check if a locale code is valid for the given audience.
 */
export function isLocaleValidForAudience(code: string, audience: LocaleAudience): boolean {
  const locales = getLocalesForAudience(audience)
  return locales.some((l) => l.code === code)
}

/**
 * Clamp a locale to the valid set for an audience.
 * If the code is not valid, returns 'en'.
 */
export function clampLocaleForAudience(code: string, audience: LocaleAudience): LocaleCode {
  if (isLocaleValidForAudience(code, audience)) return code as LocaleCode
  // For admin, if they had 'es' saved, fall back to 'en'
  return 'en'
}

// ── Locale metadata lookup ───────────────────────────────────────────────────

const LOCALE_MAP = new Map<string, (typeof CLIENT_LOCALES)[number]>(CLIENT_LOCALES.map((l) => [l.code, l]))

export function getLocaleInfo(code: string) {
  return LOCALE_MAP.get(code) ?? LOCALE_MAP.get('en')!
}

export function isRTL(code: string): boolean {
  return getLocaleInfo(code).dir === 'rtl'
}

// ── Browser language detection ───────────────────────────────────────────────

/**
 * Detect the best matching locale from browser navigator.languages.
 * Scope is filtered by audience.
 */
export function detectBrowserLocale(audience: LocaleAudience = 'client'): LocaleCode {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE

  const locales = getLocalesForAudience(audience)
  const supported = new Set<string>(locales.map((l) => l.code))

  for (const lang of navigator.languages ?? [navigator.language]) {
    const short = lang.split('-')[0].toLowerCase()
    if (supported.has(short)) return short as LocaleCode
  }

  return DEFAULT_LOCALE
}

// ── Persistence ──────────────────────────────────────────────────────────────

export function getPersistedLocale(): LocaleCode | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && CLIENT_LOCALES.some((l) => l.code === stored)) {
      return stored as LocaleCode
    }
  } catch {
    // SSR / incognito
  }
  return null
}

export function persistLocale(code: LocaleCode): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code)
  } catch {
    // ignore
  }
}

// ── Norva Ear  -  Translation-aware languages ─────────────────────────────────
// Languages the Norva Ear Neural Translation Layer can transcribe + translate.

export const NORVA_EAR_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'French / Français', dir: 'ltr' },
  { code: 'ur', label: 'Urdu / اردو', dir: 'rtl' },
  { code: 'pa', label: 'Punjabi / ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'zh', label: 'Mandarin / 中文', dir: 'ltr' },
  { code: 'es', label: 'Spanish / Español', dir: 'ltr' },
  { code: 'ar', label: 'Arabic / العربية', dir: 'rtl' },
  { code: 'hi', label: 'Hindi / हिन्दी', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese / Português', dir: 'ltr' },
  { code: 'tl', label: 'Tagalog', dir: 'ltr' },
  { code: 'fa', label: 'Farsi / فارسی', dir: 'rtl' },
  { code: 'vi', label: 'Vietnamese / Tiếng Việt', dir: 'ltr' },
  { code: 'ko', label: 'Korean / 한국어', dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian / Українська', dir: 'ltr' },
  { code: 'bn', label: 'Bengali / বাংলা', dir: 'ltr' },
] as const

/** RTL language codes from the Global 15 set (Arabic, Urdu, Farsi, Hebrew) */
export const RTL_LANGUAGE_CODES = new Set(['ar', 'ur', 'fa', 'he'])

/** Check if a Norva Ear language code is RTL */
export function isNorvaEarRTL(code: string): boolean {
  return RTL_LANGUAGE_CODES.has(code)
}

export type NorvaEarLanguageCode = (typeof NORVA_EAR_LANGUAGES)[number]['code']

// ── Bilingual Retainer  -  language pairs ─────────────────────────────────────
// Retainers can be generated in any Global 15 language paired with English.

export const BILINGUAL_PAIRS: Array<{
  primary: 'en'
  secondary: ClientLocaleCode
  label: string
}> = [
  { primary: 'en', secondary: 'fr', label: 'English / Français' },
  { primary: 'en', secondary: 'es', label: 'English / Español' },
  { primary: 'en', secondary: 'zh', label: 'English / 中文' },
  { primary: 'en', secondary: 'ar', label: 'English / العربية' },
  { primary: 'en', secondary: 'pa', label: 'English / ਪੰਜਾਬੀ' },
  { primary: 'en', secondary: 'ur', label: 'English / اردو' },
  { primary: 'en', secondary: 'hi', label: 'English / हिन्दी' },
  { primary: 'en', secondary: 'pt', label: 'English / Português' },
  { primary: 'en', secondary: 'fa', label: 'English / فارسی' },
  { primary: 'en', secondary: 'vi', label: 'English / Tiếng Việt' },
  { primary: 'en', secondary: 'ko', label: 'English / 한국어' },
  { primary: 'en', secondary: 'bn', label: 'English / বাংলা' },
  { primary: 'en', secondary: 'uk', label: 'English / Українська' },
  { primary: 'en', secondary: 'tl', label: 'English / Tagalog' },
]
