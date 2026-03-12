'use client'

import { useState, useEffect, useCallback } from 'react'
import { IRCCQuestionnaire } from '@/components/ircc/ircc-questionnaire'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import {
  getTranslations,
  t,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface IRCCQuestionnaireData {
  has_ircc: boolean
  status: string | null
  form_codes: string[] | null
  completed_at: string | null
  profile: Record<string, unknown> | null
  contact_id: string | null
  use_db_questionnaire?: boolean
  form_ids?: string[]
}

interface PortalIRCCQuestionnaireProps {
  token: string
  primaryColor?: string
  language?: PortalLocale
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalIRCCQuestionnaire({
  token,
  primaryColor,
  language = 'en',
}: PortalIRCCQuestionnaireProps) {
  const tr = getTranslations(language)
  const [data, setData] = useState<IRCCQuestionnaireData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)

  // DB questionnaire state — single source of truth from Settings → ircc_stream_forms
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dbQuestionnaire, setDbQuestionnaire] = useState<any>(null)

  // Edit request state
  const [hasPendingEditRequest, setHasPendingEditRequest] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSubmitted, setEditSubmitted] = useState(false)

  // Fetch initial data + DB sections in one sequence (no flash)
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/portal/${token}/ircc-questionnaire`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Request failed (${res.status})`)
        }
        const json = (await res.json()) as IRCCQuestionnaireData
        setData(json)

        if (json.status === 'completed') {
          setIsCompleted(true)
          // Non-critical, fire and forget
          fetchEditRequestStatus()
        }

        // Always try to fetch DB sections when the API signals DB questionnaire is available.
        // This is the ONLY path — no fallback to hardcoded form registry.
        if (json.use_db_questionnaire && json.form_ids && json.form_ids.length > 0) {
          await fetchDbSections()
        }
      } catch (err) {
        console.error('[portal-ircc] Fetch error:', err)
        setError(
          err instanceof Error ? err.message : tr.error_load_questionnaire,
        )
      } finally {
        setIsLoading(false)
      }
    }

    async function fetchDbSections() {
      try {
        const res = await fetch(`/api/portal/${token}/ircc-questionnaire/sections`)
        if (res.ok) {
          const json = await res.json()
          if (json.sections && json.sections.length > 0) {
            setDbQuestionnaire(json)
          }
        }
      } catch (err) {
        console.error('[portal-ircc] DB sections fetch error:', err)
      }
    }

    async function fetchEditRequestStatus() {
      try {
        const res = await fetch(`/api/portal/${token}/questionnaire-edit-request`)
        if (res.ok) {
          const json = await res.json()
          setHasPendingEditRequest(json.hasPendingRequest)
        }
      } catch {
        // Non-critical
      }
    }

    fetchData()
  }, [token])

  // Auto-save on step navigation
  const handleSave = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      try {
        const res = await fetch(`/api/portal/${token}/ircc-questionnaire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile }),
        })
        if (!res.ok) {
          console.error('[portal-ircc] Save failed:', res.status)
        }
      } catch (err) {
        console.error('[portal-ircc] Save error:', err)
      }
    },
    [token],
  )

  // Complete the questionnaire
  const handleComplete = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      try {
        const res = await fetch(`/api/portal/${token}/ircc-questionnaire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, complete: true }),
        })
        if (!res.ok) {
          console.error('[portal-ircc] Complete failed:', res.status)
          return
        }
        track('questionnaire_completed', { session_id: 'current' })
        setIsCompleted(true)
      } catch (err) {
        console.error('[portal-ircc] Complete error:', err)
      }
    },
    [token],
  )

  // Submit edit request
  const handleSubmitEditRequest = async () => {
    if (!editReason.trim() || editSubmitting) return
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/portal/${token}/questionnaire-edit-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: editReason.trim() }),
      })
      if (res.ok) {
        const json = await res.json()
        if (json.alreadyRequested) {
          setHasPendingEditRequest(true)
        }
        track('questionnaire_edit_requested', {
          session_id: 'current',
          reason_length: editReason.trim().length,
        })
        setEditSubmitted(true)
        setShowEditForm(false)
      }
    } catch {
      // Fail silently
    } finally {
      setEditSubmitting(false)
    }
  }

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 animate-spin text-slate-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm text-slate-500">
            {tr.ircc_loading}
          </span>
        </div>
      </div>
    )
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-5 w-5 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-red-800">
          {tr.ircc_error_title}
        </p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  // ── Already Completed ──────────────────────────────────────────────────────

  if (isCompleted) {
    const completedAt = data?.completed_at
      ? new Date(data.completed_at).toLocaleDateString('en-CA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-5 w-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-green-800">
            {tr.ircc_submitted_title}
          </h3>
          <p className="mt-1 text-sm text-green-700">
            {tr.ircc_submitted_message}
          </p>
          {completedAt && (
            <p className="mt-2 text-xs text-green-600">
              {t(tr.ircc_submitted_on, { date: completedAt })}
            </p>
          )}
        </div>

        {/* Read-only view of submitted answers */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">
            {tr.ircc_readonly_heading}
          </h4>
          <IRCCQuestionnaire
            formCodes={data?.form_codes ?? []}
            existingProfile={
              (data?.profile as Partial<IRCCProfile>) ?? {}
            }
            onSave={async () => {}}
            onComplete={async () => {}}
            readOnly
            prebuiltQuestionnaire={dbQuestionnaire}
          />
        </div>

        {/* ── Edit Request Section ─────────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-4">
          {hasPendingEditRequest || editSubmitted ? (
            // Pending or just submitted
            <p className="text-xs text-amber-700 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {tr.ircc_edit_request_pending ?? 'Edit request pending. Your legal team has been notified.'}
            </p>
          ) : showEditForm ? (
            // Inline form
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {tr.ircc_edit_request_title ?? 'Need to make changes?'}
              </p>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value.slice(0, 500))}
                placeholder={tr.ircc_edit_request_placeholder ?? 'Tell your legal team what needs to change'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{editReason.length}/500</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowEditForm(false)
                      setEditReason('')
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {tr.ircc_edit_request_cancel ?? 'Cancel'}
                  </button>
                  <button
                    onClick={handleSubmitEditRequest}
                    disabled={!editReason.trim() || editSubmitting}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editSubmitting
                      ? (tr.ircc_edit_request_sending ?? 'Sending...')
                      : (tr.ircc_edit_request_submit ?? 'Send Request')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Request Changes button
            <div>
              <p className="text-sm font-medium text-slate-600">
                {tr.ircc_edit_request_title ?? 'Need to make changes?'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr.ircc_edit_request_description ?? 'If you need to update your answers, submit a request to your legal team.'}
              </p>
              <button
                onClick={() => setShowEditForm(true)}
                className="mt-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {tr.ircc_edit_request_button ?? 'Request Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── No Forms Configured ────────────────────────────────────────────────────

  const formCodes = data?.form_codes ?? []
  const hasQuestionnaire = dbQuestionnaire || formCodes.length > 0

  if (!hasQuestionnaire) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <svg
            className="h-5 w-5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">
          {tr.ircc_no_questionnaire_title ?? 'No questionnaire available'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {tr.ircc_no_questionnaire_message ?? 'Your legal team has not configured a questionnaire for this matter yet. Please check back later.'}
        </p>
      </div>
    )
  }

  // ── Active Questionnaire ───────────────────────────────────────────────────

  const existingProfile = (data?.profile as Partial<IRCCProfile>) ?? {}

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {tr.ircc_questionnaire_title}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {tr.ircc_questionnaire_description}
        </p>
      </div>

      <IRCCQuestionnaire
        formCodes={formCodes}
        existingProfile={existingProfile}
        onSave={handleSave}
        onComplete={handleComplete}
        prebuiltQuestionnaire={dbQuestionnaire}
      />
    </div>
  )
}
