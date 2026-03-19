'use client'

import { ClipboardList, CheckCircle, XCircle, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_SCREENING_QUESTIONS,
  getVisibleQuestions,
  getAnswerDisplay,
  type ScreeningQuestion,
} from '@/lib/utils/screening-questions'

// ─── Score question IDs — rendered as a grouped grid ─────────────────────────

const SCORE_IDS = [
  'sq_lang_score_overall',
  'sq_lang_score_reading',
  'sq_lang_score_writing',
  'sq_lang_score_speaking',
  'sq_lang_score_listening',
] as const

const SCORE_LABELS: Record<string, string> = {
  sq_lang_score_overall:   'Overall',
  sq_lang_score_reading:   'Reading',
  sq_lang_score_writing:   'Writing',
  sq_lang_score_speaking:  'Speaking',
  sq_lang_score_listening: 'Listening',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScreeningAnswersPanelProps {
  customIntakeData: Record<string, unknown> | null | undefined
  questions?: ScreeningQuestion[]
  defaultCollapsed?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScreeningAnswersPanel({
  customIntakeData,
  questions,
  defaultCollapsed = false,
}: ScreeningAnswersPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const allQuestions = questions ?? DEFAULT_SCREENING_QUESTIONS
  const answers = (customIntakeData ?? {}) as Record<string, string | string[]>
  const visibleQuestions = getVisibleQuestions(allQuestions, answers)

  const answeredCount = visibleQuestions.filter((q) => {
    const a = answers[q.id]
    if (Array.isArray(a)) return a.length > 0
    return !!a
  }).length

  const hasData = answeredCount > 0

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            Screening Answers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            No screening answers on file for this lead.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Build render list — collapse the 5 score fields into one grouped row
  const scoreIdsSet = new Set<string>(SCORE_IDS)
  const rendered = new Set<string>()

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            Screening Answers
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {answeredCount} / {visibleQuestions.length} answered
            </Badge>
            {collapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          <div className="space-y-3 divide-y divide-border">
            {visibleQuestions.map((q) => {
              if (rendered.has(q.id)) return null

              // ── Language scores: render as a single grouped grid ──
              if (scoreIdsSet.has(q.id)) {
                // Only render the group block once, triggered by the first score id
                const firstScoreInView = visibleQuestions.find((vq) => scoreIdsSet.has(vq.id))
                if (firstScoreInView?.id !== q.id) return null

                SCORE_IDS.forEach((id) => rendered.add(id))

                const hasAnyScore = SCORE_IDS.some((id) => !!answers[id])
                if (!hasAnyScore) return null

                return (
                  <div key="lang-scores" className="pt-3 first:pt-0">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Language Test Scores
                    </p>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {SCORE_IDS.map((id) => (
                        <div key={id} className="rounded bg-muted/40 px-1 py-1.5">
                          <p className="text-[10px] text-muted-foreground mb-0.5">
                            {SCORE_LABELS[id]}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {(answers[id] as string) || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              rendered.add(q.id)
              const raw = answers[q.id]
              const display = getAnswerDisplay(q, raw)
              const isUnanswered = display === '—'

              return (
                <div key={q.id} className="pt-3 first:pt-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1 leading-snug">
                    {q.label}
                  </p>

                  {q.field_type === 'boolean' && !isUnanswered ? (
                    <div className="flex items-center gap-1.5">
                      {raw === 'yes' ? (
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span className={`text-sm font-medium ${
                        raw === 'yes' ? 'text-green-700' : 'text-red-600'
                      }`}>
                        {display}
                      </span>
                    </div>
                  ) : (q.field_type === 'date' || q.id === 'sq_lang_test_date') && !isUnanswered ? (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="text-sm text-foreground">
                        {formatDate(raw as string)}
                      </span>
                    </div>
                  ) : q.field_type === 'textarea' && !isUnanswered ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded px-2 py-1.5">
                      {display}
                    </p>
                  ) : isUnanswered ? (
                    <span className="text-sm text-muted-foreground italic">Not answered</span>
                  ) : (
                    <span className="text-sm text-foreground font-medium">{display}</span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return dateStr
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}
