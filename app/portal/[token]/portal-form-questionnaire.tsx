'use client'

/**
 * PortalFormQuestionnaire — Single-form questionnaire wrapper.
 *
 * Fetches sections for ONE form from the DB engine, then renders the
 * existing IRCCQuestionnaire component with prebuiltQuestionnaire.
 * Save/complete operations target the per-form save endpoint. Title shows formName only.
 */

import { useState, useEffect, useCallback } from 'react'
import { IRCCQuestionnaire } from '@/components/ircc/ircc-questionnaire'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import {
  getTranslations,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface PortalFormQuestionnaireProps {
  token: string
  formId: string
  formCode: string
  formName: string
  primaryColor?: string
  language?: PortalLocale
  readOnly?: boolean
  onBack: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalFormQuestionnaire({
  token,
  formId,
  formCode,
  formName,
  primaryColor,
  language = 'en',
  readOnly = false,
  onBack,
}: PortalFormQuestionnaireProps) {
  const tr = getTranslations(language)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [questionnaire, setQuestionnaire] = useState<any>(null)
  const [existingProfile, setExistingProfile] = useState<Partial<IRCCProfile>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)

  // ── Fetch single-form sections ────────────────────────────────────────────

  useEffect(() => {
    async function fetchSections() {
      try {
        // Fetch sections for this single form
        const res = await fetch(
          `/api/portal/${token}/ircc-forms/${formId}/sections`,
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Request failed (${res.status})`)
        }
        const json = await res.json()
        setQuestionnaire(json)

        // Also fetch the current profile for pre-filling
        const profileRes = await fetch(`/api/portal/${token}/ircc-questionnaire`)
        if (profileRes.ok) {
          const profileJson = await profileRes.json()
          if (profileJson.profile) {
            setExistingProfile(profileJson.profile as Partial<IRCCProfile>)
          }
        }
      } catch (err) {
        console.error('[portal-form-questionnaire] Fetch error:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to load form sections',
        )
      } finally {
        setIsLoading(false)
      }
    }

    fetchSections()
  }, [token, formId])

  // ── Auto-save on step navigation ──────────────────────────────────────────

  const handleSave = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      try {
        const res = await fetch(
          `/api/portal/${token}/ircc-forms/${formId}/save`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile }),
          },
        )
        if (!res.ok) {
          console.error('[portal-form-questionnaire] Save failed:', res.status)
        }
      } catch (err) {
        console.error('[portal-form-questionnaire] Save error:', err)
      }
    },
    [token, formId],
  )

  // ── Complete this form ────────────────────────────────────────────────────

  const handleComplete = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      try {
        const res = await fetch(
          `/api/portal/${token}/ircc-forms/${formId}/save`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, complete: true }),
          },
        )
        if (!res.ok) {
          console.error(
            '[portal-form-questionnaire] Complete failed:',
            res.status,
          )
          return
        }

        const json = await res.json()
        track('portal_form_completed', {
          form_id: formId,
          form_code: formCode,
          all_completed: json.overall?.all_completed ?? false,
        })

        setIsCompleted(true)

        // Return to form list after brief delay so user sees the completion
        setTimeout(() => {
          onBack()
        }, 1200)
      } catch (err) {
        console.error('[portal-form-questionnaire] Complete error:', err)
      }
    },
    [token, formId, formCode, onBack],
  )

  // ── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} primaryColor={primaryColor} />
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-slate-400"
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
      </div>
    )
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} primaryColor={primaryColor} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">{tr.ircc_error_title}</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  // ── Completion State ──────────────────────────────────────────────────────

  if (isCompleted) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} primaryColor={primaryColor} />
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-green-800">
            {formCode} Completed
          </h3>
          <p className="mt-1 text-sm text-green-700">
            Your responses for {formName} have been saved. Returning to form list...
          </p>
        </div>
      </div>
    )
  }

  // ── Active Questionnaire ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Back button + form header */}
      <BackButton onBack={onBack} primaryColor={primaryColor} />

      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {formName}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {readOnly
            ? 'Viewing submitted responses (read-only).'
            : 'Please complete all fields below. Your progress is saved automatically.'}
        </p>
      </div>

      <IRCCQuestionnaire
        formCodes={[formCode]}
        existingProfile={existingProfile}
        onSave={handleSave}
        onComplete={handleComplete}
        readOnly={readOnly}
        prebuiltQuestionnaire={questionnaire}
      />
    </div>
  )
}

// ── Back Button ─────────────────────────────────────────────────────────────

function BackButton({
  onBack,
  primaryColor,
}: {
  onBack: () => void
  primaryColor?: string
}) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
      style={{ color: primaryColor || '#3b82f6' }}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to Forms
    </button>
  )
}
