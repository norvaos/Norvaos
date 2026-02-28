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
        .select('*', { count: 'exact' })
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
        userId: contact.created_by ?? null,
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
    onError: () => {
      toast.error('Failed to create contact')
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
        userId: data.created_by ?? null,
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
        userId: contact.created_by ?? null,
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
