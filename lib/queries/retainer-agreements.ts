'use client'

/**
 * TanStack Query hooks for the retainer_agreements table (migration 116).
 *
 * Covers:
 *   - useRetainerAgreementsForMatter — list all agreements for a matter
 *   - useLatestRetainerAgreement    — most recent draft/active agreement
 *   - useCreateRetainerAgreement    — insert a new draft agreement
 *   - useUpdateRetainerAgreement    — patch any column(s)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { RetainerAgreementRow, RetainerAgreementInsert, RetainerAgreementUpdate } from '@/lib/types/database'

// ── Query Keys ────────────────────────────────────────────────────────────────

export const retainerAgreementKeys = {
  all: ['retainer_agreements'] as const,
  forMatter: (matterId: string) => [...retainerAgreementKeys.all, 'matter', matterId] as const,
  latest: (matterId: string) => [...retainerAgreementKeys.all, 'latest', matterId] as const,
}

// ── useRetainerAgreementsForMatter ────────────────────────────────────────────

export function useRetainerAgreementsForMatter(matterId: string) {
  return useQuery({
    queryKey: retainerAgreementKeys.forMatter(matterId),
    queryFn: async (): Promise<RetainerAgreementRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_agreements' as never)
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RetainerAgreementRow[]
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })
}

// ── useLatestRetainerAgreement ────────────────────────────────────────────────

export function useLatestRetainerAgreement(matterId: string) {
  return useQuery({
    queryKey: retainerAgreementKeys.latest(matterId),
    queryFn: async (): Promise<RetainerAgreementRow | null> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_agreements' as never)
        .select('*')
        .eq('matter_id', matterId)
        .not('status', 'eq', 'voided')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as RetainerAgreementRow | null
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })
}

// ── useCreateRetainerAgreement ────────────────────────────────────────────────

export function useCreateRetainerAgreement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RetainerAgreementInsert): Promise<RetainerAgreementRow> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_agreements' as never)
        .insert(input as never)
        .select()
        .single()
      if (error) throw error
      return data as RetainerAgreementRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: retainerAgreementKeys.forMatter(data.matter_id) })
      queryClient.invalidateQueries({ queryKey: retainerAgreementKeys.latest(data.matter_id) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create retainer agreement')
    },
  })
}

// ── useUpdateRetainerAgreement ────────────────────────────────────────────────

export function useUpdateRetainerAgreement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterId,
      updates,
    }: {
      id: string
      matterId: string
      updates: RetainerAgreementUpdate
    }): Promise<RetainerAgreementRow> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_agreements' as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as RetainerAgreementRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: retainerAgreementKeys.forMatter(data.matter_id) })
      queryClient.invalidateQueries({ queryKey: retainerAgreementKeys.latest(data.matter_id) })
      toast.success('Retainer agreement updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update retainer agreement')
    },
  })
}
