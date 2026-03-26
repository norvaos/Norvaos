'use client'

/**
 * Admin-Core Language Toggle (Directive 18.0)
 *
 * Bilingual English/French toggle for the lawyer/staff UI.
 * Restricted to en/fr only — the Canadian bilingual standard.
 *
 * Role-gated: Only renders for staff users. Hidden from client views.
 * System actions (Delete Matter, Invite User, Trust Deposit) are
 * strictly bilingual to ensure legal clarity for the firm's staff.
 */

import { useLocale } from '@/lib/i18n/use-locale'
import type { LocaleCode } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { locale, setLocale } = useLocale({ audience: 'admin' })

  return (
    <div className={cn('inline-flex items-center rounded-lg border bg-muted p-0.5', className)}>
      <button
        onClick={() => setLocale('en' as LocaleCode)}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          locale === 'en'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        EN
      </button>
      <button
        onClick={() => setLocale('fr' as LocaleCode)}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          locale === 'fr'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        FR
      </button>
    </div>
  )
}
