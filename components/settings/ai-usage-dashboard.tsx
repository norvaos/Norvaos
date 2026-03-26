'use client'

/**
 * AI Usage Dashboard (Directive 036)
 *
 * Real-time view of AI spend so the Principal can monitor costs.
 * Shows: quota gauge, cost by model, cost by task, daily trend.
 */

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface UsageData {
  period: string
  totals: { calls: number; costCents: number; costDollars: string }
  quota: {
    limitCents: number
    limitDollars: string
    spentCents: number
    spentDollars: string
    remainingCents: number
    percentUsed: number
  }
  byModel: Array<{
    model: string
    calls: number
    costCents: number
    costDollars: string
    tokensIn: number
    tokensOut: number
  }>
  byTask: Array<{
    task: string
    calls: number
    costCents: number
    costDollars: string
  }>
  dailyTrend: Array<{
    date: string
    calls: number
    costCents: number
    costDollars: string
  }>
}

// ─── Model Display Names ───────────────────────────────────────────────────

const MODEL_LABELS: Record<string, string> = {
  'whisper-v3-turbo': 'Whisper v3 (Transcription)',
  'gemini-1.5-flash': 'Gemini 1.5 Flash (Summaries/OCR)',
  'gpt-4o-mini': 'GPT-4o mini (Drafting)',
  'claude-sonnet': 'Claude Sonnet (Legal Drafting)',
  'claude-sonnet-4-20250514': 'Claude Sonnet (Legal Drafting)',
}

const TASK_LABELS: Record<string, string> = {
  transcription: 'Meeting Transcription',
  sovereign_summary: 'Sovereign Summary',
  sentinel_ocr: 'Sentinel OCR',
  document_draft: 'Document Drafting',
  legal_draft: 'Legal Drafting',
  draft_generation: 'AI Draft Generation',
}

// ─── Hook ──────────────────────────────────────────────────────────────────

function useAIUsage(period: 'day' | 'week' | 'month') {
  return useQuery<UsageData>({
    queryKey: ['ai-usage', period],
    queryFn: async () => {
      const res = await fetch(`/api/ai/usage?period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch AI usage')
      return res.json()
    },
    staleTime: 1000 * 60 * 2, // 2 min
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 min
  })
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AIUsageDashboard() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month')
  const { data, isLoading, error } = useAIUsage(period)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load AI usage data. Ensure the AI gateway is configured.
        </CardContent>
      </Card>
    )
  }

  const quotaColour =
    data.quota.percentUsed >= 90
      ? 'text-red-600'
      : data.quota.percentUsed >= 70
        ? 'text-amber-600'
        : 'text-emerald-600'

  return (
    <div className="space-y-6">
      {/* Period Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
        {(['day', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p === 'day' ? 'Today' : p === 'week' ? '7 Days' : 'This Month'}
          </button>
        ))}
      </div>

      {/* Top Row: Quota + Totals */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Quota Gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${quotaColour}`}>
              ${data.quota.spentDollars}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}/ ${data.quota.limitDollars}
              </span>
            </div>
            <Progress
              value={data.quota.percentUsed}
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {data.quota.percentUsed}% used &middot; ${(data.quota.remainingCents / 100).toFixed(2)} remaining
            </p>
          </CardContent>
        </Card>

        {/* Total Calls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AI Calls ({period})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totals.calls.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total cost: ${data.totals.costDollars}
            </p>
          </CardContent>
        </Card>

        {/* Cost Per Call */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost / Call</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.totals.calls > 0
                ? `$${(data.totals.costCents / data.totals.calls / 100).toFixed(4)}`
                : '$0.00'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Across all AI models
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Model Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cost by Model</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI calls recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {data.byModel.map((m) => (
                <div key={m.model} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">
                      {MODEL_LABELS[m.model] ?? m.model}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.calls} calls
                    </span>
                  </div>
                  <Badge variant="secondary">${m.costDollars}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cost by Task</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byTask.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI calls recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {data.byTask.map((t) => (
                <div key={t.task} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">
                      {TASK_LABELS[t.task] ?? t.task}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.calls} calls
                    </span>
                  </div>
                  <Badge variant="secondary">${t.costDollars}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Trend */}
      {data.dailyTrend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {data.dailyTrend.map((d) => {
                const maxCost = Math.max(...data.dailyTrend.map((t) => t.costCents), 1)
                const height = Math.max(4, (d.costCents / maxCost) * 100)
                return (
                  <div key={d.date} className="group relative flex-1">
                    <div
                      className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{ height: `${height}%` }}
                    />
                    <div className="absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs shadow group-hover:block">
                      {d.date}: ${d.costDollars} ({d.calls} calls)
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{data.dailyTrend[0]?.date}</span>
              <span>{data.dailyTrend[data.dailyTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
