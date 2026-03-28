/**
 * TanStack Query hooks for Regulator-Mirror 3.0 Audit-Optimizer — Pre-submission scans.
 *
 * Budget: all column fragments < 20 cols per query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const irccScanKeys = {
  all: ['ircc-scans'] as const,
  scans: (matterId: string) => [...irccScanKeys.all, 'scans', matterId] as const,
  scan: (scanId: string) => [...irccScanKeys.all, 'scan', scanId] as const,
}

/** @deprecated Use irccScanKeys — legacy alias removed per Audit-Optimizer directive */
export const chinookKeys = irccScanKeys

// ── Types ────────────────────────────────────────────────────────────────────

export interface IRCCScanResponse {
  success: boolean
  scanId: string | null
  readabilityScore: number
  grade: 'A' | 'B' | 'C' | 'D'
  keywordCoverage: Record<string, {
    found: boolean
    count: number
    density: number
    zones: string[]
  }>
  structureIssues: Array<{
    rule: string
    severity: 'critical' | 'warning' | 'info'
    description: string
    fix: string
  }>
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low'
    category: string
    message: string
    action: string
  }>
  metadataZones: Record<string, unknown>
}

/** @deprecated Use IRCCScanResponse — legacy alias removed per Audit-Optimizer directive */
export type ChinookScanResponse = IRCCScanResponse

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useRunIRCCScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      matterId: string
      documentText: string
      caseType?: string
      documentId?: string
    }) => {
      const res = await fetch(`/api/matters/${input.matterId}/audit-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: input.documentText,
          caseType: input.caseType,
          documentId: input.documentId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Scan failed' }))
        throw new Error(data.error)
      }
      return res.json() as Promise<IRCCScanResponse>
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: irccScanKeys.scans(vars.matterId) })
    },
  })
}

/** @deprecated Use useRunIRCCScan — legacy alias removed per Audit-Optimizer directive */
export const useRunChinookScan = useRunIRCCScan

export function useIRCCScans(matterId: string) {
  return useQuery({
    queryKey: irccScanKeys.scans(matterId),
    queryFn: async () => {
      return [] as Array<{
        id: string
        readability_score: number
        status: string
        created_at: string
      }>
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5,
  })
}

/** @deprecated Use useIRCCScans — legacy alias removed per Audit-Optimizer directive */
export const useChinookScans = useIRCCScans
