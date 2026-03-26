'use client'

/**
 * Language Selector  -  Polyglot Bridge (Directive 18.0 Bifurcated)
 *
 * Client-facing language picker for the Intake Portal.
 * Shows language in both English and native script.
 * Audience-aware: only shows Global 15 in client context.
 *
 * For admin/staff contexts, use LanguageToggle instead.
 */

import { type LocaleCode, type LocaleAudience } from '@/lib/i18n/config'
import { useLocale } from '@/lib/i18n/use-locale'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LanguageSelectorProps {
  /** Compact mode  -  dropdown only, no label */
  compact?: boolean
  /** Audience context  -  defaults to 'client' (Global 15) */
  audience?: LocaleAudience
  /** Additional className */
  className?: string
}

export function LanguageSelector({ compact = false, audience = 'client', className }: LanguageSelectorProps) {
  const { locale, setLocale, t, availableLocales } = useLocale({ audience })

  if (compact) {
    return (
      <div className={cn('relative inline-flex items-center', className)}>
        <Globe className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as LocaleCode)}
          className="appearance-none rounded-lg border border-input bg-background pl-8 pr-8 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          aria-label="Language"
        >
          {availableLocales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{t('intake.language_select')}</p>
      </div>
      <p className="text-xs text-muted-foreground">{t('intake.language_note')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {availableLocales.map((l) => (
          <button
            type="button"
            key={l.code}
            onClick={() => setLocale(l.code as LocaleCode)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-xl border-2 px-4 py-3 text-left transition-all',
              locale === l.code
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-muted bg-background text-foreground hover:border-muted-foreground/30',
            )}
          >
            <span className="text-sm font-semibold">{l.nativeLabel}</span>
            <span className="text-[10px] text-muted-foreground">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
