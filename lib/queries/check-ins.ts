'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type CheckInSession = Database['public']['Tables']['check_in_sessions']['Row']

export interface CheckInWithDetails extends CheckInSession {
  contact_name?: string | null
  appointment_time?: string | null
}

// ── Query Key Factory ───────────────────────────────────────────────────────

export const checkInKeys = {
  all: ['check_ins'] as const,
  today: (tenantId: string) => [...checkInKeys.all, 'today', tenantId] as const,
  session: (id: string) => [...checkInKeys.all, 'session', id] as const,
  byContact: (contactId: string) => [...checkInKeys.all, 'contact', contactId] as const,
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Get today's check-in sessions for the tenant.
 * Used by Front Desk Mode and Command Centre.
 */
export function useTodayCheckIns(tenantId: string) {
  return useQuery({
    queryKey: checkInKeys.today(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      const today = new Date().toISOString().split('T')[0]

      const { data: sessions, error } = await supabase
        .from('check_in_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!sessions || sessions.length === 0) return [] as CheckInWithDetails[]

      // Batch-resolve contact names (Rule #19: no N+1)
      const contactIds = [...new Set(
        sessions.map((s) => s.contact_id).filter(Boolean),
      )] as string[]

      let contactsMap: Record<string, string> = {}
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds)

        contactsMap = Object.fromEntries(
          (contacts ?? []).map((c) => [
            c.id,
            [c.first_name, c.last_name].filter(Boolean).join(' '),
          ]),
        )
      }

      return sessions.map((s) => ({
        ...s,
        contact_name: s.contact_id ? contactsMap[s.contact_id] ?? null : null,
        appointment_time: ((s.metadata as Record<string, unknown>)?.start_time as string) ?? null,
      })) as CheckInWithDetails[]
    },
    enabled: !!tenantId,
    refetchInterval: 30_000, // Auto-refresh every 30s for real-time feel
  })
}

/**
 * Get all completed check-in sessions for a specific contact.
 * Used by the Contact Detail Intake tab to display kiosk question answers.
 */
export function useContactCheckIns(contactId: string) {
  return useQuery({
    queryKey: checkInKeys.byContact(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('check_in_sessions')
        .select('id, status, metadata, completed_at, created_at')
        .eq('contact_id', contactId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        status: string
        metadata: Record<string, unknown> | null
        completed_at: string | null
        created_at: string
      }>
    },
    enabled: !!contactId,
  })
}
