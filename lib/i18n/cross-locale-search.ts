/**
 * Cross-Locale Search Index  -  Directive 36.2: Enable Cross-Locale Search
 *
 * Builds an inverted index from ALL 15 dictionaries so that a search for
 * "Passport" matches regardless of the active locale. Without this, when
 * the Globe is set to Urdu, a search for "Passport" looks only in the
 * Urdu index (finds "پاسپورٹ" but not "Passport") → returns [].
 *
 * Strategy: flatten every dictionary value (in all 15 languages) into a
 * single lookup map that resolves to the English canonical key + value.
 * Search consumers call `crossLocaleMatch(query, candidates)` which
 * checks the input against both the English term and all translations.
 */

import { en, type DictionaryKey } from './dictionaries/en'
import { loadDictionary } from './dictionaries'
import type { LocaleCode } from './config'
import { CLIENT_LOCALES } from './config'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CrossLocaleEntry {
  /** The English canonical key (e.g. 'field.passport_number') */
  key: DictionaryKey
  /** The English value (e.g. 'Passport Number') */
  enValue: string
  /** Locale code that matched */
  matchedLocale: LocaleCode
  /** The translated value that matched the query */
  matchedValue: string
}

// ── Inverted Index ─────────────────────────────────────────────────────────

/** Map of lowercase translated value → { key, enValue, locale } */
type InvertedIndex = Map<string, { key: DictionaryKey; enValue: string; locale: LocaleCode }[]>

let _index: InvertedIndex | null = null
let _indexPromise: Promise<InvertedIndex> | null = null

/**
 * Build (once) the inverted index from all 15 dictionaries.
 * Lazy-loaded and cached  -  subsequent calls return the same index.
 */
export async function getInvertedIndex(): Promise<InvertedIndex> {
  if (_index) return _index
  if (_indexPromise) return _indexPromise

  _indexPromise = buildIndex()
  _index = await _indexPromise
  return _index
}

async function buildIndex(): Promise<InvertedIndex> {
  const index: InvertedIndex = new Map()

  // English first (synchronous)
  for (const [key, value] of Object.entries(en)) {
    const lower = value.toLowerCase()
    const entries = index.get(lower) ?? []
    entries.push({ key: key as DictionaryKey, enValue: value, locale: 'en' as LocaleCode })
    index.set(lower, entries)
  }

  // All other locales (parallel async load)
  const locales = CLIENT_LOCALES.filter(l => l.code !== 'en')
  const dicts = await Promise.all(
    locales.map(async (loc) => {
      try {
        const dict = await loadDictionary(loc.code as LocaleCode)
        return { code: loc.code as LocaleCode, dict }
      } catch {
        return null
      }
    }),
  )

  for (const result of dicts) {
    if (!result) continue
    for (const [key, value] of Object.entries(result.dict)) {
      const lower = value.toLowerCase()
      const enValue = en[key as DictionaryKey] ?? value
      const entries = index.get(lower) ?? []
      // Avoid duplicates (same key + locale)
      if (!entries.some(e => e.key === key && e.locale === result.code)) {
        entries.push({ key: key as DictionaryKey, enValue, locale: result.code })
        index.set(lower, entries)
      }
    }
  }

  return index
}

// ── Search Functions ───────────────────────────────────────────────────────

/**
 * Search all 15 locale dictionaries for a query string.
 * Returns matching dictionary entries with their English canonical values.
 *
 * Use case: user types "Passport" while Globe is set to Urdu.
 * This function matches against English "Passport Number" AND Urdu "پاسپورٹ نمبر".
 */
export async function crossLocaleSearch(query: string): Promise<CrossLocaleEntry[]> {
  if (!query.trim()) return []
  const index = await getInvertedIndex()
  const q = query.toLowerCase()
  const results: CrossLocaleEntry[] = []
  const seenKeys = new Set<string>()

  for (const [translatedValue, entries] of index) {
    if (translatedValue.includes(q)) {
      for (const entry of entries) {
        // Deduplicate by dictionary key (return English canonical once)
        if (!seenKeys.has(entry.key)) {
          seenKeys.add(entry.key)
          results.push({
            key: entry.key,
            enValue: entry.enValue,
            matchedLocale: entry.locale,
            matchedValue: translatedValue,
          })
        }
      }
    }
  }

  return results
}

/**
 * Synchronous cross-locale string match for client-side filtering.
 * Checks a candidate string against both the raw query AND the English
 * equivalents of the query (resolved from any locale dictionary).
 *
 * Use in `.filter()` chains  -  e.g., document search, status filters.
 *
 * @param query    - The user's search input (any language)
 * @param candidate - The string to match against (usually English DB value)
 * @param englishTerms - Pre-resolved English terms from crossLocaleSearch()
 * @returns true if the candidate matches the query or any English equivalent
 */
export function crossLocaleMatch(
  query: string,
  candidate: string,
  englishTerms: string[] = [],
): boolean {
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()

  // Direct match (handles English-to-English and same-locale matches)
  if (c.includes(q)) return true

  // Check against English equivalents resolved from the inverted index
  // (e.g., user typed "پاسپورٹ" → englishTerms includes "Passport Number")
  for (const term of englishTerms) {
    if (c.includes(term.toLowerCase())) return true
  }

  return false
}

/**
 * Pre-resolve a search query into its English canonical terms.
 * Call once per query change, then pass results to crossLocaleMatch().
 *
 * This is the async bridge: resolve once → filter synchronously.
 */
export async function resolveEnglishTerms(query: string): Promise<string[]> {
  const matches = await crossLocaleSearch(query)
  return [...new Set(matches.map(m => m.enValue))]
}
