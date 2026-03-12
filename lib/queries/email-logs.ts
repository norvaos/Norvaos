'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type EmailLogRow = Database['public']['Tables']['email_logs']['Row']
type EmailLogInsert = Database['public']['Tables']['email_logs']['Insert']

// ── Query Keys ──────────────────────────────────────────────────────────────

export const emailLogKeys = {
  all: ['email-logs'] as const,
  list: (tenantId: string) => [...emailLogKeys.all, 'list', tenantId] as const,
  detail: (id: string) => [...emailLogKeys.all, id] as const,
  contact: (contactId: string) => [...emailLogKeys.all, 'contact', contactId] as const,
  matter: (matterId: string) => [...emailLogKeys.all, 'matter', matterId] as const,
}

// ── Joined types ────────────────────────────────────────────────────────────

export type EmailLogWithJoins = EmailLogRow & {
  contacts: { id: string; first_name: string | null; last_name: string | null } | null
  matters: { id: string; title: string } | null
  users: { id: string; first_name: string | null; last_name: string | null } | null
}

// ── Paginated list with search/filter ───────────────────────────────────────

export function useEmailLogs(
  tenantId: string,
  options?: { search?: string; direction?: string; limit?: number; offset?: number }
) {
  const { search, direction, limit = 25, offset = 0 } = options ?? {}

  return useQuery({
    queryKey: [...emailLogKeys.list(tenantId), { search, direction, limit, offset }],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('email_logs')
        .select(
          '*, contacts(id, first_name, last_name), matters(id, title), users!email_logs_logged_by_fkey(id, first_name, last_name)',
          { count: 'exact' }
        )
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sent_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (direction && direction !== 'all') {
        q = q.eq('direction', direction)
      }
      if (search) {
        q = q.or(`subject.ilike.%${search}%,from_address.ilike.%${search}%,body.ilike.%${search}%`)
      }

      const { data, error, count } = await q
      if (error) throw error
      return { data: data as unknown as EmailLogWithJoins[], count: count ?? 0 }
    },
    enabled: !!tenantId,
  })
}

// ── For contact detail page ─────────────────────────────────────────────────

export function useContactEmailLogs(contactId: string) {
  return useQuery({
    queryKey: emailLogKeys.contact(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, matters(id, title)')
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('sent_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as (EmailLogRow & { matters: { id: string; title: string } | null })[]
    },
    enabled: !!contactId,
  })
}

// ── For matter detail page ──────────────────────────────────────────────────

export function useMatterEmailLogs(matterId: string) {
  return useQuery({
    queryKey: emailLogKeys.matter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, contacts(id, first_name, last_name)')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('sent_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as (EmailLogRow & {
        contacts: { id: string; first_name: string | null; last_name: string | null } | null
      })[]
    },
    enabled: !!matterId,
  })
}

// ── Create ──────────────────────────────────────────────────────────────────

export function useCreateEmailLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (log: EmailLogInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('email_logs')
        .insert(log)
        .select()
        .single()
      if (error) throw error
      return data as EmailLogRow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailLogKeys.all })
      toast.success('Email logged successfully')
    },
    onError: () => {
      toast.error('Failed to log email')
    },
  })
}

// ── Soft-delete ─────────────────────────────────────────────────────────────

export function useDeleteEmailLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (logId: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('email_logs')
        .update({ is_active: false })
        .eq('id', logId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailLogKeys.all })
      toast.success('Email log removed')
    },
    onError: () => {
      toast.error('Failed to remove email log')
    },
  })
}
