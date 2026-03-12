'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import { evaluateCondition } from '@/lib/utils/condition-evaluator'
import type { PortalLocale } from '@/lib/utils/portal-translations'
import type { KioskQuestion } from '@/lib/types/kiosk-question'

interface KioskQuestionsProps {
  questions: KioskQuestion[]
  locale: PortalLocale
  primaryColor: string
  onComplete: (answers: Record<string, unknown>) => void
  onBack: () => void
}

/**
 * Dynamic check-in questions step for the kiosk.
 *
 * Renders configured questions based on field_type with touch-optimised UI:
 * - select: large radio card buttons
 * - multi_select: checkable card buttons
 * - text/textarea: large touch inputs
 * - boolean: Yes/No buttons
 *
 * Supports conditional visibility via `evaluateCondition()` and
 * per-locale translations. Always shows "Additional Comments" textarea
 * at the bottom (hardcoded, translated via kiosk translations).
 */
export function KioskQuestions({
  questions,
  locale,
  primaryColor,
  onComplete,
  onBack,
}: KioskQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [additionalComments, setAdditionalComments] = useState('')
  const t = getKioskTranslations(locale)

  // Sort questions by sort_order
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.sort_order - b.sort_order),
    [questions],
  )

  // Filter visible questions based on conditions
  const visibleQuestions = useMemo(
    () => sortedQuestions.filter((q) => evaluateCondition(q.condition, answers)),
    [sortedQuestions, answers],
  )

  // Resolve translated label/description/placeholder/options for a question
  function resolve(q: KioskQuestion) {
    const localeOverride = q.translations?.[locale]
    return {
      label: localeOverride?.label ?? q.label,
      description: localeOverride?.description ?? q.description,
      placeholder: localeOverride?.placeholder ?? q.placeholder,
      options: localeOverride?.options ?? q.options ?? [],
    }
  }

  function setValue(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  // Validate required fields
  const isValid = useMemo(() => {
    for (const q of visibleQuestions) {
      if (!q.is_required) continue
      const val = answers[q.id]
      if (val === undefined || val === null || val === '') return false
      if (Array.isArray(val) && val.length === 0) return false
    }
    return true
  }, [visibleQuestions, answers])

  function handleSubmit() {
    const finalAnswers = { ...answers }
    if (additionalComments.trim()) {
      finalAnswers._additional_comments = additionalComments.trim()
    }
    onComplete(finalAnswers)
  }

  // If no questions configured, skip immediately
  if (sortedQuestions.length === 0) {
    onComplete({})
    return null
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">
          {t.questions_title}
        </h2>
        <p className="text-slate-600 mt-2">
          {t.questions_subtitle}
        </p>
      </div>

      <div className="w-full space-y-6">
        {visibleQuestions.map((q) => {
          const r = resolve(q)
          return (
            <div key={q.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-900">
                  {r.label}
                </label>
                {q.is_required && (
                  <span className="text-xs text-red-500 font-medium">
                    {t.questions_required}
                  </span>
                )}
              </div>
              {r.description && (
                <p className="text-sm text-slate-500">{r.description}</p>
              )}

              {/* Select — radio cards */}
              {q.field_type === 'select' && (
                <div className="grid gap-2">
                  {r.options.map((opt) => {
                    const selected = answers[q.id] === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValue(q.id, opt.value)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                          selected
                            ? 'border-current bg-opacity-5'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        style={selected ? { color: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
                      >
                        <span className={`text-sm font-medium ${selected ? '' : 'text-slate-700'}`}>
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Multi-select — checkable cards */}
              {q.field_type === 'multi_select' && (
                <div className="grid gap-2">
                  {r.options.map((opt) => {
                    const currentArr = (answers[q.id] as string[]) ?? []
                    const checked = currentArr.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? currentArr.filter((v) => v !== opt.value)
                            : [...currentArr, opt.value]
                          setValue(q.id, next)
                        }}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-colors flex items-center gap-3 ${
                          checked
                            ? 'border-current bg-opacity-5'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        style={checked ? { color: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
                      >
                        <div
                          className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center ${
                            checked ? 'text-white' : 'border-2 border-slate-300'
                          }`}
                          style={checked ? { backgroundColor: primaryColor } : undefined}
                        >
                          {checked && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${checked ? '' : 'text-slate-700'}`}>
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Text input */}
              {q.field_type === 'text' && (
                <Input
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => setValue(q.id, e.target.value)}
                  placeholder={r.placeholder}
                  className="h-14 text-lg"
                />
              )}

              {/* Textarea */}
              {q.field_type === 'textarea' && (
                <Textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => setValue(q.id, e.target.value)}
                  placeholder={r.placeholder}
                  className="text-base min-h-[100px]"
                />
              )}

              {/* Boolean — Yes/No buttons */}
              {q.field_type === 'boolean' && (
                <div className="flex gap-3">
                  {[
                    { label: t.questions_yes, value: true },
                    { label: t.questions_no, value: false },
                  ].map((opt) => {
                    const selected = answers[q.id] === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setValue(q.id, opt.value)}
                        className={`flex-1 p-4 rounded-xl border-2 text-center text-sm font-medium transition-colors ${
                          selected
                            ? 'border-current text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                        style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Additional comments — always shown */}
        <div className="space-y-2 pt-4 border-t border-slate-200">
          <label className="text-sm font-medium text-slate-900">
            {t.questions_additional_comments}
          </label>
          <Textarea
            value={additionalComments}
            onChange={(e) => setAdditionalComments(e.target.value)}
            placeholder={t.questions_additional_placeholder}
            className="text-base min-h-[100px]"
          />
        </div>
      </div>

      <div className="flex gap-3 w-full pt-2">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="flex-1 h-14"
        >
          {t.questions_back}
        </Button>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!isValid}
          className="flex-1 h-14"
          style={{ backgroundColor: primaryColor }}
        >
          {t.questions_continue}
        </Button>
      </div>
    </div>
  )
}
