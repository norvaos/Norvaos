'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

interface KioskIdentityVerifyProps {
  token: string
  sessionId: string
  guestName: string
  locale: PortalLocale
  onVerified: () => void
  onSkip?: () => void
}

/**
 * Identity verification step for returning clients.
 *
 * Rule #8: Identity verification required before revealing any
 * matter/appointment details. DOB (or equivalent) before revealing
 * any confidential data.
 *
 * Touch-optimised with large input fields and buttons.
 */
export function KioskIdentityVerify({
  token,
  sessionId,
  guestName,
  locale,
  onVerified,
  onSkip,
}: KioskIdentityVerifyProps) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  const t = getKioskTranslations(locale)

  async function handleVerify() {
    const dob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

    // Basic validation
    if (!year || !month || !day || year.length !== 4) {
      setError(t.verify_error_mismatch)
      return
    }

    setIsVerifying(true)
    setError(null)

    try {
      const res = await fetch(`/api/kiosk/${token}/verify-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, dateOfBirth: dob }),
      })

      const data = await res.json()

      if (!res.ok) {
        setAttempts((prev) => prev + 1)
        if (attempts >= 2) {
          setError(t.verify_error_locked)
        } else {
          setError(data.error ?? t.verify_error_mismatch)
        }
        return
      }

      onVerified()
    } catch {
      setError(t.verify_error_mismatch)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto px-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <ShieldCheck className="w-8 h-8 text-slate-600" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">
          {t.verify_title}
        </h2>
        <p className="text-slate-600 mt-2">
          {t.verify_subtitle}
        </p>
      </div>

      {/* DOB Input  -  three separate fields for touch-friendliness */}
      <div className="w-full space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={month}
              onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="MM"
              className="h-14 text-xl text-center"
              inputMode="numeric"
              maxLength={2}
            />
            <span className="text-xs text-slate-400 mt-1 block text-center">{t.verify_month}</span>
          </div>
          <div className="flex-1">
            <Input
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="DD"
              className="h-14 text-xl text-center"
              inputMode="numeric"
              maxLength={2}
            />
            <span className="text-xs text-slate-400 mt-1 block text-center">{t.verify_day}</span>
          </div>
          <div className="flex-[1.5]">
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="YYYY"
              className="h-14 text-xl text-center"
              inputMode="numeric"
              maxLength={4}
            />
            <span className="text-xs text-slate-400 mt-1 block text-center">{t.verify_year}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-950/30 px-4 py-3 rounded-lg w-full">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Button
        onClick={handleVerify}
        disabled={isVerifying || !year || !month || !day || attempts >= 3}
        size="lg"
        className="w-full h-14 text-lg"
      >
        {isVerifying ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {t.verify_button}
          </>
        ) : (
          t.verify_button
        )}
      </Button>

      {onSkip && (
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-slate-500"
        >
          {t.verify_skip}
        </Button>
      )}
    </div>
  )
}
