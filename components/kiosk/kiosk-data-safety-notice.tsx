'use client'

import { useState } from 'react'
import { Shield, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

interface KioskDataSafetyNoticeProps {
  firmName: string
  customNotice?: string | null
  locale: PortalLocale
  onAcknowledge: () => void
  onDecline: () => void
}

/**
 * Data safety notice shown BEFORE ID scan upload.
 *
 * Rule #9: ID scans are highly sensitive. Data safety notice shown
 * BEFORE upload, explicit acknowledgement required.
 *
 * Clients must acknowledge before proceeding to camera/upload.
 */
export function KioskDataSafetyNotice({
  firmName,
  customNotice,
  locale,
  onAcknowledge,
  onDecline,
}: KioskDataSafetyNoticeProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const t = getKioskTranslations(locale)

  const defaultNotice = `${firmName} takes your privacy seriously. Your identification document will be:

\u2022 Stored securely using encryption at rest
\u2022 Accessible only to authorized staff with appropriate permissions
\u2022 Automatically deleted after 90 days
\u2022 Used solely for identity verification purposes
\u2022 Never shared with third parties

By proceeding, you acknowledge and consent to the temporary storage of your identification document for verification purposes.`

  const notice = customNotice ?? defaultNotice

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
      <div className="w-16 h-16 rounded-full bg-blue-950/30 flex items-center justify-center">
        <Shield className="w-8 h-8 text-blue-600" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">
          {t.data_safety_title}
        </h2>
      </div>

      {/* Notice content */}
      <div className="w-full bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
        {notice}
      </div>

      {/* Acknowledgement checkbox */}
      <button
        type="button"
        onClick={() => setAcknowledged(!acknowledged)}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
          acknowledged
            ? 'border-emerald-500 bg-emerald-950/30'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
            acknowledged
              ? 'bg-emerald-500 text-white'
              : 'border-2 border-slate-300'
          }`}
        >
          {acknowledged && <CheckCircle2 className="w-4 h-4" />}
        </div>
        <span className="text-sm text-slate-700 text-left">
          {t.data_safety_acknowledge}
        </span>
      </button>

      <div className="flex gap-3 w-full">
        <Button
          variant="outline"
          size="lg"
          onClick={onDecline}
          className="flex-1 h-14"
        >
          {t.data_safety_skip}
        </Button>
        <Button
          size="lg"
          onClick={onAcknowledge}
          disabled={!acknowledged}
          className="flex-1 h-14"
        >
          {t.data_safety_continue}
        </Button>
      </div>
    </div>
  )
}
