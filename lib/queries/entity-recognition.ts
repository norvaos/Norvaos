/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Entity Recognition Queries — The Mirror Pattern
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Hooks that power Contact-thinking in the Command Centre:
 *
 *   usePreviousSponsors  — Given a contact, find sponsors from their past matters
 *   useContactMatters    — Given a contact, find all their linked matters
 *   useLinkContactToLead — Mutation: set lead.contact_id and persist the link
 *   useLinkSponsorToLead — Mutation: store sponsor_contact_id in lead.custom_fields
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { leadKeys } from '@/lib/queries/leads'
import { toast } from 'sonner'

type Contact = Database['public']['Tables']['contacts']['Row']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const entityKeys = {
  all: ['entity-recognition'] as const,
  previousSponsors: (contactId: string) =>
    [...entityKeys.all, 'previous-sponsors', contactId] as const,
  contactMatters: (contactId: string) =>
    [...entityKeys.all, 'contact-matters', contactId] as const,
}

// ─── Previous Sponsors ──────────────────────────────────────────────────────

interface PreviousSponsor {
  contact_id: string
  contact: Pick<Contact, 'id' | 'first_name' | 'last_name' | 'email_primary' | 'phone_primary' | 'date_of_birth' | 'nationality' | 'immigration_status'>
  matter_count: number
  last_matter_name: string | null
  roles: string[]
}

/**
 * Given a principal applicant's contact_id, find all contacts who have been
 * linked as 'sponsor' (or 'co_applicant') on matters where this contact was
 * also a party. Returns contacts ranked by how many times they co-appeared.
 */
export function usePreviousSponsors(contactId: string | null | undefined) {
  return useQuery({
    queryKey: entityKeys.previousSponsors(contactId ?? ''),
    queryFn: async (): Promise<PreviousSponsor[]> => {
      if (!contactId) return []
      const supabase = createClient()

      // Step 1: Find all matters where this contact is linked
      const { data: myMatters, error: mErr } = await supabase
        .from('matter_contacts')
        .select('matter_id')
        .eq('contact_id', contactId)

      if (mErr || !myMatters?.length) return []

      const matterIds = myMatters.map((m) => m.matter_id)

      // Step 2: Find other contacts on those matters with sponsor/co-applicant role
      const { data: sponsorLinks, error: sErr } = await supabase
        .from('matter_contacts')
        .select(`
          contact_id,
          role,
          matter_id
        `)
        .in('matter_id', matterIds)
        .in('role', ['sponsor', 'co_applicant', 'co_signer'])
        .neq('contact_id', contactId)

      if (sErr || !sponsorLinks?.length) return []

      // Step 3: Group by contact_id and count
      const sponsorMap = new Map<string, { matterIds: Set<string>; roles: Set<string> }>()
      for (const link of sponsorLinks) {
        const existing = sponsorMap.get(link.contact_id) ?? {
          matterIds: new Set<string>(),
          roles: new Set<string>(),
        }
        existing.matterIds.add(link.matter_id)
        if (link.role) existing.roles.add(link.role)
        sponsorMap.set(link.contact_id, existing)
      }

      // Step 4: Fetch contact details for each sponsor
      const sponsorContactIds = Array.from(sponsorMap.keys())
      const { data: sponsorContacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, immigration_status')
        .in('id', sponsorContactIds)
        .eq('is_active', true)

      if (!sponsorContacts?.length) return []

      // Step 5: Fetch matter names for context
      const allSponsorMatterIds = Array.from(
        new Set(Array.from(sponsorMap.values()).flatMap((v) => Array.from(v.matterIds)))
      )
      const { data: mattersData } = await supabase
        .from('matters')
        .select('id, title')
        .in('id', allSponsorMatterIds)

      const matterNameMap = new Map(
        (mattersData ?? []).map((m) => [m.id, m.title])
      )

      // Step 6: Build result sorted by matter_count descending
      const results: PreviousSponsor[] = sponsorContacts.map((c) => {
        const info = sponsorMap.get(c.id)!
        const mIds = Array.from(info.matterIds)
        return {
          contact_id: c.id,
          contact: c as PreviousSponsor['contact'],
          matter_count: mIds.length,
          last_matter_name: matterNameMap.get(mIds[mIds.length - 1]) ?? null,
          roles: Array.from(info.roles),
        }
      })

      results.sort((a, b) => b.matter_count - a.matter_count)
      return results
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5, // 5 min cache
  })
}

// ─── Link Contact to Lead ───────────────────────────────────────────────────

/**
 * Set lead.contact_id — links an existing contact (or newly created one)
 * as the principal applicant for this lead.
 */
export function useLinkContactToLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId, contactId }: { leadId: string; contactId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .update({ contact_id: contactId })
        .eq('id', leadId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: ['contacts', 'detail'] })
      toast.success('Contact linked')
    },
    onError: () => {
      toast.error('Failed to link contact')
    },
  })
}

// ─── Link Sponsor to Lead ───────────────────────────────────────────────────

/**
 * Store sponsor_contact_id in lead.custom_fields.
 * On conversion, the convert-and-retain route will read this and create
 * the sponsor matter_contacts + matter_people rows.
 */
export function useLinkSponsorToLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      leadId,
      sponsorContactId,
      existingCustomFields,
    }: {
      leadId: string
      sponsorContactId: string | null
      existingCustomFields: Record<string, unknown>
    }) => {
      const supabase = createClient()
      const cf = {
        ...existingCustomFields,
        sponsor_contact_id: sponsorContactId,
      }
      const { data, error } = await supabase
        .from('leads')
        .update({ custom_fields: cf as unknown as import('@/lib/types/database').Json })
        .eq('id', leadId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(data.id) })
      if (data) {
        const cf = (data.custom_fields ?? {}) as Record<string, unknown>
        const msg = cf.sponsor_contact_id ? 'Sponsor linked' : 'Sponsor removed'
        toast.success(msg)
      }
    },
    onError: () => {
      toast.error('Failed to link sponsor')
    },
  })
}
