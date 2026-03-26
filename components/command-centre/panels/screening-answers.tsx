'use client'

import { useMemo, useState } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useLeadIntakeSubmission, useIntakeForms } from '@/lib/queries/intake-forms'
import { useContactCheckIns } from '@/lib/queries/check-ins'
import { useTenant } from '@/lib/hooks/use-tenant'
import { ScreeningAnswersPanel } from '@/components/shared/screening-answers-panel'
import type { KioskQuestion } from '@/lib/types/kiosk-question'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  ClipboardList,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Tablet,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────

interface IntakeField {
  id: string
  field_type: string
  label: string
  sort_order: number
  mapping?: string
  allow_other?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ' - '

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'string') {
    if (value.startsWith('__other__:')) return `Other: ${value.replace('__other__:', '')}`
    return value
  }

  if (typeof value === 'number') return String(value)

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string' && v.startsWith('__other__:')) {
          return `Other: ${v.replace('__other__:', '')}`
        }
        return String(v)
      })
      .join(', ')
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.selected === '__other__' && obj.custom) {
      return `Other: ${obj.custom}`
    }
    return JSON.stringify(value)
  }

  return String(value)
}

function getSourceLabel(submission: { user_agent?: string | null; source_ip?: string | null; utm_source?: string | null }): string {
  if (submission.utm_source) return submission.utm_source
  if (submission.user_agent?.includes('iPad') || submission.user_agent?.includes('Macintosh')) return 'iPad / In-Office'
  if (submission.user_agent?.includes('Mobile')) return 'Mobile Web'
  return 'Web Form'
}

// ─── Component ──────────────────────────────────────────────────────

export function ScreeningAnswers() {
  const { entityId, tenantId, contact, lead } = useCommandCentre()
  const { tenant } = useTenant()

  // ── Front desk screening answers (custom_intake_data on lead) ─
  const frontDeskIntakeData = (lead?.custom_intake_data ?? null) as Record<string, unknown> | null

  // ── Intake form submission (web/portal) ───────────────────────
  const { data: submission, isLoading: intakeLoading } = useLeadIntakeSubmission(entityId)
  const { data: intakeForms } = useIntakeForms(tenantId)

  // ── Kiosk check-in answers ────────────────────────────────────
  const contactId = contact?.id ?? ''
  const { data: checkIns, isLoading: checkInsLoading } = useContactCheckIns(contactId)

  // ── Kiosk question definitions from tenant settings ───────────
  const kioskQuestionMap = useMemo(() => {
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>
    const kioskConfig = (settings.kiosk_config ?? {}) as Record<string, unknown>
    const questions = (kioskConfig.kiosk_questions ?? []) as KioskQuestion[]
    return new Map(questions.map((q) => [q.id, q]))
  }, [tenant?.settings])

  const isLoading = intakeLoading || checkInsLoading

  // Does the lead have front desk intake answers?
  const hasFrontDeskAnswers = !!(
    frontDeskIntakeData &&
    Object.keys(frontDeskIntakeData).length > 0
  )

  const [frontDeskExpanded, setFrontDeskExpanded] = useState(false)
  const [intakeExpanded, setIntakeExpanded] = useState(false)
  const [kioskExpanded, setKioskExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // Parse fields from the intake form
  const fields = useMemo(() => {
    if (!submission?.intake_forms?.fields) return []
    const raw = submission.intake_forms.fields as IntakeField[]
    if (!Array.isArray(raw)) return []
    return [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [submission])

  const submissionData = useMemo(() => {
    if (!submission?.data) return {} as Record<string, unknown>
    return submission.data as Record<string, unknown>
  }, [submission])

  // ── Parse kiosk answers from ALL completed check-ins ──
  const checkInsWithAnswers = useMemo(() => {
    if (!checkIns?.length) return []
    return checkIns
      .map((ci) => {
        const meta = (ci.metadata ?? {}) as Record<string, unknown>
        const answers = (meta.answers ?? {}) as Record<string, unknown>
        const filteredAnswers = Object.entries(answers).filter(([key]) => !key.startsWith('_'))
        return { ...ci, kioskAnswers: filteredAnswers }
      })
      .filter((ci) => ci.kioskAnswers.length > 0)
  }, [checkIns])

  // For backward compat  -  use the latest check-in that has answers
  const latestCheckIn = checkInsWithAnswers[0] ?? null
  const kioskAnswers = latestCheckIn?.kioskAnswers ?? []

  const hasKioskAnswers = checkInsWithAnswers.length > 0
  const hasIntakeSubmission = !!submission

  // Total question count for badge (front desk + kiosk + intake form)
  const frontDeskAnswerCount = hasFrontDeskAnswers ? Object.keys(frontDeskIntakeData!).length : 0
  const totalQuestions = frontDeskAnswerCount + (hasIntakeSubmission ? fields.length : 0) + kioskAnswers.length

  // Generate screening link
  const screeningLink = useMemo(() => {
    if (!intakeForms?.length) return null
    const activeForm = intakeForms.find((f) => f.status === 'published')
    if (!activeForm) return null
    const params = new URLSearchParams()
    if (entityId) params.set('lead_id', entityId)
    if (contact?.email_primary) params.set('prefill_email', contact.email_primary)
    return `/intake/${activeForm.slug}${params.toString() ? `?${params.toString()}` : ''}`
  }, [intakeForms, entityId, contact])

  const handleCopyLink = () => {
    if (!screeningLink) return
    const fullUrl = `${window.location.origin}${screeningLink}`
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      toast.success('Screening link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <ClipboardList className="h-4 w-4" />
            Screening Questions
            {totalQuestions > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {totalQuestions}
              </Badge>
            )}
          </CardTitle>
          {screeningLink && !hasIntakeSubmission && !hasKioskAnswers && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleCopyLink}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {/* ── Front Desk Intake Answers (custom_intake_data) ─────── */}
        {!isLoading && hasFrontDeskAnswers && (
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 w-full"
              onClick={() => setFrontDeskExpanded(!frontDeskExpanded)}
            >
              {frontDeskExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200 ml-0.5">
                Front Desk Intake
              </Badge>
              <span className="text-[10px] text-slate-400 ml-auto">{frontDeskAnswerCount} answers</span>
            </button>

            {frontDeskExpanded && (
              <div className="-mx-1">
                <ScreeningAnswersPanel
                  customIntakeData={frontDeskIntakeData}
                  defaultCollapsed={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Separator between front desk and other sources */}
        {!isLoading && hasFrontDeskAnswers && (hasKioskAnswers || hasIntakeSubmission) && (
          <Separator className="my-3" />
        )}

        {/* No data at all */}
        {!isLoading && !hasFrontDeskAnswers && !hasIntakeSubmission && !hasKioskAnswers && (
          <div className="text-center py-6">
            <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No screening form submitted</p>
            {screeningLink && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={handleCopyLink}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy Screening Link'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  asChild
                >
                  <a href={screeningLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                    Open Form
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Kiosk Check-In Answers ───────────────────────────── */}
        {!isLoading && hasKioskAnswers && (
          <div className="space-y-3">
            {/* Toggle kiosk answers */}
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
              onClick={() => setKioskExpanded(!kioskExpanded)}
            >
              {kioskExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {kioskExpanded ? 'Hide Kiosk Answers' : 'Show Kiosk Answers'}
            </button>

            {/* All check-in sessions with answers */}
            {kioskExpanded && checkInsWithAnswers.map((ci, idx) => (
              <div key={ci.id} className="space-y-2">
                {/* Session header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] gap-1 bg-purple-50 text-purple-700 border-purple-200">
                      <Tablet className="h-2.5 w-2.5" />
                      {idx === 0 ? 'Latest Check-In' : 'Previous Check-In'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {ci.kioskAnswers.length} answers
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatDate(ci.completed_at ?? ci.created_at)}
                  </span>
                </div>

                {/* Answer rows */}
                {ci.kioskAnswers.map(([qId, val]) => {
                  const question = kioskQuestionMap.get(qId)
                  const displayValue = formatFieldValue(val)

                  return (
                    <div
                      key={`${ci.id}-${qId}`}
                      className="rounded-md border border-purple-100 bg-purple-50/30 px-3 py-2 space-y-0.5"
                    >
                      <p className="text-[11px] font-medium text-slate-500 leading-snug">
                        {question?.label ?? qId}
                      </p>
                      <p className={cn(
                        'text-xs text-slate-800 break-words font-medium',
                        displayValue === ' - ' && 'text-slate-400 font-normal'
                      )}>
                        {displayValue}
                      </p>
                    </div>
                  )
                })}

                {/* Separator between check-ins */}
                {idx < checkInsWithAnswers.length - 1 && (
                  <Separator className="my-2" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Separator if both sources have data */}
        {!isLoading && hasKioskAnswers && hasIntakeSubmission && (
          <Separator className="my-3" />
        )}

        {/* ── Intake Form Submission ───────────────────────────── */}
        {!isLoading && hasIntakeSubmission && (
          <div className="space-y-3">
            {/* Submission meta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {submission.intake_forms?.name ?? 'Screening Form'}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {getSourceLabel(submission)}
                </Badge>
              </div>
              <span className="text-[10px] text-slate-400">
                {formatDate(submission.created_at)}
              </span>
            </div>

            {/* Toggle intake answers */}
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
              onClick={() => setIntakeExpanded(!intakeExpanded)}
            >
              {intakeExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {intakeExpanded ? 'Hide Answers' : 'Show Answers'}
            </button>

            {/* Intake form fields & answers */}
            {intakeExpanded && (
              <div className="space-y-2">
                {fields.map((field) => {
                  const value = submissionData[field.id]
                  const displayValue = formatFieldValue(value)

                  // Skip file fields
                  if (field.field_type === 'file') return null

                  return (
                    <div
                      key={field.id}
                      className="rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2 space-y-0.5"
                    >
                      <p className="text-[11px] font-medium text-slate-500 leading-snug">
                        {field.label}
                      </p>
                      <p className={cn(
                        'text-xs text-slate-800 break-words font-medium',
                        displayValue === ' - ' && 'text-slate-400 font-normal'
                      )}>
                        {displayValue}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Copy link (shown when any data exists) */}
        {!isLoading && (hasIntakeSubmission || hasKioskAnswers) && screeningLink && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-slate-400 h-7"
              onClick={handleCopyLink}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy Screening Link'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
