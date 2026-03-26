/**
 * TanStack Query hooks for Audit-Optimizer 3.0 — Pre-submission scans.
 *
 * Budget: all column fragments < 20 cols per query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const auditOptimizerKeys = {
  all: ['audit-optimizer'] as const,
  scans: (matterId: string) => [...auditOptimizerKeys.all, 'scans', matterId] as const,
  scan: (scanId: string) => [...auditOptimizerKeys.all, 'scan', scanId] as const,
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditScanResponse {
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

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useRunAuditScan() {
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
      return res.json() as Promise<AuditScanResponse>
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: auditOptimizerKeys.scans(vars.matterId) })
    },
  })
}

export function useAuditScans(matterId: string) {
  return useQuery({
    queryKey: auditOptimizerKeys.scans(matterId),
    queryFn: async () => {
      // Fetch from Supabase client-side would need the client
      // For now, scans are fetched via the mutation response
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
