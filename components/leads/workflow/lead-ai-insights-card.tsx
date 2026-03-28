'use client'

import { Sparkles, Loader2, CheckCircle2, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelativeDate } from '@/lib/utils/formatters'
import type { LeadAiInsightRow } from './lead-workflow-types'

// ─── Insight Field Config ──────────────────────────────────────────────────

/** Each row in the flat table has multiple fields; we display them as distinct "insight" sections */
const INSIGHT_FIELDS: Array<{
  key: keyof LeadAiInsightRow
  label: string
  className: string
  type: 'text' | 'json_list'
}> = [
  { key: 'practice_area_suggestion', label: 'Practice Area', className: 'bg-blue-950/30 text-blue-400 border-blue-500/20', type: 'text' },
  { key: 'intake_summary', label: 'Summary', className: 'bg-muted text-muted-foreground border-border', type: 'text' },
  { key: 'qualification_suggestion', label: 'Qualification', className: 'bg-purple-950/30 text-purple-400 border-purple-500/20', type: 'text' },
  { key: 'next_action_suggestion', label: 'Next Action', className: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20', type: 'text' },
  { key: 'urgency_flags', label: 'Urgency', className: 'bg-amber-950/30 text-amber-400 border-amber-500/20', type: 'json_list' },
  { key: 'missing_data_flags', label: 'Missing Data', className: 'bg-red-50 text-red-600 border-red-200', type: 'json_list' },
]

// ─── Component ──────────────────────────────────────────────────────────────

interface LeadAiInsightsCardProps {
  insights: LeadAiInsightRow[]
  isReadOnly: boolean
  onGenerate: () => void
  onAccept: (insightId: string) => void
  isGenerating?: boolean
  isAccepting?: boolean
}

export function LeadAiInsightsCard({
  insights,
  isReadOnly,
  onGenerate,
  onAccept,
  isGenerating = false,
  isAccepting = false,
}: LeadAiInsightsCardProps) {
  // The table is flat  -  one row per AI analysis. Show the latest analysis.
  const latestInsight = insights.length > 0 ? insights[0] : null
  const isAccepted = !!latestInsight?.accepted_at

  // Build a list of populated insight sections from the flat row
  const insightSections = latestInsight
    ? INSIGHT_FIELDS.filter((field) => {
        const val = latestInsight[field.key]
        if (val == null) return false
        if (typeof val === 'string') return val.trim().length > 0
        if (Array.isArray(val)) return val.length > 0
        return true // Json fields
      })
    : []

  const hasContent = insightSections.length > 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI Insights
          </CardTitle>
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating}
              className="h-7 text-xs"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  {latestInsight ? 'Refresh' : 'Generate'}
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!latestInsight ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No AI insights yet</p>
            {!isReadOnly && (
              <p className="mt-1 text-xs text-muted-foreground">
                Generate insights to get AI recommendations
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Status + generated time */}
            <div className="flex items-center gap-1.5">
              {isAccepted && (
                <Badge variant="outline" size="xs" className="bg-emerald-950/30 text-emerald-400 border-emerald-500/20">
                  <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                  Accepted
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                Generated {formatRelativeDate(latestInsight.generated_at)}
              </span>
            </div>

            {/* Insight sections */}
            {hasContent && (
              <div className="space-y-2">
                {insightSections.map((field) => (
                  <InsightSection
                    key={field.key}
                    label={field.label}
                    className={field.className}
                    value={latestInsight[field.key]}
                    type={field.type}
                  />
                ))}
              </div>
            )}

            {/* Confidence scores */}
            {latestInsight.confidence_scores != null && (
              <ConfidenceBar scores={latestInsight.confidence_scores} />
            )}

            {/* Accept button */}
            {!isAccepted && !isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAccept(latestInsight.id)}
                disabled={isAccepting}
                className="h-6 text-xs w-full"
              >
                {isAccepting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                )}
                Accept Insights
              </Button>
            )}

            {/* Acceptance notes */}
            {isAccepted && latestInsight.acceptance_notes && (
              <div className="border-t pt-2">
                <p className="text-xs text-muted-foreground mb-0.5">Acceptance Notes</p>
                <p className="text-xs text-foreground">{latestInsight.acceptance_notes}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Insight Section ─────────────────────────────────────────────────────────

function InsightSection({
  label,
  className,
  value,
  type,
}: {
  label: string
  className: string
  value: unknown
  type: 'text' | 'json_list'
}) {
  return (
    <div className="rounded-md border p-2.5 space-y-1.5">
      <Badge variant="outline" size="xs" className={className}>
        {label}
      </Badge>
      {type === 'text' && typeof value === 'string' && (
        <p className="text-xs text-foreground whitespace-pre-line line-clamp-4">{value}</p>
      )}
      {type === 'json_list' && (
        <JsonListDisplay value={value} />
      )}
    </div>
  )
}

// ─── JSON List Display ───────────────────────────────────────────────────────

function JsonListDisplay({ value }: { value: unknown }) {
  // The Json fields (missing_data_flags, urgency_flags) can be arrays of strings or objects
  const items: string[] = []

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === 'string') items.push(item)
      else if (typeof item === 'object' && item !== null) {
        // Try common shapes: { flag: '...' }, { message: '...' }, { label: '...' }
        const str = (item as Record<string, unknown>).flag
          ?? (item as Record<string, unknown>).message
          ?? (item as Record<string, unknown>).label
          ?? JSON.stringify(item)
        items.push(String(str))
      }
    })
  } else if (typeof value === 'object' && value !== null) {
    // Might be a record
    Object.values(value as Record<string, unknown>).forEach((v) => items.push(String(v)))
  }

  if (items.length === 0) return null

  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-foreground flex items-start gap-1">
          <span className="text-muted-foreground mt-0.5">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ─── Confidence Bar ──────────────────────────────────────────────────────────

function ConfidenceBar({ scores }: { scores: unknown }) {
  // confidence_scores is a Json field  -  could be { overall: 0.85, ... } or a number
  let overall: number | null = null

  if (typeof scores === 'number') {
    overall = scores
  } else if (typeof scores === 'object' && scores !== null) {
    const obj = scores as Record<string, unknown>
    if (typeof obj.overall === 'number') overall = obj.overall
  }

  if (overall == null) return null

  const pct = Math.round(overall * 100)

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>Confidence:</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-medium">{pct}%</span>
    </div>
  )
}
