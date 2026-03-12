'use client'

import { CheckCircle2 } from 'lucide-react'
import { getKioskTranslations, interpolate } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'
import type { ReturningInfo } from '@/lib/types/kiosk-question'

interface KioskConfirmationProps {
  firmName: string
  guestName: string
  primaryColor?: string
  locale: PortalLocale
  returningInfo?: ReturningInfo | null
}

/**
 * Kiosk confirmation screen — shown after check-in is complete.
 *
 * Auto-resets after inactivity timeout (handled by parent).
 * Shows returning client/lead staff info when available (Rule #8 safe —
 * only shown after successful check-in completion).
 */
export function KioskConfirmation({
  firmName,
  guestName,
  primaryColor = '#0f172a',
  locale,
  returningInfo,
}: KioskConfirmationProps) {
  const t = getKioskTranslations(locale)

  const staffInitials = returningInfo?.staffName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-16 px-6 text-center">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${primaryColor}15` }}
      >
        <CheckCircle2
          className="w-14 h-14"
          style={{ color: primaryColor }}
        />
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-slate-900">
          {t.confirmation_title}
        </h1>
        <p className="text-xl text-slate-600">
          {interpolate(t.confirmation_thank_you, { name: guestName })}
        </p>
      </div>

      {/* Returning info — staff avatar + message */}
      {returningInfo && (
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2"
            style={{ borderColor: primaryColor }}
          >
            {returningInfo.staffAvatarUrl ? (
              <img
                src={returningInfo.staffAvatarUrl}
                alt={returningInfo.staffName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span
                className="text-lg font-semibold"
                style={{ color: primaryColor }}
              >
                {staffInitials}
              </span>
            )}
          </div>
          <p className="text-lg text-slate-700">
            {returningInfo.type === 'client'
              ? interpolate(t.confirmation_seen_by, { name: returningInfo.staffName })
              : returningInfo.type === 'lead'
                ? interpolate(t.confirmation_last_seen_by, { name: returningInfo.staffName })
                : t.confirmation_lawyer_shortly}
          </p>
        </div>
      )}

      {!returningInfo && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-sm">
          <p className="text-slate-700 text-lg leading-relaxed">
            {t.confirmation_take_seat}
            {' '}
            {t.confirmation_lawyer_shortly}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-400 mt-8">
        {firmName}
      </p>
    </div>
  )
}
