'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { PORTAL_LOCALES, type PortalLocale } from '@/lib/utils/portal-translations'

interface KioskLanguageSelectorProps {
  enabledLanguages: PortalLocale[]
  currentLocale: PortalLocale
  onSelect: (locale: PortalLocale) => void
  primaryColor: string
}

/**
 * Touch-friendly language dropdown for the kiosk welcome screen.
 * Shows the current language with a dropdown to switch.
 * Only rendered when more than one language is enabled.
 */
export function KioskLanguageSelector({
  enabledLanguages,
  currentLocale,
  onSelect,
  primaryColor,
}: KioskLanguageSelectorProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const locales = PORTAL_LOCALES.filter((l) => enabledLanguages.includes(l.value))
  const current = PORTAL_LOCALES.find((l) => l.value === currentLocale)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick as EventListener)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick as EventListener)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-700 transition-all hover:border-slate-400 active:scale-95"
      >
        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.794 1.708-5.276" />
        </svg>
        <span>{current?.nativeLabel ?? 'English'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-50">
          {locales.map((loc) => {
            const isActive = loc.value === currentLocale
            return (
              <button
                key={loc.value}
                type="button"
                onClick={() => {
                  onSelect(loc.value)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'bg-slate-50 font-semibold'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
                    {loc.nativeLabel}
                  </p>
                  {loc.nativeLabel !== loc.label && (
                    <p className="text-xs text-slate-400">{loc.label}</p>
                  )}
                </div>
                {isActive && (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
