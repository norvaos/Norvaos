'use client'

/**
 * AuraHeader — Directive 32.0 §1: The Polyglot Pulse
 *
 * Cycles through welcome greetings in all Global 15 languages with a
 * smooth cross-fade animation. The UniversalGlobeSelector is the master
 * controller — manual language selection pauses the cycle for 15 seconds.
 *
 * RTL Enforcement: Container auto-reverses via Iron Canvas flex rules.
 * Zero framer-motion dependency — pure CSS keyframe animations.
 *
 * Directive 36.1: Liquid-Layout hardened — will-change demoted to 'auto'
 * between transitions to prevent permanent GPU layer reservation that
 * starves sidebar Nastaliq rendering. content-visibility: auto enables
 * browser skip when off-viewport during snap-resize.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { UniversalGlobeSelector } from '@/components/i18n/UniversalGlobeSelector'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { CLIENT_LOCALES, isRTL } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/config'
import { loadDictionary } from '@/lib/i18n/dictionaries'

// ── Types ────────────────────────────────────────────────────────────────────

interface AuraHeaderProps {
  /** Additional class names */
  className?: string
  /** Called when user manually selects a language — persist to contact record */
  onLanguageChange?: (localeCode: string) => void
}

interface GreetingEntry {
  code: LocaleCode
  text: string
  nativeLabel: string
  isRTL: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Cycle interval — set to 500 for Directive 34 Script-Pressure test, production: 5000 */
const CYCLE_INTERVAL = 5000    // 5s between greetings (production)
const PAUSE_DURATION = 15000   // 15s pause on manual selection
const FADE_DURATION = 600      // Cross-fade duration (ms)

// ── Component ────────────────────────────────────────────────────────────────

export function AuraHeader({ className, onLanguageChange }: AuraHeaderProps) {
  const { locale, setLocale } = useI18n()

  const [greetings, setGreetings] = useState<GreetingEntry[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load all greetings on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const entries: GreetingEntry[] = []
      for (const loc of CLIENT_LOCALES) {
        try {
          const dict = await loadDictionary(loc.code as LocaleCode)
          entries.push({
            code: loc.code as LocaleCode,
            text: dict['intake.welcome'] ?? 'Welcome',
            nativeLabel: loc.nativeLabel,
            isRTL: loc.dir === 'rtl',
          })
        } catch {
          entries.push({
            code: loc.code as LocaleCode,
            text: 'Welcome',
            nativeLabel: loc.nativeLabel,
            isRTL: loc.dir === 'rtl',
          })
        }
      }
      if (!cancelled) {
        setGreetings(entries)
        // Start at the current locale
        const startIdx = entries.findIndex(e => e.code === locale)
        if (startIdx >= 0) setActiveIdx(startIdx)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-cycle with cross-fade ───────────────────────────────────────
  useEffect(() => {
    if (greetings.length === 0 || isPaused) {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current)
      return
    }

    cycleTimerRef.current = setInterval(() => {
      // Fade out
      setIsVisible(false)
      setTimeout(() => {
        setActiveIdx(prev => (prev + 1) % greetings.length)
        setIsVisible(true)
      }, FADE_DURATION)
    }, CYCLE_INTERVAL)

    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current)
    }
  }, [greetings.length, isPaused])

  // ── Manual language selection handler ─────────────────────────────────
  const handleLocaleChange = useCallback((code: string) => {
    setLocale(code as LocaleCode)

    // Jump to this greeting instantly
    const idx = greetings.findIndex(g => g.code === code)
    if (idx >= 0) {
      setIsVisible(false)
      setTimeout(() => {
        setActiveIdx(idx)
        setIsVisible(true)
      }, 100)
    }

    // Pause the cycle for 15 seconds
    setIsPaused(true)
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(false)
    }, PAUSE_DURATION)

    // Persist language selection to contact record
    onLanguageChange?.(code)
  }, [greetings, setLocale, onLanguageChange])

  // Cleanup
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    }
  }, [])

  const current = greetings[activeIdx]
  const rtl = current?.isRTL ?? false

  // Directive 36.1: Only promote to GPU layer during active transition.
  // Between cycles, demote to 'auto' so Nastaliq sidebar gets full GPU budget.
  const isTransitioning = !isVisible

  return (
    <header
      className={cn(
        'relative rounded-xl',
        'bg-gradient-to-r from-primary/90 via-primary to-primary/80',
        'backdrop-blur-md',
        'px-6 py-5',
        className,
      )}
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        // Directive 36.1: content-visibility lets browser skip paint
        // when header scrolls off-viewport during snap-resize
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 5rem',
      }}
    >
      {/* Background shimmer — overflow-hidden scoped to shimmer only, not the header */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div className="absolute -top-1/2 -left-1/4 w-[200%] h-[200%] bg-gradient-to-br from-white/5 via-transparent to-accent/10 animate-pulse" />
      </div>

      {/* Content row — auto-reverses in RTL via Iron Canvas */}
      <div className={cn(
        'relative z-10 flex items-center gap-4',
        rtl ? 'flex-row-reverse' : 'flex-row'
      )}>
        {/* Greeting text with cross-fade — height-locked for zero layout drift */}
        <div className="flex-1 min-w-0" style={{ minHeight: '3.5rem', contain: 'layout style' }}>
          {current && (
            <div
              className={cn(
                'transition-all',
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
              )}
              style={{
                transitionDuration: `${FADE_DURATION}ms`,
                // Directive 36.1: Only promote to compositor layer during active fade.
                // Between cycles, 'auto' releases the GPU layer so sidebar Nastaliq
                // rendering gets full budget — eliminates stutter on Draft panel.
                willChange: isTransitioning ? 'opacity, transform' : 'auto',
              }}
            >
              <h1
                className={cn(
                  'text-xl font-bold text-primary-foreground',
                  'text-balance line-clamp-2',
                  rtl ? 'text-right' : 'text-left',
                )}
                style={{ lineHeight: rtl ? 1.8 : 1.375 }}
                lang={current.code}
              >
                {current.text}
              </h1>
              <p className={cn(
                'text-xs text-primary-foreground/60 mt-0.5',
                rtl ? 'text-right' : 'text-left',
              )}>
                {current.nativeLabel}
                {isPaused && (
                  <span className="ml-2 inline-flex items-center gap-1 text-accent">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Selected
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Pulse dots — show cycle position */}
          {greetings.length > 0 && (
            <div className={cn(
              'flex gap-0.5 mt-2',
              rtl ? 'flex-row-reverse' : 'flex-row',
            )}>
              {greetings.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'w-1 h-1 rounded-full transition-all duration-300',
                    i === activeIdx
                      ? 'w-3 bg-accent'
                      : 'bg-primary-foreground/20'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Globe Selector — master controller */}
        <div className="shrink-0">
          <UniversalGlobeSelector
            value={locale}
            onChange={handleLocaleChange}
            audience="client"
            compact
            className="text-primary-foreground"
          />
        </div>
      </div>
    </header>
  )
}
