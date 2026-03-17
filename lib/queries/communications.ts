'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type CommunicationRow = Database['public']['Tables']['communications']['Row']
type CommunicationInsert = Database['public']['Tables']['communications']['Insert']

// ── Query Key Factory ────────────────────────────────────────────────────────

export const commKeys = {
  all: ['communications'] as const,
  matter: (matterId: string) => [...commKeys.all, 'matter', matterId] as const,
}

// ── Fetch matter communications ──────────────────────────────────────────────

export function useMatterCommunications(matterId: string) {
  return useQuery({
    queryKey: commKeys.matter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communications')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as CommunicationRow[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Create communication ─────────────────────────────────────────────────────

export function useCreateCommunication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CommunicationInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communications')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as CommunicationRow
    },
    onSuccess: (_, vars) => {
      if (vars.matter_id) {
        qc.invalidateQueries({ queryKey: commKeys.matter(vars.matter_id) })
      }
      toast.success('Communication saved')
    },
    onError: () => {
      toast.error('Failed to save communication')
    },
  })
}
