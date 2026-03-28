'use client'

/**
 * IntakeWizardPanel  -  v2
 *
 * Interactive intake session for leads. One question at a time, conversational UI.
 *
 * v2 improvements:
 *  - Two-column layout: question on left, live answer log on right
 *  - "Why are we asking this?" expandable help section per question
 *  - "Help me figure this out" button for questions with a not_sure option
 *  - Fixed progress: shows "Step X" + "Y answers recorded"  -  never "X of 27"
 *  - Answer sidebar shows ALL recorded answers in real-time (not just last 4)
 *  - Completed state shows accurate count without false denominator
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { leadKeys } from '@/lib/queries/leads'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Briefcase,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Loader2,
  RotateCcw,
  ChevronRight,
  TrendingUp,
  Clock,
  AlertTriangle,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from 'lucide-react'
import {
  INTAKE_QUESTIONS,
  FIRST_QUESTION_ID,
  getQuestion,
  getNextQuestionId,
  generateRecommendations,
  type IntakeQuestion,
  type IntakeAnswers,
  type IntakeRecommendation,
} from '@/lib/config/intake-questions'

type WizardState = 'idle' | 'active' | 'completed'

// ─── Public wrapper ──────────────────────────────────────────────────────────

export function IntakeWizardPanel() {
  const { lead, tenantId, entityType } = useCommandCentre()
  const { data: matterTypes } = useMatterTypes(tenantId, lead?.practice_area_id || undefined)

  if (entityType !== 'lead' || !lead) return null

  // Resolve current matter type name for recommendation filtering
  const selectedMatterType = matterTypes?.find((m) => m.id === lead.matter_type_id)

  return (
    <IntakeWizardInner
      leadId={lead.id}
      tenantId={tenantId}
      existingAnswers={(lead.custom_fields as IntakeAnswers | null) ?? {}}
      matterTypeName={selectedMatterType?.name ?? null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matterTypeConfig={(selectedMatterType?.matter_type_config ?? null) as Record<string, any> | null}
    />
  )
}

// ─── Inner component ─────────────────────────────────────────────────────────

function IntakeWizardInner({
  leadId,
  tenantId: _tenantId,
  existingAnswers,
  matterTypeName,
  matterTypeConfig,
}: {
  leadId: string
  tenantId: string
  existingAnswers: IntakeAnswers
  matterTypeName: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matterTypeConfig: Record<string, any> | null
}) {
  const queryClient = useQueryClient()

  const [wizardState, setWizardState] = useState<WizardState>(() => {
    const hasAnswers = Object.keys(existingAnswers).some((k) =>
      INTAKE_QUESTIONS.some((q) => q.saveAs === k)
    )
    return hasAnswers ? 'completed' : 'idle'
  })

  const [answers, setAnswers]                       = useState<IntakeAnswers>(existingAnswers)
  const [history, setHistory]                       = useState<string[]>([])
  const [currentQuestionId, setCurrentQuestionId]   = useState<string>(FIRST_QUESTION_ID)
  const [currentInput, setCurrentInput]             = useState<string>('')
  const [isSaving, setIsSaving]                     = useState(false)
  const [showWhy, setShowWhy]                       = useState(false)

  // Reset "Why" panel whenever we move to a new question
  useEffect(() => { setShowWhy(false) }, [currentQuestionId])

  const currentQuestion = useMemo(() => getQuestion(currentQuestionId), [currentQuestionId])

  // All questions that have been answered (in definition order for sidebar)
  const answeredQuestions = useMemo(
    () => INTAKE_QUESTIONS.filter((q) => answers[q.saveAs] !== undefined),
    [answers]
  )
  const answeredCount = answeredQuestions.length
  const stepNumber    = history.length + 1

  // ── Helpers ────────────────────────────────────────────────────
  function getDisplayValue(q: IntakeQuestion): string {
    const raw = answers[q.saveAs]
    const val = Array.isArray(raw) ? raw.join(', ') : (raw ?? '')
    const matched = q.options?.find((o) => o.value === val)
    return matched ? `${matched.emoji ?? ''} ${matched.label}`.trim() : val
  }

  function getShortLabel(q: IntakeQuestion): string {
    return q.question.replace(/\?$/, '').replace(/^What is the client's /, '').replace(/^What does the /, '').replace(/^How /, '').replace(/^Has the /, '').replace(/^Does the /, '').replace(/^Is there /, '')
  }

  // ── Auto-save ──────────────────────────────────────────────────
  const saveAnswers = useCallback(async (updated: IntakeAnswers) => {
    setIsSaving(true)
    try {
      const supabase = createClient()
      await (supabase.from('leads') as any)
        .update({ custom_fields: updated, updated_at: new Date().toISOString() })
        .eq('id', leadId)
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(leadId) })
    } catch (err) {
      console.error('[intake-wizard] Auto-save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [leadId, queryClient])

  // ── Navigation ─────────────────────────────────────────────────
  const answerSingle = useCallback(async (question: IntakeQuestion, value: string) => {
    const updated = { ...answers, [question.saveAs]: value }
    setAnswers(updated)
    await saveAnswers(updated)
    const nextId = getNextQuestionId(question, value)
    setHistory((h) => [...h, question.id])
    if (nextId === null) { setWizardState('completed') } else { setCurrentQuestionId(nextId); setCurrentInput('') }
  }, [answers, saveAnswers])

  const answerText = useCallback(async (question: IntakeQuestion) => {
    const value = currentInput.trim()
    if (!value && !question.optional) return
    const updated = value ? { ...answers, [question.saveAs]: value } : answers
    if (value) { setAnswers(updated); await saveAnswers(updated) }
    const nextId = question.nextId ?? null
    setHistory((h) => [...h, question.id])
    setCurrentInput('')
    if (nextId === null) { setWizardState('completed') } else { setCurrentQuestionId(nextId) }
  }, [answers, currentInput, saveAnswers])

  const skipQuestion = useCallback((question: IntakeQuestion) => {
    const nextId = question.nextId ?? null
    setHistory((h) => [...h, question.id])
    setCurrentInput('')
    if (nextId === null) { setWizardState('completed') } else { setCurrentQuestionId(nextId) }
  }, [])

  const goBack = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setCurrentQuestionId(prev)
    setCurrentInput('')
  }, [history])

  const startWizard = useCallback(() => {
    setCurrentQuestionId(FIRST_QUESTION_ID)
    setHistory([])
    setCurrentInput('')
    setWizardState('active')
  }, [])

  const restartWizard = useCallback(async () => {
    const cleared: IntakeAnswers = {}
    setAnswers(cleared)
    setHistory([])
    setCurrentInput('')
    setCurrentQuestionId(FIRST_QUESTION_ID)
    setWizardState('active')
    await saveAnswers(cleared)
  }, [saveAnswers])

  const recommendations = useMemo((): IntakeRecommendation[] => {
    if (wizardState !== 'completed') return []
    const recs = generateRecommendations(answers)

    // If a matter type is selected, boost matching recommendations and deprioritise non-matching ones
    if (matterTypeName && recs.length > 0) {
      const mtLower = matterTypeName.toLowerCase()
      // Build keyword set from the matter type name
      const mtKeywords = mtLower.split(/[\s - –\-/()]+/).filter((w) => w.length > 2)

      const scored = recs.map((rec) => {
        const titleLower = rec.title.toLowerCase()
        const codeLower = rec.code.toLowerCase()
        // Check if this recommendation matches the selected matter type
        const titleMatch = mtKeywords.some((kw) => titleLower.includes(kw) || codeLower.includes(kw))
        const nameInTitle = titleLower.includes(mtLower) || mtLower.includes(titleLower.split(' - ')[0].trim())
        return { rec, score: nameInTitle ? 2 : titleMatch ? 1 : 0 }
      })

      // Sort: matching recs first, then by original order
      scored.sort((a, b) => b.score - a.score)

      // Upgrade confidence for matching, downgrade for non-matching
      return scored.map(({ rec, score }) => ({
        ...rec,
        confidence: score > 0 ? 'strong' as const : rec.confidence === 'strong' ? 'possible' as const : rec.confidence,
      }))
    }

    return recs
  }, [wizardState, answers, matterTypeName])

  // ── Shared header ──────────────────────────────────────────────
  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-800">Interactive Intake</span>
        {wizardState === 'completed' && (
          <Badge variant="secondary" className="text-[10px] bg-emerald-950/30 text-emerald-400 border-emerald-500/20">
            Complete
          </Badge>
        )}
        {wizardState === 'active' && (
          <Badge variant="secondary" className="text-[10px] bg-blue-950/30 text-blue-400 border-blue-500/20">
            In Progress
          </Badge>
        )}
        {isSaving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </div>
      {wizardState !== 'idle' && (
        <button
          onClick={restartWizard}
          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
          title="Restart intake session"
        >
          <RotateCcw className="h-3 w-3" />
          Restart
        </button>
      )}
    </div>
  )

  // ──────────────────────────────────────────────────────────────
  // IDLE
  // ──────────────────────────────────────────────────────────────
  if (wizardState === 'idle') {
    return (
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4 space-y-3">
        {header}
        <p className="text-xs text-slate-500 leading-relaxed">
          Replace manual note-taking with a guided intake session. The system asks targeted questions,
          records all answers automatically, and recommends the right immigration route at the end.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Auto-saves every answer</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Live answer summary on the side</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Route recommendation at the end</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Billing arrangement confirmed</span>
        </div>
        <Button onClick={startWizard} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <Sparkles className="h-4 w-4" />
          Start Intake Session
        </Button>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────
  // COMPLETED
  // ──────────────────────────────────────────────────────────────
  if (wizardState === 'completed') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 space-y-2">
          {header}
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 bg-emerald-950/300 rounded-full w-full" />
          </div>
          <p className="text-[11px] text-slate-400">{answeredCount} {answeredCount === 1 ? 'answer' : 'answers'} recorded</p>
        </div>

        <Separator />

        {/* Answer summary  -  two columns */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Session Summary</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {answeredQuestions.map((q) => (
              <div key={q.saveAs} className="min-w-0">
                <p className="text-[10px] text-slate-400 truncate leading-tight">{q.question.replace(/\?$/, '')}</p>
                <p className="text-[11px] font-medium text-slate-700 truncate">{getDisplayValue(q)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Recommended Routes</p>
              </div>
              {recommendations.map((rec, i) => (
                <div
                  key={rec.code}
                  className={cn(
                    'rounded-lg border p-3 space-y-2',
                    i === 0 ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none">{rec.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{rec.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{rec.code}</p>
                      </div>
                    </div>
                    <ConfidenceBadge confidence={rec.confidence} />
                  </div>
                  {rec.rationale.length > 0 && (
                    <ul className="space-y-0.5">
                      {rec.rationale.map((r, ri) => (
                        <li key={ri} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                          <span className="text-slate-300 mt-0.5 shrink-0">→</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  {rec.processingTime && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>Processing: {rec.processingTime}</span>
                    </div>
                  )}
                  {rec.deadlineWarning && (
                    <div className="rounded border border-amber-200 bg-amber-950/30 px-2 py-1.5 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800 font-medium">{rec.deadlineWarning}</p>
                    </div>
                  )}
                </div>
              ))}
              {matterTypeName && (
                <div className="rounded border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 flex items-center gap-2">
                  <Briefcase className="h-3 w-3 text-indigo-500 shrink-0" />
                  <p className="text-[10px] text-indigo-700">
                    <span className="font-semibold">Selected matter type:</span> {matterTypeName}
                    {matterTypeConfig?.eligibility_summary && (
                      <span className="text-indigo-600">  -  {matterTypeConfig.eligibility_summary}</span>
                    )}
                  </p>
                </div>
              )}
              <p className="text-[10px] text-slate-400 italic leading-relaxed">
                ✦ Recommendations are rule-based and should be validated against current IRCC policy before advising the client.
              </p>
            </div>
          </>
        )}

        {recommendations.length === 0 && (
          <>
            <Separator />
            <div className="px-4 py-3 text-center space-y-2">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">
                Not enough information to generate a recommendation automatically.
                Review the answers above and consult the immigration playbooks.
              </p>
            </div>
          </>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────
  // ACTIVE  -  two-column layout
  // ──────────────────────────────────────────────────────────────
  if (!currentQuestion) {
    setWizardState('completed')
    return null
  }

  // Split options: regular options vs the "not_sure / figure it out" option
  const regularOptions  = currentQuestion.options?.filter((o) => o.value !== 'not_sure') ?? []
  const figureItOutOpt  = currentQuestion.options?.find((o) => o.value === 'not_sure')
  const previousAnswer  = answers[currentQuestion.saveAs]

  return (
    <div className="rounded-xl border border-blue-100 bg-white overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2.5 bg-gradient-to-r from-indigo-50/60 to-white space-y-2">
        {header}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, Math.min(95, (stepNumber / 14) * 100))}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
            Step {stepNumber} • {answeredCount} {answeredCount === 1 ? 'answer' : 'answers'} recorded
          </span>
        </div>
      </div>

      <Separator />

      {/* ── Two-column body ─────────────────────────────────────── */}
      <div className="flex min-h-0">

        {/* ── LEFT: Question area ─────────────────────────────── */}
        <div className="flex-1 min-w-0 px-4 py-4 space-y-3">

          {/* Back button */}
          {history.length > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}

          {/* Question text */}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 leading-snug">
              {currentQuestion.question}
            </p>
            {currentQuestion.subtext && (
              <p className="text-[11px] text-slate-500 leading-relaxed">{currentQuestion.subtext}</p>
            )}
          </div>

          {/* Why are we asking this? */}
          {currentQuestion.why && (
            <div>
              <button
                onClick={() => setShowWhy((s) => !s)}
                className="flex items-center gap-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Why are we asking this?</span>
                {showWhy ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showWhy && (
                <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
                  <p className="text-[11px] text-indigo-800 leading-relaxed">{currentQuestion.why}</p>
                </div>
              )}
            </div>
          )}

          {/* Single-select options */}
          {currentQuestion.type === 'single' && regularOptions.length > 0 && (
            <div className="space-y-1.5">
              {regularOptions.map((opt) => {
                const isSelected = previousAnswer === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => answerSingle(currentQuestion, opt.value)}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2.5 transition-all',
                      'hover:border-indigo-300 hover:bg-indigo-50/50',
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {opt.emoji && (
                        <span className="text-base leading-none shrink-0">{opt.emoji}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-sm font-medium leading-tight',
                          isSelected ? 'text-indigo-700' : 'text-slate-800'
                        )}>
                          {opt.label}
                        </p>
                        {opt.hint && (
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.hint}</p>
                        )}
                      </div>
                      {isSelected
                        ? <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Text / Date / Number input */}
          {(currentQuestion.type === 'text' || currentQuestion.type === 'date' || currentQuestion.type === 'number') && (
            <div className="space-y-2">
              <Input
                type={currentQuestion.type === 'number' ? 'number' : currentQuestion.type === 'date' ? 'date' : 'text'}
                value={currentInput || (previousAnswer as string) || ''}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder={currentQuestion.placeholder}
                min={currentQuestion.min?.toString()}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => answerText(currentQuestion)}
                  disabled={!currentInput.trim() && !currentQuestion.optional}
                  className="flex-1 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                {currentQuestion.optional && (
                  <Button
                    variant="ghost"
                    onClick={() => skipQuestion(currentQuestion)}
                    className="text-xs text-slate-400"
                  >
                    Skip
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Help me figure this out  -  only if not_sure option exists */}
          {figureItOutOpt && (
            <button
              onClick={() => answerSingle(currentQuestion, figureItOutOpt.value)}
              className={cn(
                'w-full text-left rounded-lg border-2 border-dashed px-3 py-2.5 transition-all',
                'hover:border-indigo-300 hover:bg-indigo-50/40',
                previousAnswer === figureItOutOpt.value
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base leading-none shrink-0">🤔</span>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-sm font-medium leading-tight',
                    previousAnswer === figureItOutOpt.value ? 'text-indigo-700' : 'text-slate-500'
                  )}>
                    Help me figure this out
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    The system will factor your other answers into the recommendation
                  </p>
                </div>
                {previousAnswer === figureItOutOpt.value
                  ? <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  : <HelpCircle className="h-4 w-4 text-slate-300 shrink-0" />
                }
              </div>
            </button>
          )}

        </div>

        {/* ── RIGHT: Live answers sidebar ────────────────────── */}
        {answeredCount > 0 && (
          <div className="w-48 shrink-0 border-l border-slate-100 bg-slate-50/60 flex flex-col">
            <div className="px-3 pt-3 pb-1.5 flex items-center gap-1.5">
              <ListChecks className="h-3 w-3 text-slate-400 shrink-0" />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Recorded
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5">
              {answeredQuestions.map((q) => (
                <div key={q.saveAs} className="space-y-0.5">
                  <p className="text-[9px] text-slate-400 leading-tight uppercase tracking-wide truncate">
                    {getShortLabel(q)}
                  </p>
                  <p className="text-[11px] font-medium text-slate-700 leading-tight">
                    {getDisplayValue(q)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Confidence badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: 'strong' | 'likely' | 'possible' }) {
  const config = {
    strong:   { label: 'Strong match', className: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' },
    likely:   { label: 'Likely match', className: 'bg-blue-950/30 text-blue-400 border-blue-500/20' },
    possible: { label: 'Possible',     className: 'bg-amber-950/30 text-amber-400 border-amber-200' },
  }[confidence]

  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0',
      config.className
    )}>
      <TrendingUp className="h-2.5 w-2.5" />
      {config.label}
    </span>
  )
}
