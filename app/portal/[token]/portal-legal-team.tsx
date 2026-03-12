'use client'

/**
 * PortalLegalTeam — Two-column contact block with role descriptions.
 * Shows lawyer + support staff with clear contact responsibility guidance.
 */

import { getTranslations, type PortalLocale } from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'
import type { PortalStaffContact } from '@/lib/types/portal'

interface PortalLegalTeamProps {
  lawyer?: {
    name: string
    email: string
    phone: string
    role_description?: string
  }
  supportStaff?: PortalStaffContact
  language: PortalLocale
}

function ContactColumn({
  label,
  name,
  email,
  phone,
  roleDescription,
  source,
}: {
  label: string
  name: string
  email?: string
  phone?: string
  roleDescription?: string
  source: 'legal_team' | 'footer'
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-900">{name}</p>
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={() => track('support_email_clicked', { email, source })}
          className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span className="truncate">{email}</span>
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={() => track('support_phone_clicked', { phone, source })}
          className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span>{phone}</span>
        </a>
      )}
      {roleDescription && (
        <p className="mt-2 text-[11px] text-slate-500 italic">{roleDescription}</p>
      )}
    </div>
  )
}

export function PortalLegalTeam({
  lawyer,
  supportStaff,
  language,
}: PortalLegalTeamProps) {
  const tr = getTranslations(language)

  const hasLawyer = !!lawyer?.name
  const hasSupport = !!supportStaff?.name
  const hasBoth = hasLawyer && hasSupport

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        {tr.section_legal_team ?? 'Your Legal Team'}
      </h3>

      <div className={hasBoth ? 'flex gap-6' : ''}>
        {hasLawyer && lawyer && (
          <ContactColumn
            label={tr.legal_team_lawyer ?? 'Responsible Lawyer'}
            name={lawyer.name}
            email={lawyer.email}
            phone={lawyer.phone}
            source="legal_team"
            roleDescription={
              lawyer.role_description ??
              (hasBoth ? (tr.legal_team_default_lawyer_role ?? 'For legal questions') : undefined)
            }
          />
        )}

        {hasBoth && <div className="w-px bg-slate-200 shrink-0" />}

        {hasSupport && supportStaff && (
          <ContactColumn
            label={tr.legal_team_support ?? 'Portal Support'}
            name={supportStaff.name!}
            email={supportStaff.email}
            phone={supportStaff.phone}
            source="legal_team"
            roleDescription={
              supportStaff.role_description ??
              (tr.legal_team_default_support_role ?? 'For documents, portal support, and payment confirmation')
            }
          />
        )}
      </div>
    </div>
  )
}
