/**
 * Dictionary index — lazy-loads locale dictionaries to keep bundle size small.
 */

import type { LocaleCode } from '../config'
import type { DictionaryKey } from './en'
import { en } from './en'

export type { DictionaryKey }

/** All dictionaries keyed by locale code — Global 15 (Directive 16.1). */
const dictionaries: Record<LocaleCode, () => Promise<Record<DictionaryKey, string>>> = {
  en: () => Promise.resolve(en),
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  pa: () => import('./pa').then((m) => m.pa),
  zh: () => import('./zh').then((m) => m.zh),
  ar: () => import('./ar').then((m) => m.ar),
  ur: () => import('./ur').then((m) => m.ur),
  hi: () => import('./hi').then((m) => m.hi),
  pt: () => import('./pt').then((m) => m.pt),
  tl: () => import('./tl').then((m) => m.tl),
  fa: () => import('./fa').then((m) => m.fa),
  vi: () => import('./vi').then((m) => m.vi),
  ko: () => import('./ko').then((m) => m.ko),
  uk: () => import('./uk').then((m) => m.uk),
  bn: () => import('./bn').then((m) => m.bn),
}

/**
 * Load a dictionary for the given locale.
 * Falls back to English if the locale is not supported.
 */
export async function loadDictionary(locale: LocaleCode): Promise<Record<DictionaryKey, string>> {
  const loader = dictionaries[locale] ?? dictionaries.en
  return loader()
}

/**
 * Synchronous English dictionary for SSR / fallback.
 */
export { en as enDictionary }
