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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Matter identity */}
      <h2 className="text-base font-semibold text-slate-900">{matterTitle || matterNumber}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        {matterNumber && (
          <span>
            {tr.matter_file_label ?? 'File'}: {matterNumber}
          </span>
        )}
        {matterTypeName && (
          <>
            <span className="text-slate-300">·</span>
            <span>
              {tr.matter_case_label ?? 'Case'}: {matterTypeName}
            </span>
          </>
        )}
      </div>

      {/* Concrete outstanding counts  -  PRIMARY signal */}
      <div className="mt-3">
        {allSubmitted ? (
          <p className="text-sm font-medium text-green-700">
            {tr.summary_all_submitted ?? 'All items submitted'} ✓
          </p>
        ) : outstandingItems.length > 0 ? (
          <p className="text-sm font-medium text-slate-700">
            {outstandingItems.join(' · ')}
          </p>
        ) : null}
      </div>

      {/* Thin progress bar  -  SECONDARY signal */}
      {sections && sections.documents.total > 0 && !allSubmitted && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                backgroundColor: primaryColor,
              }}
            />
          </div>
          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
            {progressPercent}%
          </span>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="mt-2 text-[11px] text-slate-400">
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
