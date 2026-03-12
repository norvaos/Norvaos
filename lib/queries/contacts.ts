import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'

type Contact = Database['public']['Tables']['contacts']['Row']
type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']

interface ContactListParams {
  tenantId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  contactType?: string
  source?: string
  tags?: string[]
}

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (params: ContactListParams) => [...contactKeys.lists(), params] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
}

/** Columns fetched for contact list views (avoids SELECT *). */
const CONTACT_LIST_COLUMNS = 'id, tenant_id, first_name, last_name, email_primary, phone_primary, contact_type, source, organization_name, is_archived, created_at, created_by, preferred_name, job_title, city, province_state, country, last_contacted_at' as const

export function useContacts(params: ContactListParams) {
  const { tenantId, page = 1, pageSize = 25, search, sortBy = 'created_at', sortDirection = 'desc', contactType, source } = params

  return useQuery({
    queryKey: contactKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('contacts')
        .select(CONTACT_LIST_COLUMNS, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email_primary.ilike.%${search}%,phone_primary.ilike.%${search}%,organization_name.ilike.%${search}%`
        )
      }

      if (contactType) {
        query = query.eq('contact_type', contactType)
      }

      if (source) {
        query = query.eq('source', source)
      }

      query = query.order(sortBy, { ascending: sortDirection === 'asc' }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return {
        contacts: data as Contact[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
  })
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Contact
    },
    enabled: !!id,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contact: ContactInsert) => {
      const supabase = createClient()

      // Check for duplicate contacts by email or phone before inserting
      if (contact.email_primary) {
        const { data: emailDups } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .eq('tenant_id', contact.tenant_id)
          .eq('email_primary', contact.email_primary)
          .limit(1)
        if (emailDups && emailDups.length > 0) {
          const name = [emailDups[0].first_name, emailDups[0].last_name].filter(Boolean).join(' ')
          throw new Error(`Duplicate contact: "${name}" already has the email "${contact.email_primary}".`)
        }
      }

      if (contact.phone_primary) {
        const { data: phoneDups } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .eq('tenant_id', contact.tenant_id)
          .eq('phone_primary', contact.phone_primary)
          .limit(1)
        if (phoneDups && phoneDups.length > 0) {
          const name = [phoneDups[0].first_name, phoneDups[0].last_name].filter(Boolean).join(' ')
          throw new Error(`Duplicate contact: "${name}" already has the phone number "${contact.phone_primary}".`)
        }
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert(contact)
        .select()
        .single()

      if (error) throw error
      return data as Contact
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success('Contact created successfully')

      logAudit({
        tenantId: contact.tenant_id,
        userId: contact.created_by ?? 'system',
        entityType: 'contact',
        entityId: contact.id,
        action: 'created',
        changes: {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email_primary,
          contact_type: contact.contact_type,
        },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create contact')
    },
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: ContactUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Contact
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.setQueryData(contactKeys.detail(data.id), data)
      toast.success('Contact updated successfully')

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? 'system',
        entityType: 'contact',
        entityId: data.id,
        action: 'updated',
        changes: {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email_primary,
        },
      })
    },
    onError: () => {
      toast.error('Failed to update contact')
    },
  })
}

/** Check what records are linked to a contact before archiving. */
export function useContactDependencies(contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(contactId), 'dependencies'],
    queryFn: async () => {
      const supabase = createClient()

      const [mattersRes, leadsRes, tasksRes] = await Promise.all([
        supabase
          .from('matter_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contactId),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contactId)
          .neq('status', 'lost'),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contactId)
          .not('status', 'in', '("completed","cancelled")'),
      ])

      return {
        matterCount: mattersRes.count ?? 0,
        leadCount: leadsRes.count ?? 0,
        taskCount: tasksRes.count ?? 0,
        hasLinkedRecords: (mattersRes.count ?? 0) + (leadsRes.count ?? 0) + (tasksRes.count ?? 0) > 0,
      }
    },
    enabled: !!contactId,
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .update({ is_archived: true })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Contact
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success('Contact archived successfully')

      logAudit({
        tenantId: contact.tenant_id,
        userId: contact.created_by ?? 'system',
        entityType: 'contact',
        entityId: contact.id,
        action: 'archived',
        metadata: { first_name: contact.first_name, last_name: contact.last_name },
      })
    },
    onError: () => {
      toast.error('Failed to archive contact')
    },
  })
}
