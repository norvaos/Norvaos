'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ConflictNameMatch {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
  contact_type: string
  client_status: string
  active_matter_count: number
}

export interface ConflictMatterMatch {
  id: string
  title: string
  matter_number: string
  status: string
}

export interface ConflictSearchResult {
  contactMatches: ConflictNameMatch[]
  matterMatches: ConflictMatterMatch[]
  totalMatches: number
  searchedAt: string
}

/**
 * Searches both contacts and matters for potential conflicts by name.
 * Used BEFORE a contact record exists (pre-creation conflict gate).
 */
export function useConflictNameSearch(
  firstName: string,
  lastName: string,
  tenantId: string,
  enabled: boolean = false
) {
  return useQuery({
    queryKey: ['conflict-name-search', firstName, lastName, tenantId],
    queryFn: async (): Promise<ConflictSearchResult> => {
      const supabase = createClient()
      const searchedAt = new Date().toISOString()

      // Search contacts by name (case-insensitive)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, contact_type, client_status, active_matter_count')
        .eq('tenant_id', tenantId)
        .or(
          `and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),` +
          `and(first_name.ilike.%${lastName}%,last_name.ilike.%${firstName}%)`
        )
        .eq('is_active', true)
        .limit(10)

      // Search matters by title (which often contains the client name)
      const fullName = `${firstName} ${lastName}`.trim()
      const { data: matters } = await supabase
        .from('matters')
        .select('id, title, matter_number, status')
        .eq('tenant_id', tenantId)
        .or(`title.ilike.%${fullName}%,title.ilike.%${lastName}%`)
        .not('status', 'in', '("archived","import_reverted")')
        .limit(10)

      const contactMatches = (contacts ?? []) as ConflictNameMatch[]
      const matterMatches = (matters ?? []) as ConflictMatterMatch[]

      return {
        contactMatches,
        matterMatches,
        totalMatches: contactMatches.length + matterMatches.length,
        searchedAt,
      }
    },
    enabled: enabled && !!firstName.trim() && !!lastName.trim() && !!tenantId,
    staleTime: 0, // Always re-fetch for fresh conflict data
  })
}
