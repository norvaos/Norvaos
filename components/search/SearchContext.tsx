'use client'

/**
 * SearchContext  -  Directive 36.2: Cross-Locale Search
 *
 * Provides a `useCrossLocaleSearch(query)` hook that resolves any search
 * term (in any of the Global 15 languages) to its English canonical
 * equivalents. This enables the "Passport" problem fix: when the Globe is
 * set to Urdu and a user types "Passport" (English), the system still
 * finds matches because the inverted index maps English → Urdu → English.
 *
 * Conversely, if a user types "پاسپورٹ" (Urdu), the system resolves it
 * to "Passport Number" / "Passport Expiry Date" and matches against the
 * English-stored database values.
 *
 * Usage:
 *   <SearchProvider>
 *     <YourComponent />
 *   </SearchProvider>
 *
 *   // Inside YourComponent:
 *   const { englishTerms, crossMatch } = useCrossLocaleSearch(query)
 *   const filtered = items.filter(item => crossMatch(item.name))
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import {
  resolveEnglishTerms,
  crossLocaleMatch,
  getInvertedIndex,
} from '@/lib/i18n/cross-locale-search'

// ── Context ──────────────────────────────────────────────────────────────────

interface SearchContextValue {
  /** Whether the cross-locale index has been loaded */
  indexReady: boolean
}

const SearchCtx = createContext<SearchContextValue>({ indexReady: false })

// ── Provider ─────────────────────────────────────────────────────────────────

interface SearchProviderProps {
  children: ReactNode
}

/**
 * Mount once at the layout level. Eagerly loads the inverted index
 * so that subsequent `useCrossLocaleSearch` calls resolve instantly.
 */
export function SearchProvider({ children }: SearchProviderProps) {
  const [indexReady, setIndexReady] = useState(false)

  useEffect(() => {
    // Eagerly warm the inverted index on mount
    getInvertedIndex().then(() => setIndexReady(true))
  }, [])

  return (
    <SearchCtx.Provider value={{ indexReady }}>
      {children}
    </SearchCtx.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface CrossLocaleSearchResult {
  /**
   * English canonical terms resolved from the query.
   * Empty array while loading or if query is empty.
   */
  englishTerms: string[]

  /**
   * Synchronous match function: returns true if `candidate` matches
   * the query directly OR via any resolved English equivalent.
   *
   * Use in `.filter()` chains for zero-allocation filtering.
   */
  crossMatch: (candidate: string) => boolean

  /** Whether resolution is in progress */
  isResolving: boolean
}

/**
 * Resolve a search query against all 15 locale dictionaries.
 *
 * Returns `englishTerms` (the English canonical equivalents) and a
 * `crossMatch(candidate)` function for use in filter chains.
 *
 * @param query - The user's search input (any language)
 * @param debounceMs - Debounce delay (default 100ms, keeps resolution snappy)
 */
export function useCrossLocaleSearch(
  query: string,
  debounceMs = 100,
): CrossLocaleSearchResult {
  const { indexReady } = useContext(SearchCtx)
  const [englishTerms, setEnglishTerms] = useState<string[]>([])
  const [isResolving, setIsResolving] = useState(false)
  const lastQueryRef = useRef('')

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setEnglishTerms([])
      setIsResolving(false)
      return
    }

    // Skip resolution until index is loaded
    if (!indexReady) return

    setIsResolving(true)
    lastQueryRef.current = trimmed

    const timer = setTimeout(async () => {
      const terms = await resolveEnglishTerms(trimmed)
      // Only update if this is still the latest query
      if (lastQueryRef.current === trimmed) {
        setEnglishTerms(terms)
        setIsResolving(false)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [query, indexReady, debounceMs])

  const crossMatch = useCallback(
    (candidate: string): boolean => {
      const trimmed = query.trim()
      if (!trimmed) return true // empty query matches everything
      return crossLocaleMatch(trimmed, candidate, englishTerms)
    },
    [query, englishTerms],
  )

  return { englishTerms, crossMatch, isResolving }
}
