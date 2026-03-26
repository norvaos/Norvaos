import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type ConflictScan = Database['public']['Tables']['conflict_scans']['Row']
type ConflictMatch = Database['public']['Tables']['conflict_matches']['Row']
type ConflictDecision = Database['public']['Tables']['conflict_decisions']['Row']

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const conflictKeys = {
  all: ['conflicts'] as const,
  scans: (contactId: string) => [...conflictKeys.all, 'scans', contactId] as const,
  matches: (scanId: string) => [...conflictKeys.all, 'matches', scanId] as const,
  decisions: (contactId: string) => [...conflictKeys.all, 'decisions', contactId] as const,
  latestScan: (contactId: string) => [...conflictKeys.all, 'latest-scan', contactId] as const,
}

// ─── Scan History ────────────────────────────────────────────────────────────

export function useConflictScans(contactId: string) {
  return useQuery({
    queryKey: conflictKeys.scans(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conflict_scans')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return data as ConflictScan[]
    },
    enabled: !!contactId,
  })
}

// ─── Matches for a Scan ──────────────────────────────────────────────────────

export function useConflictMatches(scanId: string | null) {
  return useQuery({
    queryKey: conflictKeys.matches(scanId ?? ''),
    queryFn: async () => {
      if (!scanId) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conflict_matches')
        .select('*')
        .eq('scan_id', scanId)
        .order('confidence', { ascending: false })

      if (error) throw error
      return data as ConflictMatch[]
    },
    enabled: !!scanId,
  })
}

// ─── Decision History ────────────────────────────────────────────────────────

export function useConflictDecisions(contactId: string) {
  return useQuery({
    queryKey: conflictKeys.decisions(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conflict_decisions')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as ConflictDecision[]
    },
    enabled: !!contactId,
  })
}

// ─── Latest Scan with Matches ────────────────────────────────────────────────

export interface LatestScanData {
  scan: ConflictScan | null
  matches: ConflictMatch[]
}

export function useLatestConflictScan(contactId: string) {
  return useQuery({
    queryKey: conflictKeys.latestScan(contactId),
    queryFn: async (): Promise<LatestScanData> => {
      const supabase = createClient()

      // Fetch latest completed scan
      const { data: scans, error: scanError } = await supabase
        .from('conflict_scans')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)

      if (scanError) throw scanError

      const scan = scans?.[0] ?? null
      if (!scan) return { scan: null, matches: [] }

      // Fetch matches for that scan
      const { data: matches, error: matchError } = await supabase
        .from('conflict_matches')
        .select('*')
        .eq('scan_id', scan.id)
        .order('confidence', { ascending: false })

      if (matchError) throw matchError

      return { scan, matches: matches as ConflictMatch[] }
    },
    enabled: !!contactId,
  })
}

// ─── Run Conflict Scan (Mutation) ────────────────────────────────────────────

export function useRunConflictScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      contactId,
      triggerType = 'manual',
    }: {
      contactId: string
      triggerType?: string
    }) => {
      const response = await fetch(`/api/contacts/${contactId}/conflict-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Conflict scan failed')
      }

      return result as {
        success: true
        scan: ConflictScan
        matches: ConflictMatch[]
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: conflictKeys.scans(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: conflictKeys.latestScan(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: ['contacts'] }) // Refresh contact data
      toast.success('Norva Conflict scan completed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to run conflict scan')
    },
  })
}

// ─── Record Decision (Mutation) ──────────────────────────────────────────────

export function useRecordConflictDecision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      contactId: string
      scanId?: string
      decision: string
      decisionScope?: string
      matterTypeId?: string
      notes?: string
      internalNote?: string
    }) => {
      const { contactId, ...body } = params
      const response = await fetch(`/api/contacts/${contactId}/conflict-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record decision')
      }

      return result as {
        success: true
        decision: string
        contactStatus: string
        conflictScore: number
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: conflictKeys.decisions(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: conflictKeys.latestScan(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Norva Conflict decision recorded')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to record decision')
    },
  })
}
