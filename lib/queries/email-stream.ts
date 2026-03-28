'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphEmailAddress {
  name: string
  address: string
}

export interface GraphEmail {
  id: string
  subject: string
  bodyPreview: string
  body: { content: string }
  from: { emailAddress: GraphEmailAddress }
  toRecipients: { emailAddress: GraphEmailAddress }[]
  ccRecipients: { emailAddress: GraphEmailAddress }[]
  receivedDateTime: string
  hasAttachments: boolean
  isRead: boolean
  importance: string
  conversationId: string
}

export interface SendEmailPayload {
  to: string
  cc?: string
  subject: string
  body: string
  matterId?: string
  contactId?: string
  leadId?: string
}

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const emailStreamKeys = {
  all: ['email-stream'] as const,
  byContact: (contactEmail: string) => ['email-stream', contactEmail] as const,
}

// ─── Email Stream Query ──────────────────────────────────────────────────────

export function useEmailStream(
  contactEmail: string,
  options?: { limit?: number }
) {
  const limit = options?.limit ?? 25

  return useQuery({
    queryKey: emailStreamKeys.byContact(contactEmail),
    queryFn: async () => {
      const params = new URLSearchParams({
        contactEmail,
        limit: String(limit),
      })
      const res = await fetch(
        `/api/integrations/microsoft/email-stream?${params}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to fetch email stream')
      }
      const { data } = await res.json()
      return data as GraphEmail[]
    },
    enabled: !!contactEmail,
    staleTime: 60_000, // 1 minute
  })
}

// ─── Send Email Mutation ─────────────────────────────────────────────────────

export function useSendEmail() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SendEmailPayload) => {
      const res = await fetch('/api/integrations/microsoft/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send email')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: emailStreamKeys.all })
      toast.success('Email sent successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send email')
    },
  })
}
