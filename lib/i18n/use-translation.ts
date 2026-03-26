'use client'

/**
 * useTranslation — Convenience hook with namespace support & interpolation
 *
 * Wraps the global useI18n() context and adds:
 *   - Optional namespace prefix: useTranslation('dashboard') → t('welcome') resolves 'dashboard.welcome'
 *   - Interpolation: t('greeting', { name: 'John' }) replaces {{name}} with 'John'
 *   - Always returns a string (falls back to the raw key, never undefined)
 *
 * Usage:
 *   const { t, locale, isRTL } = useTranslation('dashboard')
 *   t('welcome')                         // → dictionary['dashboard.welcome']
 *   t('greeting', { name: 'John' })      // → 'Hello, John' (if value is 'Hello, {{name}}')
 */

import { useCallback } from 'react'
import { useI18n } from './i18n-provider'

type InterpolationValues = Record<string, string | number>

/**
 * Resolve a translation key from the dictionary, apply interpolation,
 * and fall back to the raw key if no translation is found.
 */
function interpolate(template: string, values: InterpolationValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in values ? String(values[key]) : match
  })
}

export function useTranslation(namespace?: string) {
  const { locale, isRTL, dictionary } = useI18n()

  const t = useCallback(
    (key: string, values?: InterpolationValues): string => {
      // Build the full dictionary key, prepending namespace if provided
      const fullKey = namespace ? `${namespace}.${key}` : key

      // Look up the value — dictionary is a flat Record<string, string>
      const raw = (dictionary as Record<string, string>)[fullKey]

      // Fall back to the key itself (never undefined)
      const resolved = raw ?? fullKey

      // Apply interpolation if values are provided
      return values ? interpolate(resolved, values) : resolved
    },
    [dictionary, namespace],
  )

  return { t, locale, isRTL } as const
}
