'use client'

/**
 * PortalMatterSummary  -  Top card showing matter info, concrete outstanding counts
 * (primary signal), a thin progress bar (secondary), and last-updated timestamp.
 */

import { getTranslations, t, type PortalLocale } from '@/lib/utils/portal-translations'
import type { PortalSectionCounts } from '@/lib/types/portal'

interface PortalMatterSummaryProps {
  matterTitle: string
  matterNumber: string
  matterTypeName: string
  matterStatus: string
  sections: PortalSectionCounts | null
  lastUpdated: string | null
  primaryColor: string
  language: PortalLocale
}

export function PortalMatterSummary({
  matterTitle,
  matterNumber,
  matterTypeName,
  matterStatus,
  sections,
  lastUpdated,
  primaryColor,
  language,
}: PortalMatterSummaryProps) {
  const tr = getTranslations(language)

  // Compute concrete outstanding items
  const outstandingItems: string[] = []

  if (sections) {
    if (sections.documents.needed > 0) {
      outstandingItems.push(
        t(tr.summary_documents_needed ?? '{count} documents needed', {
          count: sections.documents.needed,
        }),
      )
    }
    if (sections.documents.reuploadNeeded > 0) {
      outstandingItems.push(
        `${sections.documents.reuploadNeeded} need${sections.documents.reuploadNeeded > 1 ? '' : 's'} re-upload`,
      )
    }
    if (sections.questions.exists && !sections.questions.completed) {
      outstandingItems.push(
        t(tr.summary_sections_incomplete ?? '{count} sections incomplete', {
          count: sections.questions.incompleteSections,
        }),
      )
    }
    if (sections.payment.totalDue - sections.payment.totalPaid > 0) {
      const outstanding = sections.payment.totalDue - sections.payment.totalPaid
      outstandingItems.push(
        t(tr.summary_payment_outstanding ?? '{amount} payment outstanding', {
          amount: `$${(outstanding / 100).toLocaleString()}`,
        }),
      )
    }
    if (sections.tasks.todo > 0) {
      outstandingItems.push(`${sections.tasks.todo} task${sections.tasks.todo > 1 ? 's' : ''} to do`)
    }
  }

  // Compute progress percentage (secondary signal)
  let progressPercent = 0
  if (sections && sections.documents.total > 0) {
    const docProgress = sections.documents.accepted / sections.documents.total
    const qProgress = sections.questions.exists
      ? (sections.questions.completed ? 1 : sections.questions.progress / 100)
      : 1
    progressPercent = Math.round(((docProgress + qProgress) / 2) * 100)
  }

  const allSubmitted = outstandingItems.length === 0 && sections && sections.documents.total > 0

  return (
    <div
      className="rounded-2xl border border-slate-200/60 p-5 shadow-lg backdrop-blur-sm relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, white 0%, ${primaryColor}06 50%, white 100%)`,
        boxShadow: `0 4px 20px ${primaryColor}08, 0 1px 3px rgba(0,0,0,0.04)`,
      }}
    >
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}60)` }} />

      {/* Matter identity */}
      <h2 className="text-lg font-bold text-slate-900 tracking-tight mt-1">{matterTitle || matterNumber}</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs">
        {matterNumber && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {tr.matter_file_label ?? 'File'}: {matterNumber}
          </span>
        )}
        {matterTypeName && (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}>
            {matterTypeName}
          </span>
        )}
      </div>

      {/* Concrete outstanding counts  -  PRIMARY signal */}
      <div className="mt-3">
        {allSubmitted ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-950/30 border border-emerald-500/20/60 px-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-950/40">
              <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <p className="text-sm font-semibold text-emerald-400">
              {tr.summary_all_submitted ?? 'All items submitted'}
            </p>
          </div>
        ) : outstandingItems.length > 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-amber-950/30/80 border border-amber-500/20/60 px-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-950/40">
              <svg className="h-3.5 w-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </div>
            <p className="text-sm font-medium text-slate-700">
              {outstandingItems.join(' · ')}
            </p>
          </div>
        ) : null}
      </div>

      {/* Progress bar  -  SECONDARY signal */}
      {sections && sections.documents.total > 0 && !allSubmitted && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)`,
                boxShadow: `0 0 8px ${primaryColor}30`,
              }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: primaryColor }}>
            {progressPercent}%
          </span>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="mt-3 text-[11px] text-slate-400 font-medium">
          {tr.matter_last_updated ?? 'Last updated'}:{' '}
          {new Date(lastUpdated).toLocaleDateString(language, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}
