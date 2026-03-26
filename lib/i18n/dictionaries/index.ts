/**
 * Dictionary index — lazy-loads locale dictionaries to keep bundle size small.
 */

import type { LocaleCode } from '../config'
import type { DictionaryKey } from './en'
import { en } from './en'

export type { DictionaryKey }

/** All dictionaries keyed by locale code — Global 15 (Directive 16.1). */
type Dict = Record<DictionaryKey, string>

const dictionaries: Record<LocaleCode, () => Promise<Dict>> = {
  en: () => Promise.resolve(en),
  fr: () => import('./fr').then((m) => ({ ...en, ...m.fr }) as Dict),
  es: () => import('./es').then((m) => ({ ...en, ...m.es }) as Dict),
  pa: () => import('./pa').then((m) => ({ ...en, ...m.pa }) as Dict),
  zh: () => import('./zh').then((m) => ({ ...en, ...m.zh }) as Dict),
  ar: () => import('./ar').then((m) => ({ ...en, ...m.ar }) as Dict),
  ur: () => import('./ur').then((m) => ({ ...en, ...m.ur }) as Dict),
  hi: () => import('./hi').then((m) => ({ ...en, ...m.hi }) as Dict),
  pt: () => import('./pt').then((m) => ({ ...en, ...m.pt }) as Dict),
  tl: () => import('./tl').then((m) => ({ ...en, ...m.tl }) as Dict),
  fa: () => import('./fa').then((m) => ({ ...en, ...m.fa }) as Dict),
  vi: () => import('./vi').then((m) => ({ ...en, ...m.vi }) as Dict),
  ko: () => import('./ko').then((m) => ({ ...en, ...m.ko }) as Dict),
  uk: () => import('./uk').then((m) => ({ ...en, ...m.uk }) as Dict),
  bn: () => import('./bn').then((m) => ({ ...en, ...m.bn }) as Dict),
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
