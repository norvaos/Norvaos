'use client'

/**
 * PortalNextAction — 8-level priority waterfall panel.
 * Shows the single most important thing the client needs to do next.
 * Color-coded: RED (immediate action), AMBER (action needed), BLUE (info), GREEN (all clear).
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { getTranslations, t, type PortalLocale } from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'
import type { PortalNextAction as PortalNextActionType, PortalSummaryResponse } from '@/lib/types/portal'
import { cn } from '@/lib/utils'

interface PortalNextActionProps {
  token: string
  primaryColor: string
  language: PortalLocale
  /** Lawyer name for the awaiting review state */
  lawyerName?: string
  /** Callback to pass summary data up to parent */
  onSummaryLoaded?: (data: PortalSummaryResponse) => void
}

// Color config
const COLOR_CONFIG = {
  red: {
    border: 'border-l-red-500',
    bg: 'bg-red-50/70',
    label: 'text-red-700',
    icon: '🔴',
  },
  amber: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/70',
    label: 'text-amber-700',
    icon: '🟡',
  },
  blue: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/70',
    label: 'text-blue-700',
    icon: '🔵',
  },
  green: {
    border: 'border-l-green-500',
    bg: 'bg-green-50/70',
    label: 'text-green-700',
    icon: '🟢',
  },
}

export function PortalNextActionPanel({
  token,
  primaryColor,
  language,
  lawyerName,
  onSummaryLoaded,
}: PortalNextActionProps) {
  const tr = getTranslations(language)
  const [action, setAction] = useState<PortalNextActionType | null>(null)
  const [reviewContext, setReviewContext] = useState<PortalSummaryResponse['reviewContext']>(null)
  const [loading, setLoading] = useState(true)
  const trackedRef = useRef(false)

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/summary`)
      if (!res.ok) return
      const data: PortalSummaryResponse = await res.json()
      setAction(data.nextAction)
      setReviewContext(data.reviewContext)
      onSummaryLoaded?.(data)
    } catch {
      // Fail silently — next action is non-critical
    } finally {
      setLoading(false)
    }
  }, [token, onSummaryLoaded])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Track next_action_displayed once after data loads
  useEffect(() => {
    if (action && !trackedRef.current) {
      trackedRef.current = true
      track('next_action_displayed', {
        action_type: action.type,
        priority: action.priority,
        scroll_target: action.scrollTarget ?? undefined,
      })
    }
  }, [action])

  if (loading) {
    return (
      <div className="rounded-xl border-l-4 border-l-slate-300 border bg-slate-50/50 p-4 animate-pulse">
        <div className="h-4 w-48 bg-slate-200 rounded" />
        <div className="h-3 w-72 bg-slate-100 rounded mt-2" />
      </div>
    )
  }

  if (!action) return null

  // ── Awaiting review — enhanced green state ──────────────────────────────

  if (action.type === 'awaiting_review') {
    const lastSubmittedAt = reviewContext?.lastSubmittedAt
      ? new Date(reviewContext.lastSubmittedAt).toLocaleDateString(language, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null

    return (
      <div className="rounded-xl border-l-4 border-l-green-500 border border-green-200 bg-green-50/70 p-5">
        <div className="flex items-start gap-3">
          <svg className="h-6 w-6 text-green-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-green-800">
              {tr.next_action_awaiting_review_title ?? 'All items submitted'}
            </h3>
            <p className="text-sm text-green-700 mt-1">
              {tr.next_action_awaiting_review_message ??
                'Your file is currently under review by our office.'}
            </p>

            {/* Context details */}
            <div className="mt-3 space-y-1.5 text-xs text-green-700">
              {lastSubmittedAt && (
                <p className="flex items-center gap-1.5">
                  <span className="text-green-500">•</span>
                  {t(tr.awaiting_review_last_update ?? 'Last update: {date}', {
                    date: lastSubmittedAt,
                  })}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <span className="text-green-500">•</span>
                {lawyerName
                  ? t(tr.awaiting_review_reviewer ?? 'Your lawyer, {name}, will review your file.', {
                      name: lawyerName,
                    })
                  : (tr.awaiting_review_reviewer_team ?? 'Your legal team will review your file.')}
              </p>
              <p className="flex items-center gap-1.5">
                <span className="text-green-500">•</span>
                <span>
                  <span className="font-medium">{tr.awaiting_review_what_next ?? 'What happens next'}: </span>
                  {tr.awaiting_review_what_next_detail ?? 'We will contact you if anything further is needed.'}
                </span>
              </p>
            </div>

            <p className="mt-3 text-xs text-green-600 italic">
              {tr.awaiting_review_reassurance ?? "You don't need to do anything right now."}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Regular action states ──────────────────────────────────────────────

  const colors = COLOR_CONFIG[action.color]
  const message = formatActionMessage(action, tr)
  const reason = action.context.reason
    ? t(tr.next_action_reupload_reason ?? 'Reason: {reason}', { reason: action.context.reason })
    : null

  const handleGo = () => {
    if (!action.scrollTarget) return
    track('next_action_go_clicked', {
      action_type: action.type,
      scroll_target: action.scrollTarget,
    })
    const el = document.getElementById(action.scrollTarget)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Brief highlight
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2')
      }, 2000)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border-l-4 border p-4',
        colors.border,
        colors.bg,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('text-[10px] font-semibold uppercase tracking-wider', colors.label)}>
            {tr.next_action_title ?? 'What You Need to Do Next'}
          </p>
          <p className="text-sm font-medium text-slate-800 mt-1">{message}</p>
          {reason && (
            <p className="text-xs text-slate-600 mt-0.5">{reason}</p>
          )}
        </div>

        {action.scrollTarget && (
          <button
            onClick={handleGo}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            {tr.next_action_go ?? 'Go'} →
          </button>
        )}
      </div>
    </div>
  )
}

// ── Format action message from type + context ────────────────────────────────

function formatActionMessage(
  action: PortalNextActionType,
  tr: ReturnType<typeof getTranslations>,
): string {
  const ctx = action.context

  switch (action.type) {
    case 'reupload_document':
      return t(tr.next_action_reupload ?? 'Re-upload your {documentName}', {
        documentName: ctx.documentName ?? 'document',
      })
    case 'payment_overdue':
      return t(tr.next_action_payment_overdue ?? 'Retainer payment overdue — {amount} outstanding', {
        amount: `$${((ctx.amount ?? 0) / 100).toLocaleString()}`,
      })
    case 'missing_document':
      return t(tr.next_action_missing_doc ?? 'Upload your {documentName}', {
        documentName: ctx.documentName ?? 'document',
      })
    case 'incomplete_questionnaire':
      return t(
        tr.next_action_incomplete_questionnaire ?? 'Complete intake questionnaire ({progress}% done)',
        { progress: ctx.questionnaireProgress ?? 0 },
      )
    case 'overdue_task':
      return t(tr.next_action_overdue_task ?? 'Complete: {taskTitle} (overdue)', {
        taskTitle: ctx.taskTitle ?? 'task',
      })
    case 'unread_messages':
      return tr.next_action_unread_messages ?? 'New message from your legal team'
    case 'upcoming_event':
      return t(tr.next_action_upcoming_event ?? 'Upcoming: {eventTitle} on {eventDate}', {
        eventTitle: ctx.eventTitle ?? 'event',
        eventDate: ctx.eventDate
          ? new Date(ctx.eventDate).toLocaleDateString()
          : '',
      })
    default:
      return 'View your case details'
  }
}
