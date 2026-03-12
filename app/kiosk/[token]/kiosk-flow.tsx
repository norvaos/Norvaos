'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { KioskHeader } from '@/components/kiosk/kiosk-header'
import { KioskStepIndicator } from '@/components/kiosk/kiosk-step-indicator'
import { KioskSearch } from '@/components/kiosk/kiosk-search'
import { KioskIdentityVerify } from '@/components/kiosk/kiosk-identity-verify'
import { KioskDataSafetyNotice } from '@/components/kiosk/kiosk-data-safety-notice'
import { KioskIdScanner } from '@/components/kiosk/kiosk-id-scanner'
import { KioskConfirmation } from '@/components/kiosk/kiosk-confirmation'
import { KioskLanguageSelector } from '@/components/kiosk/kiosk-language-selector'
import { KioskQuestions } from '@/components/kiosk/kiosk-questions'
import { KioskWalkInInfo } from '@/components/kiosk/kiosk-walk-in-info'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import { isRtl, type PortalLocale } from '@/lib/utils/portal-translations'
import type { KioskQuestion, ReturningInfo } from '@/lib/types/kiosk-question'

interface KioskBranding {
  firmName: string
  logoUrl: string | null
  primaryColor: string
  welcomeMessage: string
  inactivityTimeout: number
  dataSafetyNotice: string | null
  enableIdScan: boolean
  enableIdentityVerify: boolean
  enabledLanguages: PortalLocale[]
  kioskQuestions: KioskQuestion[]
}

interface AppointmentResult {
  id: string
  booking_page_id: string
  guest_name: string
  guest_email: string | null
  start_time: string
  end_time: string
  duration_minutes: number
  status: string
  booking_page_title?: string
  user_first_name?: string
  user_last_name?: string
}

type KioskStep = 'welcome' | 'search' | 'walk_in_info' | 'verify' | 'questions' | 'data_safety' | 'id_scan' | 'completing' | 'confirmation'

interface KioskFlowProps {
  token: string
  tenantId: string
  branding: KioskBranding
}

/**
 * Client-side kiosk flow orchestrator.
 *
 * Manages the multi-step check-in wizard:
 *   1. Welcome (touch to begin + language selector)
 *   2. Search (find appointment)
 *   3. Verify identity (DOB check — Rule #8)
 *   4. Questions (dynamic configurable questions)
 *   5. Data safety notice (before ID scan — Rule #9)
 *   6. ID scan (camera/upload)
 *   7. Completion
 *   8. Confirmation (auto-resets after timeout, shows returning info)
 *
 * Steps 3-6 can be skipped based on tenant config.
 * Auto-timeout to welcome after inactivity (Rule #7).
 */
export function KioskFlow({ token, tenantId, branding }: KioskFlowProps) {
  const [step, setStep] = useState<KioskStep>('welcome')
  const [locale, setLocale] = useState<PortalLocale>('en')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentResult | null>(null)
  const [guestName, setGuestName] = useState<string>('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [returningInfo, setReturningInfo] = useState<ReturningInfo | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const t = getKioskTranslations(locale)
  const hasQuestions = branding.kioskQuestions.length > 0
  const showLanguageSelector = branding.enabledLanguages.length > 1

  // ── Inactivity timeout — auto-reset to welcome ──────────────────────────

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }
    // Only auto-reset if not on welcome or confirmation screen
    if (step !== 'welcome' && step !== 'confirmation') {
      inactivityTimerRef.current = setTimeout(() => {
        resetFlow()
      }, branding.inactivityTimeout * 1000)
    }
  }, [step, branding.inactivityTimeout])

  useEffect(() => {
    resetInactivityTimer()

    const handleActivity = () => resetInactivityTimer()
    window.addEventListener('touchstart', handleActivity)
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('keydown', handleActivity)

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [resetInactivityTimer])

  // Auto-reset confirmation screen after 15 seconds
  useEffect(() => {
    if (step === 'confirmation') {
      const timer = setTimeout(() => resetFlow(), 15000)
      return () => clearTimeout(timer)
    }
  }, [step])

  function resetFlow() {
    setStep('welcome')
    setLocale('en')
    setSessionId(null)
    setSelectedAppointment(null)
    setGuestName('')
    setAnswers({})
    setReturningInfo(null)
    setIsCompleting(false)
  }

  // ── Step navigation helpers ────────────────────────────────────────────

  /** Determine the next step after verify (or after search if verify disabled) */
  function nextStepAfterVerify() {
    if (hasQuestions) {
      setStep('questions')
    } else if (branding.enableIdScan) {
      setStep('data_safety')
    } else {
      completeCheckIn()
    }
  }

  /** Determine the next step after questions */
  function nextStepAfterQuestions() {
    if (branding.enableIdScan) {
      setStep('data_safety')
    } else {
      completeCheckIn()
    }
  }

  // ── Step navigation ─────────────────────────────────────────────────────

  async function handleAppointmentSelected(appointment: AppointmentResult) {
    setSelectedAppointment(appointment)
    setGuestName(appointment.guest_name)

    // Start a check-in session via action executor
    try {
      const res = await fetch(`/api/kiosk/${token}/lookup`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.sessionId)
      }
    } catch {
      // Session creation failure is non-blocking; we create it on complete
    }

    // Navigate to next step based on config
    if (branding.enableIdentityVerify) {
      setStep('verify')
    } else {
      nextStepAfterVerify()
    }
  }

  function handleWalkIn() {
    setStep('walk_in_info')
  }

  function handleWalkInInfoComplete(info: { name: string; email: string; phone: string }) {
    setGuestName(info.name)
    // Store walk-in contact info in answers so it gets saved with the session
    setAnswers((prev) => ({
      ...prev,
      _walkin_email: info.email || undefined,
      _walkin_phone: info.phone || undefined,
    }))
    if (hasQuestions) {
      setStep('questions')
    } else if (branding.enableIdScan) {
      setStep('data_safety')
    } else {
      completeCheckIn()
    }
  }

  function handleIdentityVerified() {
    nextStepAfterVerify()
  }

  function handleQuestionsComplete(questionAnswers: Record<string, unknown>) {
    setAnswers((prev) => ({ ...prev, ...questionAnswers }))
    nextStepAfterQuestions()
  }

  function handleQuestionsBack() {
    // If walk-in (no appointment), go back to walk-in info
    if (!selectedAppointment) {
      setStep('walk_in_info')
    } else if (branding.enableIdentityVerify && sessionId) {
      setStep('verify')
    } else {
      setStep('search')
    }
  }

  function handleDataSafetyAcknowledged() {
    setStep('id_scan')
  }

  function handleDataSafetyDeclined() {
    // Skip ID scan, go straight to completion
    completeCheckIn()
  }

  function handleIdScanComplete(_scanPath: string) {
    completeCheckIn()
  }

  function handleIdScanSkipped() {
    completeCheckIn()
  }

  async function completeCheckIn() {
    setStep('completing')
    setIsCompleting(true)

    try {
      const res = await fetch(`/api/kiosk/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          appointmentId: selectedAppointment?.id ?? null,
          guestName,
          dataSafetyAcknowledged: true,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
          locale,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.sessionId) setSessionId(data.sessionId)
        if (data.returningInfo) setReturningInfo(data.returningInfo)
      }
    } catch {
      // Non-blocking — show confirmation anyway
    }

    setIsCompleting(false)
    setStep('confirmation')
  }

  // ── Determine visible steps for indicator ────────────────────────────────

  const steps: { label: string; key: string }[] = [
    { label: t.step_find, key: 'search' },
  ]
  if (branding.enableIdentityVerify) {
    steps.push({ label: t.step_verify, key: 'verify' })
  }
  if (hasQuestions) {
    steps.push({ label: t.step_questions, key: 'questions' })
  }
  if (branding.enableIdScan) {
    steps.push({ label: t.step_id_scan, key: 'id_scan' })
  }
  steps.push({ label: t.step_done, key: 'confirmation' })

  // Map current step to the indicator step
  const indicatorStep =
    step === 'data_safety' ? 'id_scan' :
    step === 'completing' ? 'confirmation' :
    step === 'walk_in_info' ? 'search' :
    step

  // ── Render ──────────────────────────────────────────────────────────────

  // Welcome screen
  if (step === 'welcome') {
    return (
      <div className="min-h-screen flex flex-col" dir={isRtl(locale) ? 'rtl' : 'ltr'}>
        <KioskHeader
          firmName={branding.firmName}
          logoUrl={branding.logoUrl}
          primaryColor={branding.primaryColor}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-slate-900">
              Welcome
            </h1>
            <p className="text-xl text-slate-600 max-w-md">
              {branding.welcomeMessage}
            </p>
          </div>

          {showLanguageSelector && (
            <div>
              <KioskLanguageSelector
                enabledLanguages={branding.enabledLanguages}
                currentLocale={locale}
                onSelect={setLocale}
                primaryColor={branding.primaryColor}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep('search')}
            className="px-12 py-6 rounded-2xl text-xl font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Touch to Begin
          </button>
        </div>
      </div>
    )
  }

  // Confirmation screen
  if (step === 'confirmation') {
    return (
      <div className="min-h-screen flex flex-col" dir={isRtl(locale) ? 'rtl' : 'ltr'}>
        <KioskHeader
          firmName={branding.firmName}
          logoUrl={branding.logoUrl}
          primaryColor={branding.primaryColor}
        />
        <div className="flex-1 flex items-center justify-center">
          <KioskConfirmation
            firmName={branding.firmName}
            guestName={guestName}
            primaryColor={branding.primaryColor}
            locale={locale}
            returningInfo={returningInfo}
          />
        </div>
      </div>
    )
  }

  // Completing screen (brief loading)
  if (step === 'completing') {
    return (
      <div className="min-h-screen flex flex-col" dir={isRtl(locale) ? 'rtl' : 'ltr'}>
        <KioskHeader
          firmName={branding.firmName}
          logoUrl={branding.logoUrl}
          primaryColor={branding.primaryColor}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin mx-auto" />
            <p className="text-lg text-slate-600">{t.completing_message}</p>
          </div>
        </div>
      </div>
    )
  }

  // Flow steps with step indicator
  return (
    <div className="min-h-screen flex flex-col" dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <KioskHeader
        firmName={branding.firmName}
        logoUrl={branding.logoUrl}
        primaryColor={branding.primaryColor}
      />
      <KioskStepIndicator steps={steps} currentStep={indicatorStep} />

      <div className="flex-1 flex items-start justify-center py-8">
        {step === 'search' && (
          <KioskSearch
            token={token}
            locale={locale}
            onSelect={handleAppointmentSelected}
            onWalkIn={handleWalkIn}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'walk_in_info' && (
          <KioskWalkInInfo
            locale={locale}
            primaryColor={branding.primaryColor}
            onComplete={handleWalkInInfoComplete}
            onBack={() => setStep('search')}
          />
        )}

        {step === 'verify' && sessionId && (
          <KioskIdentityVerify
            token={token}
            sessionId={sessionId}
            guestName={guestName}
            locale={locale}
            onVerified={handleIdentityVerified}
            onSkip={branding.enableIdScan ? () => setStep('data_safety') : () => completeCheckIn()}
          />
        )}

        {step === 'questions' && (
          <KioskQuestions
            questions={branding.kioskQuestions}
            locale={locale}
            primaryColor={branding.primaryColor}
            onComplete={handleQuestionsComplete}
            onBack={handleQuestionsBack}
          />
        )}

        {step === 'data_safety' && (
          <KioskDataSafetyNotice
            firmName={branding.firmName}
            customNotice={branding.dataSafetyNotice}
            locale={locale}
            onAcknowledge={handleDataSafetyAcknowledged}
            onDecline={handleDataSafetyDeclined}
          />
        )}

        {step === 'id_scan' && (
          <KioskIdScanner
            token={token}
            sessionId={sessionId ?? ''}
            locale={locale}
            onComplete={handleIdScanComplete}
            onSkip={handleIdScanSkipped}
          />
        )}
      </div>
    </div>
  )
}
