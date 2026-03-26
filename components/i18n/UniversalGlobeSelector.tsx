'use client'

/**
 * UniversalGlobeSelector  -  Searchable language dropdown (Directive 16.2)
 *
 * Features:
 *   - Globe icon trigger button
 *   - Searchable dropdown with native-script names
 *   - RTL indicator for Arabic, Urdu, Farsi
 *   - Works in both admin (en/fr) and client (Global 15) contexts
 *   - Compact mode for header bars, full mode for settings
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Globe, Search, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type LocaleCode, type LocaleAudience, CLIENT_LOCALES, ADMIN_LOCALES } from '@/lib/i18n/config'

// ── Flag emoji map (ISO 3166-1 → flag) ─────────────────────────────────────

const LOCALE_FLAGS: Record<string, string> = {
  en: '🇨🇦', // Canadian English
  fr: '🇨🇦', // Canadian French
  ur: '🇵🇰',
  pa: '🇮🇳',
  zh: '🇨🇳',
  es: '🇪🇸',
  ar: '🇸🇦',
  hi: '🇮🇳',
  pt: '🇧🇷',
  tl: '🇵🇭',
  fa: '🇮🇷',
  vi: '🇻🇳',
  ko: '🇰🇷',
  uk: '🇺🇦',
  bn: '🇧🇩',
}

// ── Props ──────────────────────────────────────────────────────────────────

interface UniversalGlobeSelectorProps {
  /** Current locale code */
  value: string
  /** Called when user selects a new locale */
  onChange: (code: string) => void
  /** Which audience set to show  -  'admin' = en/fr, 'client' = Global 15 */
  audience?: LocaleAudience
  /** Compact trigger (just globe icon) vs labelled trigger */
  compact?: boolean
  /** Additional className for the root wrapper */
  className?: string
  /** Disable the selector */
  disabled?: boolean
}

export function UniversalGlobeSelector({
  value,
  onChange,
  audience = 'client',
  compact = false,
  className,
  disabled = false,
}: UniversalGlobeSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const locales = audience === 'admin' ? [...ADMIN_LOCALES] : [...CLIENT_LOCALES]

  // Find the currently selected locale info
  const current = locales.find(l => l.code === value) ?? locales[0]

  // Filter by search
  const filtered = search.trim()
    ? locales.filter(l =>
        l.label.toLowerCase().includes(search.toLowerCase()) ||
        l.nativeLabel.toLowerCase().includes(search.toLowerCase()) ||
        l.code.toLowerCase().includes(search.toLowerCase())
      )
    : locales

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }, [])

  const handleSelect = useCallback((code: string) => {
    onChange(code)
    setOpen(false)
    setSearch('')
  }, [onChange])

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-input bg-background text-xs font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          compact ? 'px-2 py-1.5' : 'px-3 py-1.5',
        )}
        aria-label="Select language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        {!compact && (
          <>
            <span className="hidden sm:inline">{LOCALE_FLAGS[current.code] ?? '🌐'}</span>
            <span>{current.nativeLabel}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute end-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
          role="listbox"
          aria-label="Language options"
        >
          {/* Search bar */}
          {locales.length > 4 && (
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search languages..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}

          {/* Language list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No languages found</p>
            )}
            {filtered.map(l => {
              const isActive = l.code === value
              const isRtl = l.dir === 'rtl'
              return (
                <button
                  key={l.code}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(l.code)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent/50',
                  )}
                >
                  {/* Flag */}
                  <span className="text-sm shrink-0">{LOCALE_FLAGS[l.code] ?? '🌐'}</span>

                  {/* Labels */}
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{l.nativeLabel}</span>
                    <span className="ml-1.5 text-muted-foreground">{l.label}</span>
                    {isRtl && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground/60 font-mono">RTL</span>
                    )}
                  </span>

                  {/* Check mark */}
                  {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
