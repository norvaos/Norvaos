// ── NorvaOS i18n — Public API ──────────────────────────────────────────────
// Single import point for all i18n functionality

export { I18nProvider, useI18n } from './i18n-provider'
export { useTranslation } from './use-translation'
export { loadDictionary } from './dictionaries'
export { isRTL, CLIENT_LOCALES, ADMIN_LOCALES, getLocalesForAudience, clampLocaleForAudience } from './config'
export type { LocaleCode, LocaleAudience } from './config'
