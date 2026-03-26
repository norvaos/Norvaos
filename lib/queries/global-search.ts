'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GlobalSearchResult {
  contacts: {
    id: string
    first_name: string | null
    last_name: string | null
    email_primary: string | null
    organization_name: string | null
    contact_type: string | null
    client_status: 'lead' | 'client' | 'former_client'
    active_matter_count: number
  }[]
  matters: {
    id: string
    title: string | null
    matter_number: string | null
    status: string | null
  }[]
  leads: {
    id: string
    source: string | null
    contact_first_name: string | null
    contact_last_name: string | null
  }[]
  tasks: {
    id: string
    title: string | null
    status: string | null
    priority: string | null
  }[]
}

// ─── Query Key ───────────────────────────────────────────────────────────────

export const globalSearchKeys = {
  all: ['global-search'] as const,
  term: (q: string) => [...globalSearchKeys.all, q] as const,
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Calls the `global_search` RPC — a single Postgres function that searches
 * contacts, matters, leads, and tasks in one round trip.
 *
 * Security: the RPC resolves tenant_id from `auth.uid()` inside the function
 * (SECURITY DEFINER). No tenant_id is passed from the client.
 *
 * Columns: only card-display fields are returned (max 6 per entity).
 */
export function useGlobalSearch(searchTerm: string) {
  return useQuery({
    queryKey: globalSearchKeys.term(searchTerm),
    queryFn: async (): Promise<GlobalSearchResult> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('global_search', {
        search_term: searchTerm,
        result_limit: 5,
      })
      if (error) throw error
      return data as unknown as GlobalSearchResult
    },
    enabled: searchTerm.trim().length > 0,
    staleTime: 1000 * 30,       // 30s — repeated searches feel instant
    gcTime: 1000 * 60 * 2,      // 2min — keep recent searches warm
    placeholderData: (prev) => prev, // show previous results while fetching new
  })
}
