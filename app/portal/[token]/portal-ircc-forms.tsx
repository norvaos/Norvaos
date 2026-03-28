'use client'

/**
 * PortalIRCCForms  -  Form-based IRCC portal questionnaire.
 *
 * Two views:
 *   1. Form List  -  shows all configured forms as cards with per-form progress
 *   2. Form Questionnaire  -  single-form questionnaire (delegates to PortalFormQuestionnaire)
 *
 * Replaces the old PortalIRCCQuestionnaire which merged all forms into one mixed flow.
 * Updated: form-level completion check, normalized display codes, per-form readOnly.
 */

import { useState, useEffect, useCallback } from 'react'
import { PortalFormQuestionnaire } from './portal-form-questionnaire'
import {
  getTranslations,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface FormListItem {
  form_id: string
  form_code: string
  form_name: string
  sort_order: number
  is_required: boolean
  status: 'not_started' | 'in_progress' | 'completed'
  progress_percent: number
  filled_fields: number
  total_fields: number
  completed_at: string | null
  last_saved_at: string | null
}

interface OverallProgress {
  total_forms: number
  completed_forms: number
  overall_progress_percent: number
}

interface FormListResponse {
  forms: FormListItem[]
  overall: OverallProgress
  session_status: string | null
}

interface PortalIRCCFormsProps {
  token: string
  primaryColor?: string
  language?: PortalLocale
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalIRCCForms({
  token,
  primaryColor,
  language = 'en',
}: PortalIRCCFormsProps) {
  const tr = getTranslations(language)

  // State
  const [view, setView] = useState<'list' | 'form'>('list')
  const [selectedForm, setSelectedForm] = useState<FormListItem | null>(null)
  const [forms, setForms] = useState<FormListItem[]>([])
  const [overall, setOverall] = useState<OverallProgress>({
    total_forms: 0,
    completed_forms: 0,
    overall_progress_percent: 0,
  })
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit request state (for completed questionnaires)
  const [hasPendingEditRequest, setHasPendingEditRequest] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSubmitted, setEditSubmitted] = useState(false)

  // ── Fetch form list ───────────────────────────────────────────────────────

  const fetchFormList = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/ircc-forms`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      const json = (await res.json()) as FormListResponse
      setForms(json.forms)
      setOverall(json.overall)
      setSessionStatus(json.session_status)

      // Check for edit request if session is completed
      if (json.session_status === 'completed') {
        fetchEditRequestStatus()
      }
    } catch (err) {
      console.error('[portal-ircc-forms] Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load forms')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  const fetchEditRequestStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/questionnaire-edit-request`)
      if (res.ok) {
        const json = await res.json()
        setHasPendingEditRequest(json.hasPendingRequest)
      }
    } catch {
      // Non-critical
    }
  }, [token])

  useEffect(() => {
    fetchFormList()
  }, [fetchFormList])

  // ── Open a form ───────────────────────────────────────────────────────────

  const handleOpenForm = useCallback((form: FormListItem) => {
    setSelectedForm(form)
    setView('form')
    track('portal_form_opened', {
      form_id: form.form_id,
      form_code: form.form_code,
      status: form.status,
    })
  }, [])

  // ── Return from form to list ──────────────────────────────────────────────

  const handleBackToList = useCallback(() => {
    setView('list')
    setSelectedForm(null)
    // Refresh form list to show updated progress
    setIsLoading(true)
    fetchFormList()
  }, [fetchFormList])

  // ── Submit edit request ───────────────────────────────────────────────────

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

  // ── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 animate-spin"
            style={{ color: primaryColor || '#3b82f6' }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm text-slate-500">{tr.ircc_loading}</span>
        </div>
      </div>
    )
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20/60 bg-gradient-to-br from-red-50 to-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-950/40 shadow-sm">
          <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-red-400">{tr.ircc_error_title}</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  // ── No forms configured ───────────────────────────────────────────────────

  if (forms.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50 to-white p-6 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 shadow-sm">
          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-slate-700">No questionnaire available</p>
        <p className="mt-1 text-sm text-slate-500">
          Your legal team has not configured a questionnaire for this matter yet. Please check back later.
        </p>
      </div>
    )
  }

  // ── Single Form View ──────────────────────────────────────────────────────

  if (view === 'form' && selectedForm) {
    return (
      <PortalFormQuestionnaire
        token={token}
        formId={selectedForm.form_id}
        formCode={selectedForm.form_code}
        formName={selectedForm.form_name}
        primaryColor={primaryColor}
        language={language}
        readOnly={selectedForm.status === 'completed'}
        onBack={handleBackToList}
      />
    )
  }

  // ── Form List View ────────────────────────────────────────────────────────

  // Determine completion from actual per-form status, not legacy session status
  const allFormsCompleted = forms.length > 0 && forms.every((f) => f.status === 'completed')
  const allCompleted = allFormsCompleted
  const firstIncomplete = forms.find((f) => f.status !== 'completed')

  return (
    <div className="space-y-4">
      {/* Overall progress header */}
      <div
        className="rounded-2xl border border-slate-200/60 p-4 backdrop-blur-sm"
        style={{
          background: `linear-gradient(135deg, white 0%, ${primaryColor || '#3b82f6'}06 50%, white 100%)`,
          boxShadow: `0 4px 20px ${primaryColor || '#3b82f6'}08, 0 1px 3px rgba(0,0,0,0.04)`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            IRCC Forms
          </h3>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: `${primaryColor || '#3b82f6'}10`, color: primaryColor || '#3b82f6' }}
          >
            {overall.completed_forms} of {overall.total_forms} completed
          </span>
        </div>

        {/* Overall progress bar */}
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${overall.overall_progress_percent}%`,
              background: allCompleted
                ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                : `linear-gradient(90deg, ${primaryColor || '#3b82f6'}, ${primaryColor || '#3b82f6'}cc)`,
              boxShadow: allCompleted
                ? '0 0 8px rgba(22,163,106,0.3)'
                : `0 0 8px ${primaryColor || '#3b82f6'}30`,
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500 font-medium">
          {allCompleted
            ? 'All forms have been completed and submitted.'
            : `Overall progress: ${overall.overall_progress_percent}%`}
        </p>
      </div>

      {/* Form cards */}
      <div className="space-y-3">
        {forms.map((form) => (
          <FormCard
            key={form.form_id}
            form={form}
            isNext={firstIncomplete?.form_id === form.form_id && !allCompleted}
            primaryColor={primaryColor}
            onOpen={() => handleOpenForm(form)}
          />
        ))}
      </div>

      {/* Next form indicator */}
      {!allCompleted && firstIncomplete && (
        <p className="text-xs text-slate-500 text-center">
          Next: Complete &ldquo;{firstIncomplete.form_code.replace(/^(IMM)\s?(\d{4,5})\w?$/i, '$1 $2')} &mdash; {firstIncomplete.form_name}&rdquo;
        </p>
      )}

      {/* All completed  -  Edit request section */}
      {allCompleted && (
        <div className="pt-4">
          {/* Completed banner */}
          <div className="rounded-2xl border border-emerald-500/20/60 bg-gradient-to-br from-emerald-50 to-white p-5 text-center mb-4 shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950/40 shadow-sm">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-emerald-400">
              {tr.ircc_submitted_title}
            </h3>
            <p className="mt-1 text-xs text-emerald-400">
              {tr.ircc_submitted_message}
            </p>
          </div>

          {/* Edit request */}
          {hasPendingEditRequest || editSubmitted ? (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {tr.ircc_edit_request_pending ?? 'Edit request pending. Your legal team has been notified.'}
            </p>
          ) : showEditForm ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {tr.ircc_edit_request_title ?? 'Need to make changes?'}
              </p>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value.slice(0, 500))}
                placeholder={tr.ircc_edit_request_placeholder ?? 'Tell your legal team what needs to change'}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 resize-none"
                rows={3}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{editReason.length}/500</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowEditForm(false); setEditReason('') }}
                    className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {tr.ircc_edit_request_cancel ?? 'Cancel'}
                  </button>
                  <button
                    onClick={handleSubmitEditRequest}
                    disabled={!editReason.trim() || editSubmitting}
                    className="rounded-xl px-4 py-1.5 text-xs font-bold text-white transition-all disabled:opacity-40 shadow-sm hover:brightness-110"
                    style={{ background: `linear-gradient(135deg, ${primaryColor || '#2563eb'}, ${primaryColor || '#2563eb'}dd)` }}
                  >
                    {editSubmitting
                      ? (tr.ircc_edit_request_sending ?? 'Sending...')
                      : (tr.ircc_edit_request_submit ?? 'Send Request')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-slate-600">
                {tr.ircc_edit_request_title ?? 'Need to make changes?'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr.ircc_edit_request_description ?? 'If you need to update your answers, submit a request to your legal team.'}
              </p>
              <button
                onClick={() => setShowEditForm(true)}
                className="mt-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all hover:shadow-sm"
              >
                {tr.ircc_edit_request_button ?? 'Request Changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Form Card Component ─────────────────────────────────────────────────────

function FormCard({
  form,
  isNext,
  primaryColor,
  onOpen,
}: {
  form: FormListItem
  isNext: boolean
  primaryColor?: string
  onOpen: () => void
}) {
  const isCompleted = form.status === 'completed'
  const isInProgress = form.status === 'in_progress'

  // Normalize form code for display: "IMM5257E" → "IMM 5257", "IMM 5707" stays as is
  const displayCode = form.form_code.replace(/^(IMM)\s?(\d{4,5})\w?$/i, '$1 $2')

  // Status badge
  const statusConfig = isCompleted
    ? { icon: '✓', label: 'Completed', className: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20/60' }
    : isInProgress
      ? { icon: '●', label: `In Progress  -  ${form.progress_percent}%`, className: 'bg-blue-950/30 text-blue-400 border-blue-500/20/60' }
      : { icon: '○', label: 'Not Started', className: 'bg-slate-50 text-slate-500 border-slate-200/60' }

  // Action button
  const actionLabel = isCompleted ? 'Review' : isInProgress ? 'Continue' : 'Start'

  const accent = primaryColor || '#3b82f6'

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-slate-200/60 p-4 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] backdrop-blur-sm"
      style={{
        background: isCompleted
          ? 'linear-gradient(135deg, #ecfdf5 0%, white 100%)'
          : isNext
            ? `linear-gradient(135deg, ${accent}06 0%, white 100%)`
            : 'linear-gradient(135deg, #f8fafc 0%, white 100%)',
        borderLeftWidth: '3px',
        borderLeftColor: isCompleted ? '#10b981' : isNext ? accent : '#e2e8f0',
        boxShadow: isNext ? `0 4px 16px ${accent}10` : isCompleted ? '0 4px 12px rgba(16,185,129,0.06)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Form title */}
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
              style={{
                backgroundColor: isCompleted ? '#ecfdf5' : `${accent}10`,
                color: isCompleted ? '#10b981' : accent,
              }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {isCompleted
                  ? <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>
                  : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
                }
              </svg>
            </div>
            <h4 className="text-sm font-bold text-slate-900 truncate tracking-tight">
              {displayCode}
            </h4>
            {isNext && !isCompleted && (
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
              >
                Next
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 truncate ml-9">{form.form_name}</p>

          {/* Status badge */}
          <div className="mt-2.5 flex items-center gap-2 ml-9">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusConfig.className}`}>
              <span className="text-[10px]">{statusConfig.icon}</span>
              {statusConfig.label}
            </span>
          </div>

          {/* Field count + progress bar for in-progress */}
          <div className="mt-2 ml-9">
            <p className="text-[11px] text-slate-400 font-medium">
              {form.filled_fields} of {form.total_fields} fields
              {isCompleted && form.completed_at && (
                <> &middot; Completed {new Date(form.completed_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</>
              )}
            </p>
            {isInProgress && (
              <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${form.progress_percent}%`,
                    background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                    boxShadow: `0 0 6px ${accent}25`,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0 flex items-center">
          <span
            className="inline-flex items-center gap-1 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm"
            style={{
              color: isCompleted ? '#10b981' : accent,
              backgroundColor: isCompleted ? '#ecfdf5' : `${accent}10`,
            }}
          >
            {actionLabel}
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </div>
      </div>
    </button>
  )
}
