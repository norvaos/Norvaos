'use client'

/**
 * ActionTrident — Directive 32.0 §2: The Funnel
 *
 * Three glass-morphism action cards forming the client entry funnel:
 *   Card A (Intake)     — Gold-pulse primary CTA, the "Starting Point"
 *   Card B (Vault Drop) — Secure document upload
 *   Card C (Portal)     — Client portal access with biometric verification
 *
 * Iron Canvas compliant: text-balance headers, IronCanvasGuard on labels,
 * responsive 1-col → 3-col grid with gap-8.
 *
 * Directive 36.1: Liquid-Layout hardened — `isolation: isolate` on cards
 * prevents Gold-Pulse border ghosting during 4K↔Mobile snap-resize.
 * CSS containment on grid prevents reflow propagation to sibling zones.
 */

import { useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, ShieldCheck, Fingerprint, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/lib/i18n/use-locale'
import { isRTL } from '@/lib/i18n/config'
import type { DictionaryKey } from '@/lib/i18n/dictionaries/en'

// ── Types ────────────────────────────────────────────────────────────────────

interface ActionTridentProps {
  /** Link for intake form */
  intakeHref: string
  /** Link for vault/document upload */
  vaultHref: string
  /** Link for client portal */
  portalHref: string
  /** Additional class names */
  className?: string
}

interface TridentCard {
  key: string
  titleKey: string
  descriptionKey: string
  fallbackTitle: string
  fallbackDescription: string
  icon: typeof Sparkles
  href: string
  isPrimary: boolean
}

// ── Card Definitions ─────────────────────────────────────────────────────────

function getCards(intakeHref: string, vaultHref: string, portalHref: string): TridentCard[] {
  return [
    {
      key: 'intake',
      titleKey: 'intake.submit',
      descriptionKey: 'intake.instructions',
      fallbackTitle: 'Start Intake',
      fallbackDescription: 'Begin your secure intake process. Your information is encrypted and protected.',
      icon: Sparkles,
      href: intakeHref,
      isPrimary: true,
    },
    {
      key: 'vault',
      titleKey: 'common.upload',
      descriptionKey: 'intake.biometric_instructions',
      fallbackTitle: 'Document Vault',
      fallbackDescription: 'Securely upload your documents. Every file is versioned and tracked.',
      icon: ShieldCheck,
      href: vaultHref,
      isPrimary: false,
    },
    {
      key: 'portal',
      titleKey: 'intake.biometric_title',
      descriptionKey: 'intake.consent_body',
      fallbackTitle: 'Client Portal',
      fallbackDescription: 'Access your secure portal to track your matter, view documents, and communicate with your lawyer.',
      icon: Fingerprint,
      href: portalHref,
      isPrimary: false,
    },
  ]
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActionTrident({
  intakeHref,
  vaultHref,
  portalHref,
  className,
}: ActionTridentProps) {
  const { locale, t, dir } = useLocale({ audience: 'client' })
  const rtl = isRTL(locale)
  const cards = getCards(intakeHref, vaultHref, portalHref)

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8',
        className,
      )}
      dir={dir}
      style={{ contain: 'layout style' }}
    >
      {cards.map((card) => {
        const Icon = card.icon
        const title = t(card.titleKey as DictionaryKey, card.fallbackTitle)
        const description = t(card.descriptionKey as DictionaryKey, card.fallbackDescription)

        return (
          <Link
            key={card.key}
            href={card.href}
            className={cn(
              'group relative flex flex-col rounded-2xl p-4 md:p-6 transition-all duration-300 overflow-hidden',
              // Glass-morphism
              'backdrop-blur-md bg-opacity-40',
              // Hover lift
              'hover:-translate-y-1 hover:shadow-xl',
              // Primary vs standard styling
              card.isPrimary
                ? 'bg-primary/10 border-2 border-accent shadow-lg shadow-accent/10'
                : 'bg-secondary/5 border border-white/10 hover:border-white/20',
              // RTL text alignment
              rtl ? 'text-right' : 'text-left',
            )}
            style={{
              // Directive 36.1: isolation creates a new stacking context per card,
              // preventing Gold-Pulse border artifacts from bleeding during snap-resize.
              // contain: layout style prevents reflow propagation across cards.
              isolation: 'isolate',
              contain: 'layout style',
              ...(card.isPrimary ? { animation: 'gold-pulse 3s ease-in-out infinite' } : {}),
            }}
          >
            {/* Primary card glow */}
            {card.isPrimary && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/10 via-transparent to-primary/5 pointer-events-none" />
            )}

            {/* Icon */}
            <div className={cn(
              'relative z-10 w-12 h-12 rounded-xl flex items-center justify-center mb-4',
              card.isPrimary
                ? 'bg-accent/20 text-accent'
                : 'bg-primary/10 text-primary',
              rtl ? 'self-end' : 'self-start',
            )}>
              <Icon className="h-6 w-6" />
            </div>

            {/* Title — line-clamp-2 for Nastaliq safety (no whitespace-nowrap conflict) */}
            <h3 className={cn(
              'relative z-10 text-lg font-bold text-foreground mb-2',
              'text-balance line-clamp-2',
            )}>
              {title}
            </h3>

            {/* Description — clamped to 3 lines, max-height caps Nastaliq line-height */}
            <p className={cn(
              'relative z-10 text-sm text-muted-foreground leading-relaxed flex-1',
              'line-clamp-3',
            )} style={{ maxHeight: '5.5em' }}>
              {description}
            </p>

            {/* Arrow CTA */}
            <div className={cn(
              'relative z-10 flex items-center gap-1.5 mt-4 text-xs font-semibold',
              card.isPrimary ? 'text-accent' : 'text-primary',
              'group-hover:gap-2.5 transition-all duration-200',
              rtl ? 'flex-row-reverse self-end' : 'self-start',
            )}>
              <span>{card.isPrimary ? t('common.next' as DictionaryKey, 'Get Started') : t('common.view' as DictionaryKey, 'Access')}</span>
              <ArrowRight className={cn('h-3.5 w-3.5', rtl && 'rotate-180')} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
