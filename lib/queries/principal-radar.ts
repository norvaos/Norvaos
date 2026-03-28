'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverriddenLead {
  override_id: string
  lead_id: string
  gate_key: string
  blocked_node: string
  justification: string
  authorized_role: string
  authorized_by: string
  created_at: string
  // Joined from leads + contacts
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  assigned_to: string | null
  assigned_user_name: string | null
  lead_status: string | null
  lead_source: string | null
}

export interface StaleLead {
  lead_id: string
  contact_id: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  assigned_to: string | null
  assigned_user_name: string | null
  lead_status: string | null
  lead_source: string | null
  last_activity: string | null // GREATEST(last_inbound_at, last_outbound_at, updated_at)
  hours_stale: number
  engagement_score: number | null
}

export interface ExpiredSnoozeLead {
  lead_id: string
  contact_id: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  assigned_to: string | null
  assigned_user_name: string | null
  lead_status: string | null
  current_stage: string | null
  snooze_until: string
  snoozed_at: string | null
  hours_overdue: number
}

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const radarKeys = {
  all: ['principal-radar'] as const,
  overrides: (tenantId: string) => [...radarKeys.all, 'overrides', tenantId] as const,
  stale: (tenantId: string) => [...radarKeys.all, 'stale', tenantId] as const,
  expiredSnoozes: (tenantId: string) => [...radarKeys.all, 'expired-snoozes', tenantId] as const,
}

// ---------------------------------------------------------------------------
// Overridden Leads  -  compliance_overrides with golden_thread_gate_bypass
// ---------------------------------------------------------------------------

export function useOverriddenLeads(tenantId: string) {
  return useQuery({
    queryKey: radarKeys.overrides(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      // Fetch active golden thread overrides
      const { data: overrides, error: overrideErr } = await supabase
        .from('compliance_overrides')
        .select('id, matter_id, blocked_node, justification, authorized_role, authorized_by, created_at')
        .eq('tenant_id', tenantId)
        .eq('override_type', 'golden_thread_gate_bypass')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50)

      if (overrideErr) throw overrideErr
      if (!overrides || overrides.length === 0) return [] as OverriddenLead[]

      // Get unique lead IDs (stored in matter_id column)
      const leadIds = [...new Set(overrides.map((o) => o.matter_id).filter(Boolean))] as string[]

      // Fetch leads with contact info
      const { data: leads } = await supabase
        .from('leads')
        .select('id, contact_id, assigned_to, status, source')
        .in('id', leadIds)

      const leadsMap = new Map((leads ?? []).map((l) => [l.id, l]))

      // Fetch contacts for name resolution
      const contactIds = [...new Set((leads ?? []).map((l) => l.contact_id).filter(Boolean))] as string[]
      const { data: contacts } = contactIds.length > 0
        ? await supabase
            .from('contacts')
            .select('id, first_name, last_name, email_primary')
            .in('id', contactIds)
        : { data: [] }

      const contactsMap = new Map((contacts ?? []).map((c) => [c.id, c]))

      // Fetch assigned user names
      const assignedIds = [...new Set((leads ?? []).map((l) => l.assigned_to).filter(Boolean))] as string[]
      const { data: users } = assignedIds.length > 0
        ? await supabase
            .from('users')
            .select('id, first_name, last_name')
            .in('id', assignedIds)
        : { data: [] }

      const usersMap = new Map((users ?? []).map((u) => [u.id, u]))

      // Compose results
      return overrides.map((o): OverriddenLead => {
        const lead = leadsMap.get(o.matter_id ?? '')
        const contact = lead?.contact_id ? contactsMap.get(lead.contact_id) : null
        const assignedUser = lead?.assigned_to ? usersMap.get(lead.assigned_to) : null
        const gateKey = (o.blocked_node ?? '').replace('golden_thread.', '')

        return {
          override_id: o.id,
          lead_id: o.matter_id ?? '',
          gate_key: gateKey,
          blocked_node: o.blocked_node ?? '',
          justification: o.justification ?? '',
          authorized_role: o.authorized_role ?? '',
          authorized_by: o.authorized_by ?? '',
          created_at: o.created_at ?? '',
          contact_first_name: contact?.first_name ?? null,
          contact_last_name: contact?.last_name ?? null,
          contact_email: contact?.email_primary ?? null,
          assigned_to: lead?.assigned_to ?? null,
          assigned_user_name: assignedUser
            ? [assignedUser.first_name, assignedUser.last_name].filter(Boolean).join(' ')
            : null,
          lead_status: lead?.status ?? null,
          lead_source: lead?.source ?? null,
        }
      })
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2, // 2 min
  })
}

// ---------------------------------------------------------------------------
// Stale Leads  -  last activity > 48 hours ago
// ---------------------------------------------------------------------------

export function useStaleLeads(tenantId: string) {
  return useQuery({
    queryKey: radarKeys.stale(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      // Fetch leads where the most recent activity timestamp is older than 48h
      // We check updated_at as the baseline; last_inbound_at and last_outbound_at
      // capture communication activity
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, contact_id, assigned_to, status, source, engagement_score, updated_at, last_inbound_at, last_outbound_at')
        .eq('tenant_id', tenantId)
        .in('status', ['new', 'contacted', 'qualified', 'nurturing'])
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(50)

      if (error) throw error
      if (!leads || leads.length === 0) return [] as StaleLead[]

      // Filter: only truly stale (all activity timestamps are old)
      const staleLeads = leads.filter((l) => {
        const timestamps = [l.updated_at, l.last_inbound_at, l.last_outbound_at].filter(Boolean) as string[]
        const latest = timestamps.reduce((a, b) => (a > b ? a : b), '')
        return latest < cutoff
      })

      if (staleLeads.length === 0) return [] as StaleLead[]

      // Batch fetch contacts
      const contactIds = [...new Set(staleLeads.map((l) => l.contact_id).filter(Boolean))] as string[]
      const { data: contacts } = contactIds.length > 0
        ? await supabase.from('contacts').select('id, first_name, last_name, email_primary').in('id', contactIds)
        : { data: [] }
      const contactsMap = new Map((contacts ?? []).map((c) => [c.id, c]))

      // Batch fetch assigned users
      const assignedIds = [...new Set(staleLeads.map((l) => l.assigned_to).filter(Boolean))] as string[]
      const { data: users } = assignedIds.length > 0
        ? await supabase.from('users').select('id, first_name, last_name').in('id', assignedIds)
        : { data: [] }
      const usersMap = new Map((users ?? []).map((u) => [u.id, u]))

      return staleLeads.map((l): StaleLead => {
        const contact = l.contact_id ? contactsMap.get(l.contact_id) : null
        const assignedUser = l.assigned_to ? usersMap.get(l.assigned_to) : null
        const timestamps = [l.updated_at, l.last_inbound_at, l.last_outbound_at].filter(Boolean) as string[]
        const lastActivity = timestamps.reduce((a, b) => (a > b ? a : b), '')
        const hoursStale = lastActivity
          ? Math.round((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60))
          : 999

        return {
          lead_id: l.id,
          contact_id: l.contact_id,
          contact_first_name: contact?.first_name ?? null,
          contact_last_name: contact?.last_name ?? null,
          contact_email: contact?.email_primary ?? null,
          assigned_to: l.assigned_to ?? null,
          assigned_user_name: assignedUser
            ? [assignedUser.first_name, assignedUser.last_name].filter(Boolean).join(' ')
            : null,
          lead_status: l.status ?? null,
          lead_source: l.source ?? null,
          last_activity: lastActivity || null,
          hours_stale: hoursStale,
          engagement_score: l.engagement_score ?? null,
        }
      })
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ---------------------------------------------------------------------------
// Expired Snoozes  -  Smart Pause leads whose snooze_until has passed
// ---------------------------------------------------------------------------

export function useExpiredSnoozeLeads(tenantId: string) {
  return useQuery({
    queryKey: radarKeys.expiredSnoozes(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      // Fetch snoozed leads whose snooze_until is in the past
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, contact_id, assigned_to, status, current_stage, snooze_until, snoozed_at, engagement_score')
        .eq('tenant_id', tenantId)
        .eq('visibility_status', 'snoozed')
        .lt('snooze_until', new Date().toISOString())
        .order('snooze_until', { ascending: true })
        .limit(50)

      if (error) throw error
      if (!leads || leads.length === 0) return [] as ExpiredSnoozeLead[]

      // Batch fetch contacts
      const contactIds = [...new Set(leads.map((l) => l.contact_id).filter(Boolean))] as string[]
      const { data: contacts } = contactIds.length > 0
        ? await supabase.from('contacts').select('id, first_name, last_name, email_primary').in('id', contactIds)
        : { data: [] }
      const contactsMap = new Map((contacts ?? []).map((c) => [c.id, c]))

      // Batch fetch assigned users
      const assignedIds = [...new Set(leads.map((l) => l.assigned_to).filter(Boolean))] as string[]
      const { data: users } = assignedIds.length > 0
        ? await supabase.from('users').select('id, first_name, last_name').in('id', assignedIds)
        : { data: [] }
      const usersMap = new Map((users ?? []).map((u) => [u.id, u]))

      return leads.map((l): ExpiredSnoozeLead => {
        const contact = l.contact_id ? contactsMap.get(l.contact_id) : null
        const assignedUser = l.assigned_to ? usersMap.get(l.assigned_to) : null
        const hoursOverdue = l.snooze_until
          ? Math.round((Date.now() - new Date(l.snooze_until).getTime()) / (1000 * 60 * 60))
          : 0

        return {
          lead_id: l.id,
          contact_id: l.contact_id,
          contact_first_name: contact?.first_name ?? null,
          contact_last_name: contact?.last_name ?? null,
          contact_email: contact?.email_primary ?? null,
          assigned_to: l.assigned_to ?? null,
          assigned_user_name: assignedUser
            ? [assignedUser.first_name, assignedUser.last_name].filter(Boolean).join(' ')
            : null,
          lead_status: l.status ?? null,
          current_stage: l.current_stage ?? null,
          snooze_until: l.snooze_until!,
          snoozed_at: l.snoozed_at ?? null,
          hours_overdue: hoursOverdue,
        }
      })
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ---------------------------------------------------------------------------
// Nudge Mutation  -  sends in-app notification to assigned staff
// ---------------------------------------------------------------------------

export function useNudgeStaff() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      recipientUserId: string
      leadId: string
      contactName: string
      reason: 'stale_engagement' | 'overridden_gate'
      detail?: string
    }) => {
      const supabase = createClient()

      const title = input.reason === 'stale_engagement'
        ? `🔴 Stale Lead Alert: ${input.contactName}`
        : `⚠️ Overridden Gate Alert: ${input.contactName}`

      const message = input.reason === 'stale_engagement'
        ? `Lead "${input.contactName}" has had no activity for over 48 hours. Immediate follow-up required.`
        : `Lead "${input.contactName}" has an overridden gate${input.detail ? `: ${input.detail}` : ''}. Review and resolve.`

      // 1. Update last_nudged_at on the lead
      const { error: nudgeErr } = await supabase
        .from('leads')
        .update({ last_nudged_at: new Date().toISOString() })
        .eq('id', input.leadId)

      if (nudgeErr) throw nudgeErr

      // 2. Dispatch high-priority notification to assigned staff
      //    metadata.flash_stage = 'strategy' tells the UI to pulse
      //    the Stage 4 (Strategy) node in the staff's Golden Thread
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          tenant_id: input.tenantId,
          user_id: input.recipientUserId,
          title,
          message,
          notification_type: 'principal_nudge',
          entity_type: 'lead',
          entity_id: input.leadId,
          channels: ['in_app'],
          priority: 'high',
          metadata: {
            flash_stage: 'strategy',
            nudged_by: 'principal',
            reason: input.reason,
          },
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('Nudge sent — staff member notified')
      // Invalidate radar queries so the UI reflects the update
      qc.invalidateQueries({ queryKey: radarKeys.all })
    },
    onError: () => {
      toast.error('Failed to send nudge notification')
    },
  })
}
