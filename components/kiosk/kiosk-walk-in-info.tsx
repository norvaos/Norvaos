'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

interface WalkInInfo {
  name: string
  email: string
  phone: string
}

interface KioskWalkInInfoProps {
  locale: PortalLocale
  primaryColor: string
  onComplete: (info: WalkInInfo) => void
  onBack: () => void
}

/**
 * Walk-in guest info collection step.
 * Collects name (required), email, and phone before proceeding to questions.
 * Touch-optimised with large inputs for kiosk use.
 */
export function KioskWalkInInfo({
  locale,
  primaryColor,
  onComplete,
  onBack,
}: KioskWalkInInfoProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const t = getKioskTranslations(locale)

  const isValid = useMemo(() => name.trim().length >= 2, [name])

  function handleSubmit() {
    onComplete({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
    })
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">
          {t.walkin_title}
        </h2>
        <p className="text-slate-600 mt-2">
          {t.walkin_subtitle}
        </p>
      </div>

      <div className="w-full space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-900 flex items-center gap-2">
            {t.walkin_name}
            <span className="text-xs text-red-500 font-medium">{t.questions_required}</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.walkin_name_placeholder}
            className="h-14 text-lg"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-900">
            {t.walkin_email}
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.walkin_email_placeholder}
            className="h-14 text-lg"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-900">
            {t.walkin_phone}
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.walkin_phone_placeholder}
            className="h-14 text-lg"
          />
        </div>
      </div>

      <div className="flex gap-3 w-full pt-2">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="flex-1 h-14"
        >
          {t.questions_back}
        </Button>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!isValid}
          className="flex-1 h-14"
          style={{ backgroundColor: primaryColor }}
        >
          {t.questions_continue}
        </Button>
      </div>
    </div>
  )
}
