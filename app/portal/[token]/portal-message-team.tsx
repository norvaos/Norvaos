'use client'

/**
 * PortalMessageTeam  -  "Message My Team" button.
 *
 * Live chat placeholder (Velocity-powered real-time messaging coming soon).
 * For now: triggers a secure mailto: with the Matter ID in the subject line.
 */

import { track } from '@/lib/utils/portal-analytics'

interface PortalMessageTeamProps {
  lawyerEmail: string
  matterRef: string
  matterTitle?: string
  accentColor?: string
}

export function PortalMessageTeam({
  lawyerEmail,
  matterRef,
  matterTitle,
  accentColor = '#2563eb',
}: PortalMessageTeamProps) {
  const subject = encodeURIComponent(`[${matterRef}] Client Message`)
  const body = encodeURIComponent(
    `Hi,\n\nRegarding my case ${matterRef}${matterTitle ? `  -  ${matterTitle}` : ''}:\n\n[Your message here]\n\nThank you.`
  )
  const mailtoHref = `mailto:${lawyerEmail}?subject=${subject}&body=${body}`

  return (
    <section className="space-y-3">
      <a
        href={mailtoHref}
        onClick={() => track('message_team_clicked', { matterRef })}
        className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-dashed px-4 py-4 text-sm font-semibold transition-all hover:shadow-md active:scale-[0.98] touch-manipulation"
        style={{
          borderColor: accentColor,
          color: accentColor,
        }}
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Message My Team
      </a>
      <p className="text-center text-[10px] text-slate-400">
        Opens your email with the case reference pre-filled
      </p>
    </section>
  )
}
