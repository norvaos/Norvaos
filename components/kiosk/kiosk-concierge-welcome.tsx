'use client'

/**
 * Front Desk "Concierge" — Directive 31.0
 *
 * The "Aura" Greeting Architecture:
 *   - Cycling multilingual welcome text (CSS animation cross-fade)
 *   - Globe icon positioned top-right (LTR) or top-left (RTL)
 *
 * The "Quick-Action" Trident:
 *   - New Intake (Gold-Pulse) — start the funnel
 *   - Secure Upload (Emerald Shield) — SHA-256 vault drop
 *   - Biometric Login (Blue Fingerprint) — returning client status
 *
 * The "Receptionist" (Norva Ear):
 *   - Microphone icon triggers voice input
 *   - PolyglotCodeSwitch detects language + intent
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  UserPlus,
  ShieldCheck,
  Fingerprint,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isRtl, type PortalLocale } from '@/lib/utils/portal-translations'
import { KioskLanguageSelector } from '@/components/kiosk/kiosk-language-selector'

// ── Multilingual "Welcome" Strings ──────────────────────────────────────────

const WELCOME_CYCLE = [
  { lang: 'en', text: 'Welcome', dir: 'ltr' },
  { lang: 'fr', text: 'Bienvenue', dir: 'ltr' },
  { lang: 'es', text: 'Bienvenido', dir: 'ltr' },
  { lang: 'ar', text: 'أهلاً وسهلاً', dir: 'rtl' },
  { lang: 'zh', text: '欢迎', dir: 'ltr' },
  { lang: 'hi', text: 'स्वागत है', dir: 'ltr' },
  { lang: 'ur', text: 'خوش آمدید', dir: 'rtl' },
  { lang: 'pa', text: 'ਜੀ ਆਇਆਂ ਨੂੰ', dir: 'ltr' },
  { lang: 'pt', text: 'Bem-vindo', dir: 'ltr' },
  { lang: 'ko', text: '환영합니다', dir: 'ltr' },
  { lang: 'ja', text: 'ようこそ', dir: 'ltr' },
  { lang: 'fa', text: 'خوش آمدید', dir: 'rtl' },
  { lang: 'tl', text: 'Maligayang pagdating', dir: 'ltr' },
  { lang: 'ru', text: 'Добро пожаловать', dir: 'ltr' },
  { lang: 'tr', text: 'Hoş geldiniz', dir: 'ltr' },
] as const

// ── Props ───────────────────────────────────────────────────────────────────

interface ConciergeWelcomeProps {
  firmName: string
  welcomeMessage: string
  primaryColor: string
  locale: PortalLocale
  enabledLanguages: PortalLocale[]
  showLanguageSelector: boolean
  onLocaleChange: (locale: PortalLocale) => void
  onNewIntake: () => void
  onSecureUpload: () => void
  onReturningClient: () => void
  onVoiceCommand?: (transcript: string, detectedLanguage?: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function KioskConciergeWelcome({
  firmName,
  welcomeMessage,
  primaryColor,
  locale,
  enabledLanguages,
  showLanguageSelector,
  onLocaleChange,
  onNewIntake,
  onSecureUpload,
  onReturningClient,
  onVoiceCommand,
}: ConciergeWelcomeProps) {
  const [greetingIndex, setGreetingIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null)
  const rtl = isRtl(locale)

  // ── Greeting Cycle (cross-fade every 3s) ────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true)
      setTimeout(() => {
        setGreetingIndex((prev) => (prev + 1) % WELCOME_CYCLE.length)
        setIsFading(false)
      }, 400) // fade-out duration
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const currentGreeting = WELCOME_CYCLE[greetingIndex]

  // ── Voice Recognition (Receptionist) ────────────────────────────────
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return // Browser doesn't support speech recognition
    }

    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognition }).webkitSpeechRecognition

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    // Let the browser auto-detect the language
    recognition.lang = ''

    recognition.addEventListener('start', () => {
      setIsListening(true)
      setVoiceTranscript(null)
    })

    recognition.addEventListener('result', ((event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      const detectedLang = (event.results[0] as unknown as { language?: string })?.language
      setVoiceTranscript(transcript)
      setIsListening(false)
      onVoiceCommand?.(transcript, detectedLang ?? undefined)
    }) as EventListener)

    recognition.addEventListener('error', () => {
      setIsListening(false)
    })

    recognition.addEventListener('end', () => {
      setIsListening(false)
    })

    recognition.start()
  }, [onVoiceCommand])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white" dir={rtl ? 'rtl' : 'ltr'}>
      {/* ── Top Bar: Globe + Language Selector ──────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div className={cn('flex items-center gap-2 text-sm text-slate-500', rtl && 'flex-row-reverse')}>
          <span className="font-semibold text-slate-700">{firmName}</span>
        </div>
        <div className={cn('flex items-center gap-2', rtl && 'flex-row-reverse')}>
          {showLanguageSelector && (
            <KioskLanguageSelector
              enabledLanguages={enabledLanguages}
              currentLocale={locale}
              onSelect={onLocaleChange}
              primaryColor={primaryColor}
            />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Globe className="h-4.5 w-4.5" />
          </div>
        </div>
      </div>

      {/* ── Centre: Aura Greeting ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6 -mt-8">
        {/* Cycling multilingual greeting */}
        <div className="text-center space-y-3 min-h-[120px] flex flex-col items-center justify-center">
          <h1
            className={cn(
              'text-5xl font-bold text-slate-900 transition-opacity duration-400',
              isFading ? 'opacity-0' : 'opacity-100',
            )}
            dir={currentGreeting.dir}
            style={
              ['ar', 'ur', 'fa'].includes(currentGreeting.lang)
                ? { fontFamily: '"Noto Nastaliq Urdu", "Noto Sans Arabic", serif' }
                : undefined
            }
          >
            {currentGreeting.text}
          </h1>
          <p className="text-lg text-slate-500 max-w-lg">
            {welcomeMessage}
          </p>
        </div>

        {/* ── The Trident: Quick-Action Matrix ───────────────────────────── */}
        <div className="grid grid-cols-3 gap-5 w-full max-w-2xl">
          {/* 1. New Intake — Gold-Pulse */}
          <button
            type="button"
            onClick={onNewIntake}
            className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-amber-300 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-95"
          >
            {/* Gold pulse ring */}
            <div className="absolute inset-0 rounded-2xl border-2 border-amber-400 animate-pulse opacity-40" />
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-amber-50 group-hover:bg-amber-100 transition-colors">
              <UserPlus className="h-8 w-8 text-amber-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800">New Intake</p>
              <p className="text-xs text-slate-500 mt-0.5">Start here</p>
            </div>
          </button>

          {/* 2. Secure Upload — Emerald Shield */}
          <button
            type="button"
            onClick={onSecureUpload}
            className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-emerald-300 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-95"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800">Secure Upload</p>
              <p className="text-xs text-slate-500 mt-0.5">SHA-256 vault</p>
            </div>
          </button>

          {/* 3. Biometric Login — Blue Fingerprint */}
          <button
            type="button"
            onClick={onReturningClient}
            className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-blue-300 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-95"
          >
            <div className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors">
              <Fingerprint className="h-8 w-8 text-blue-600" />
              {/* Blue glow */}
              <div className="absolute inset-0 rounded-xl bg-blue-400/10 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800">Status Check</p>
              <p className="text-xs text-slate-500 mt-0.5">Existing clients</p>
            </div>
          </button>
        </div>

        {/* ── The Receptionist: Voice Command ────────────────────────────── */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={startListening}
            disabled={isListening}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full transition-all',
              isListening
                ? 'bg-red-100 text-red-600 scale-110'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 hover:scale-105 active:scale-95',
            )}
          >
            {isListening ? (
              <div className="relative">
                <Mic className="h-6 w-6 animate-pulse" />
                <div className="absolute -inset-3 rounded-full border-2 border-red-300 animate-ping" />
              </div>
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>
          <p className="text-xs text-slate-400">
            {isListening
              ? 'Listening... speak in any language'
              : voiceTranscript
                ? `"${voiceTranscript}"`
                : 'Tap to speak with the receptionist'}
          </p>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 text-center">
        <p className="text-[10px] text-slate-300">
          Powered by Norva OS — Professional Safety, by Design
        </p>
      </div>
    </div>
  )
}
