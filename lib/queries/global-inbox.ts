'use client'

/**
 * =============================================================================
 * Global Inbox — Tier 2: Front Desk Comm-Center Query Hooks
 * =============================================================================
 * Directive: Communication Sovereignty — Two-Tier Communication Engine
 *
 * Tier 2 fetches ALL incoming messages across the connected Microsoft account,
 * auto-tags each email to its matching NorvaOS Contact/Lead, and flags unknown
 * senders for one-click Lead initialization.
 *
 * No email bodies stored in NorvaOS — streamed directly from Microsoft Graph.
 * =============================================================================
 */

import { useQuery } from '@tanstack/react-query'
import type { GraphEmail } from '@/lib/queries/email-stream'

// ── Extended type with auto-tag data ─────────────────────────────────────────

export interface MatchedContact {
  id: string
  name: string
  client_status: string | null
}

export interface GlobalInboxEmail extends GraphEmail {
  matchedContact: MatchedContact | null
  isUnknownSender: boolean
}

// ── Query Key Factory ────────────────────────────────────────────────────────

export const globalInboxKeys = {
  all: ['global-inbox'] as const,
  list: (folder: string) => ['global-inbox', folder] as const,
}

// ── Global Inbox Query ───────────────────────────────────────────────────────

export function useGlobalInbox(options?: {
  folder?: 'inbox' | 'sentitems' | 'all'
  limit?: number
  skip?: number
  enabled?: boolean
}) {
  const folder = options?.folder ?? 'inbox'
  const limit = options?.limit ?? 50
  const skip = options?.skip ?? 0

  return useQuery({
    queryKey: [...globalInboxKeys.list(folder), limit, skip],
    queryFn: async () => {
      const params = new URLSearchParams({
        folder,
        limit: String(limit),
        skip: String(skip),
      })
      const res = await fetch(
        `/api/integrations/microsoft/global-inbox?${params}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to fetch global inbox')
      }
      const { data } = await res.json()
      return data as GlobalInboxEmail[]
    },
    enabled: options?.enabled !== false,
    staleTime: 30_000, // 30 seconds — global inbox refreshes faster
    refetchInterval: 60_000, // auto-refresh every minute
  })
}
