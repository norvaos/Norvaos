/**
 * Admin KPI Query Layer
 *
 * Separated from front-desk-queries.ts to maintain import boundaries.
 * These hooks are used ONLY by the admin dashboard, never by the front desk UI.
 */

import { useQuery } from '@tanstack/react-query'
import type { ShiftKpiValue } from './front-desk-queries'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdminUserKpiSummary {
  userId: string
  userName: string
  shiftCount: number
  shifts: {
    id: string
    startedAt: string
    endedAt: string | null
    endedReason: string | null
  }[]
  kpis: ShiftKpiValue[]
  raw: Record<string, number | null>
}

export interface AdminKpiResponse {
  date: string
  users: AdminUserKpiSummary[]
  totalShifts: number
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const adminKpiKeys = {
  all: ['admin-kpis'] as const,
  day: (date: string) => [...adminKpiKeys.all, 'day', date] as const,
  user: (date: string, userId: string) => [...adminKpiKeys.all, 'user', date, userId] as const,
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetches KPI summaries for all front desk staff on a given date.
 */
export function useAdminFrontDeskKpis(date: string | null) {
  return useQuery({
    queryKey: adminKpiKeys.day(date ?? ''),
    queryFn: async (): Promise<AdminKpiResponse | null> => {
      if (!date) return null

      const response = await fetch(`/api/admin/front-desk-kpis?date=${date}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to fetch admin KPIs')
      }

      return response.json() as Promise<AdminKpiResponse>
    },
    enabled: !!date,
    staleTime: 60_000,
  })
}
