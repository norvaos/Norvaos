/**
 * Genesis Block Query Hooks — Directive 015 / 015.1
 *
 * TanStack Query hooks for the Sovereign Birth Certificate:
 *   • useGenesisBlock — fetch genesis status
 *   • useGenerateGenesisBlock — seal new genesis
 *   • useRevokeGenesisBlock — Partner-level revocation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const genesisKeys = {
  all: ['genesis'] as const,
  detail: (matterId: string) => ['genesis', matterId] as const,
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenesisBlockStatus {
  exists: boolean
  isCompliant: boolean
  hasSequenceViolation: boolean
  isRevoked: boolean
  complianceNotes: string | null
  generatedAt: string | null
  genesisHash: string | null
  genesis: {
    id: string
    matter_id: string
    generated_by: string
    generated_at: string
    conflict_decision: string | null
    conflict_score: number | null
    conflict_search_id: string | null
    conflict_decided_at: string | null
    kyc_status: string | null
    kyc_document_type: string | null
    kyc_verified_at: string | null
    retainer_status: string | null
    retainer_total_cents: number | null
    retainer_hash: string | null
    initial_trust_balance: number
    last_trust_audit_hash: string | null
    genesis_hash: string
    is_compliant: boolean
    has_sequence_violation: boolean
    compliance_notes: string | null
    is_revoked: boolean
    revoked_at: string | null
    revocation_reason: string | null
  } | null
}

// ─── Fetch Genesis Block ────────────────────────────────────────────────────

export function useGenesisBlock(matterId: string | undefined) {
  return useQuery({
    queryKey: genesisKeys.detail(matterId ?? ''),
    queryFn: async (): Promise<GenesisBlockStatus> => {
      const res = await fetch(`/api/matters/${matterId}/genesis-block`)
      if (!res.ok) {
        throw new Error(`Failed to fetch genesis block: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5, // 5 min — genesis blocks are immutable
  })
}

// ─── Generate Genesis Block ─────────────────────────────────────────────────

export function useGenerateGenesisBlock() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (matterId: string) => {
      const res = await fetch(`/api/matters/${matterId}/genesis-block`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to generate genesis block: ${res.status}`)
      }

      return res.json()
    },
    onSuccess: (_data, matterId) => {
      qc.invalidateQueries({ queryKey: genesisKeys.detail(matterId) })
      toast.success('Norva Genesis Block sealed — Sovereign Birth Certificate recorded')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to seal genesis block')
    },
  })
}

// ─── Revoke Genesis Block (Partner-Level) ───────────────────────────────────

export function useRevokeGenesisBlock() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ matterId, reason }: { matterId: string; reason: string }) => {
      const res = await fetch(`/api/matters/${matterId}/genesis-block`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to revoke genesis block: ${res.status}`)
      }

      return res.json()
    },
    onSuccess: (_data, { matterId }) => {
      qc.invalidateQueries({ queryKey: genesisKeys.detail(matterId) })
      toast.success('Norva Genesis Block revoked — Partner audit trail recorded')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke genesis block')
    },
  })
}
