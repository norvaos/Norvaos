'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const emailKeys = {
  all: ['email'] as const,
  threads: (filters?: Record<string, unknown>) => [...emailKeys.all, 'threads', filters] as const,
  thread: (threadId: string) => [...emailKeys.all, 'thread', threadId] as const,
  messages: (threadId: string) => [...emailKeys.all, 'messages', threadId] as const,
  accounts: () => [...emailKeys.all, 'accounts'] as const,
  unmatched: () => [...emailKeys.all, 'unmatched'] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailThread {
  id: string
  tenant_id: string
  conversation_id: string
  subject: string | null
  last_message_at: string | null
  message_count: number
  participant_emails: string[]
  matter_id: string | null
  contact_id: string | null
  association_confidence: number | null
  association_method: string | null
  last_sender_account_id: string | null
  draft_locked_by: string | null
  draft_locked_at: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
  // Joined fields
  matterTitle?: string | null
  contactName?: string | null
}

export interface EmailMessage {
  id: string
  tenant_id: string
  thread_id: string
  message_id: string
  email_account_id: string
  direction: string
  from_address: string | null
  from_name: string | null
  to_addresses: Array<{ address: string; name: string }>
  cc_addresses: Array<{ address: string; name: string }>
  bcc_addresses: Array<{ address: string; name: string }>
  subject: string | null
  body_text: string | null
  body_html: string | null
  has_attachments: boolean
  is_read: boolean
  importance: string
  received_at: string | null
  sent_at: string | null
  synced_at: string
  created_at: string
}

export interface EmailAccount {
  id: string
  tenant_id: string
  user_id: string
  account_type: string
  provider: string
  email_address: string
  display_name: string | null
  sync_enabled: boolean
  last_sync_at: string | null
  error_count: number
  last_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UnmatchedEmailEntry {
  id: string
  tenant_id: string
  thread_id: string
  suggested_matter_ids: string[]
  suggested_contact_ids: string[]
  reason: string | null
  status: string
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  // Joined thread data
  thread?: EmailThread
}

// ─── Email Threads ──────────────────────────────────────────────────────────

export function useEmailThreads(
  tenantId: string,
  filters?: { matterId?: string; isArchived?: boolean }
) {
  return useQuery({
    queryKey: emailKeys.threads(filters),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('email_threads')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false })
        .limit(100)

      if (filters?.matterId) {
        query = query.eq('matter_id', filters.matterId)
      }
      if (filters?.isArchived !== undefined) {
        query = query.eq('is_archived', filters.isArchived)
      }

      const { data, error } = await query
      if (error) throw error

      // Enrich with matter titles and contact names
      const threads = data as EmailThread[]
      const matterIds = [...new Set(threads.filter((t) => t.matter_id).map((t) => t.matter_id!))]
      const contactIds = [...new Set(threads.filter((t) => t.contact_id).map((t) => t.contact_id!))]

      let matterMap: Record<string, string> = {}
      let contactMap: Record<string, string> = {}

      if (matterIds.length > 0) {
        const { data: matters } = await supabase
          .from('matters')
          .select('id, title')
          .in('id', matterIds)
        if (matters) {
          matterMap = Object.fromEntries(matters.map((m) => [m.id, m.title]))
        }
      }

      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds)
        if (contacts) {
          contactMap = Object.fromEntries(
            contacts.map((c) => [c.id, `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()])
          )
        }
      }

      return threads.map((t) => ({
        ...t,
        matterTitle: t.matter_id ? matterMap[t.matter_id] ?? null : null,
        contactName: t.contact_id ? contactMap[t.contact_id] ?? null : null,
      }))
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// ─── Email Messages for a Thread ────────────────────────────────────────────

export function useEmailMessages(threadId: string) {
  return useQuery({
    queryKey: emailKeys.messages(threadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('received_at', { ascending: true })
      if (error) throw error
      return data as EmailMessage[]
    },
    enabled: !!threadId,
  })
}

// ─── Email Accounts ─────────────────────────────────────────────────────────

export function useEmailAccounts() {
  return useQuery({
    queryKey: emailKeys.accounts(),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('is_active', true)
        .order('created_at')
      if (error) throw error
      return data as EmailAccount[]
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// ─── Unmatched Emails ───────────────────────────────────────────────────────

export function useUnmatchedEmails() {
  return useQuery({
    queryKey: emailKeys.unmatched(),
    queryFn: async () => {
      const res = await fetch('/api/email/unmatched')
      if (!res.ok) throw new Error('Failed to fetch unmatched emails')
      const { data } = await res.json()
      return data as UnmatchedEmailEntry[]
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ─── Send Email ─────────────────────────────────────────────────────────────

export function useSendEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      accountId: string
      to: string[]
      subject: string
      body: string
      cc?: string[]
      bcc?: string[]
      replyToMessageId?: string
      matterId?: string
      bodyType?: 'text' | 'html'
    }) => {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send email')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: emailKeys.all })
      toast.success('Email sent')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send email')
    },
  })
}

// ─── Association Suggestions ─────────────────────────────────────────────────

export interface AssociationSuggestion {
  matterId: string
  matterTitle: string
  matterNumber: string | null
  confidence: number
  reason: string
}

export function useAssociationSuggestions(threadId: string | null) {
  return useQuery({
    queryKey: [...emailKeys.all, 'suggestions', threadId] as const,
    queryFn: async () => {
      const res = await fetch(`/api/email/threads/${threadId}/associate`)
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      const { data } = await res.json()
      return data as AssociationSuggestion[]
    },
    enabled: !!threadId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Resolve / Dismiss Unmatched ─────────────────────────────────────────────

export function useResolveUnmatchedEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      action: 'resolve' | 'dismiss'
      matter_id?: string
    }) => {
      const res = await fetch('/api/email/unmatched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update queue entry')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: emailKeys.unmatched() })
      qc.invalidateQueries({ queryKey: emailKeys.all })
      const action = variables.action === 'resolve' ? 'associated' : 'dismissed'
      toast.success(`Email thread ${action}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update queue entry')
    },
  })
}

// ─── Associate Thread ───────────────────────────────────────────────────────

export function useAssociateThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { threadId: string; matterId: string }) => {
      const res = await fetch(`/api/email/threads/${params.threadId}/associate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matter_id: params.matterId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to associate thread')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: emailKeys.all })
      toast.success('Thread associated to matter')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to associate thread')
    },
  })
}
