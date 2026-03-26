'use client'

/**
 * LocaleDebugFooter  -  Nuclear Fix #3: Visual Debug Mode
 *
 * Displays current locale state vs DB preference in a fixed footer.
 * Shows where the "handshake" is breaking.
 *
 * TEMPORARY: Remove after 24 hours once persistence is verified.
 */

import { useI18n } from '@/lib/i18n/i18n-provider'
import { LOCALE_STORAGE_KEY } from '@/lib/i18n/config'
import { useEffect, useState } from 'react'

export function LocaleDebugFooter() {
  const { locale, dbPreference, isHydrated } = useI18n()
  const [localStorageValue, setLocalStorageValue] = useState<string | null>(null)

  useEffect(() => {
    const val = localStorage.getItem(LOCALE_STORAGE_KEY)
    setLocalStorageValue(val)
    // Re-check every 2 seconds
    const interval = setInterval(() => {
      setLocalStorageValue(localStorage.getItem(LOCALE_STORAGE_KEY))
    }, 2000)
    return () => clearInterval(interval)
  }, [locale])

  const allMatch = locale === dbPreference && locale === localStorageValue
  const bgColor = allMatch
    ? 'bg-emerald-900/90'
    : 'bg-red-900/90'

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[9999] ${bgColor} text-white text-xs px-4 py-1.5 flex items-center gap-6 font-mono`}
    >
      <span className="font-bold">🔍 LOCALE DEBUG</span>
      <span>
        State: <strong className="text-yellow-300">{locale}</strong>
      </span>
      <span>
        DB Preference: <strong className={dbPreference ? 'text-green-300' : 'text-red-300'}>{dbPreference ?? 'NULL'}</strong>
      </span>
      <span>
        localStorage: <strong className="text-blue-300">{localStorageValue ?? 'NULL'}</strong>
      </span>
      <span>
        Hydrated: <strong className={isHydrated ? 'text-green-300' : 'text-red-300'}>{isHydrated ? 'YES' : 'NO'}</strong>
      </span>
      <span className={allMatch ? 'text-green-300' : 'text-red-300 font-bold animate-pulse'}>
        {allMatch ? '✅ ALL SYNCED' : '❌ MISMATCH DETECTED'}
      </span>
    </div>
  )
}
