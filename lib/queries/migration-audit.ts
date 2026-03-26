/**
 * TanStack Query hook for Migration Audit Summary.
 *
 * Fetches stats for the Norva Whisper Welcome banner:
 *   - Total matters imported
 *   - Matters with unreviewed drift alerts
 *   - Matters ready for Audit-Mirror (Chinook) optimisation
 *
 * Budget: 3 lightweight count queries, < 10 cols each.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MigrationAuditSummary {
  totalMatters: number
  driftReviewNeeded: number
  auditReady: number
  /** Whether the welcome banner should show (first 7 days after first matter) */
  showWelcome: boolean
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const migrationAuditKeys = {
  all: ['migration-audit'] as const,
  summary: (tenantId: string) => [...migrationAuditKeys.all, 'summary', tenantId] as const,
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMigrationAuditSummary(tenantId: string) {
  return useQuery({
    queryKey: migrationAuditKeys.summary(tenantId),
    queryFn: async (): Promise<MigrationAuditSummary> => {
      const supabase = createClient()

      // 1. Total active matters for this tenant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: totalMatters } = await (supabase as any)
        .from('matters')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      // 2. Count of 'new' (unreviewed) drift alerts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: driftReviewNeeded } = await (supabase as any)
        .from('case_law_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'new')

      // 3. Matters that have never been scanned by Chinook (audit-ready)
      //    Approach: matters with no chinook_scans row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: scannedMatterIds } = await (supabase as any)
        .from('chinook_scans')
        .select('matter_id')
        .eq('tenant_id', tenantId)

      const scannedSet = new Set(
        ((scannedMatterIds ?? []) as Array<{ matter_id: string }>).map(r => r.matter_id)
      )
      const auditReady = Math.max(0, (totalMatters ?? 0) - scannedSet.size)

      // 4. Show welcome if tenant's first matter was created within last 7 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: oldest } = await (supabase as any)
        .from('matters')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      let showWelcome = false
      if (oldest?.created_at) {
        const firstMatterAge = Date.now() - new Date(oldest.created_at).getTime()
        showWelcome = firstMatterAge < 7 * 24 * 60 * 60 * 1000 // 7 days
      }
      // Always show if tenant has matters (for launch)
      if ((totalMatters ?? 0) > 0) showWelcome = true

      return {
        totalMatters: totalMatters ?? 0,
        driftReviewNeeded: driftReviewNeeded ?? 0,
        auditReady,
        showWelcome,
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 10, // 10 min
  })
}
