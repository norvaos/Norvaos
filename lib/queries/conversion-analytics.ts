'use client'

import { useQuery } from '@tanstack/react-query'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConversionGroupBy = 'source' | 'medium' | 'campaign'

export interface ConversionSourceRow {
  source: string
  medium: string | null
  campaign: string | null
  totalLeads: number
  convertedLeads: number
  totalBilledCents: number
  totalPaidCents: number
  avgMatterValueCents: number
  estimatedPipelineCents: number
  conversionRate: number
  revenuePerLead: number
}

export interface ConversionSummary {
  totalLeads: number
  totalConverted: number
  totalBilledCents: number
  totalPaidCents: number
  totalPipelineCents: number
  overallConversionRate: number
  uniqueSources: number
}

export interface ConversionAnalyticsData {
  rows: ConversionSourceRow[]
  summary: ConversionSummary
  meta: {
    groupBy: ConversionGroupBy
    from: string | null
    to: string | null
    generatedAt: string
  }
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const conversionKeys = {
  all: ['conversion-analytics'] as const,
  list: (params: { groupBy?: ConversionGroupBy; from?: string; to?: string }) =>
    [...conversionKeys.all, params] as const,
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConversionAnalytics(params?: {
  groupBy?: ConversionGroupBy
  from?: string
  to?: string
  enabled?: boolean
}) {
  const groupBy = params?.groupBy ?? 'source'
  const from = params?.from
  const to = params?.to

  return useQuery({
    queryKey: conversionKeys.list({ groupBy, from, to }),
    queryFn: async (): Promise<ConversionAnalyticsData> => {
      const searchParams = new URLSearchParams()
      searchParams.set('group_by', groupBy)
      if (from) searchParams.set('from', from)
      if (to) searchParams.set('to', to)

      const res = await fetch(`/api/analytics/conversion?${searchParams.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to fetch conversion analytics')
      }
      const json = await res.json()
      // Handle both { data: {...} } wrapper and direct response
      return (json.data ?? json) as ConversionAnalyticsData
    },
    enabled: params?.enabled !== false,
    staleTime: 1000 * 60 * 5, // 5 min  -  analytics data doesn't change rapidly
  })
}
