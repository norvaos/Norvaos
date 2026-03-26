/**
 * Front Desk Query Layer  -  Server-Side Projection
 *
 * Dedicated hooks for the front desk console. NEVER uses select('*').
 * Returns ONLY fields the front desk is allowed to see.
 *
 * Rule #10: Separate locked interface  -  own query layer.
 * No billing fields, no document content, no detailed matter notes.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const frontDeskKeys = {
  all: ['front-desk'] as const,
  search: (q: string) => [...frontDeskKeys.all, 'search', q] as const,
  contact: (id: string) => [...frontDeskKeys.all, 'contact', id] as const,
  timeline: (contactId: string) => [...frontDeskKeys.all, 'timeline', contactId] as const,
  riskFlags: (contactId: string) => [...frontDeskKeys.all, 'risk-flags', contactId] as const,
  schedule: (tenantId: string, date: string) => [...frontDeskKeys.all, 'schedule', tenantId, date] as const,
  tasks: (tenantId: string, staffFilter?: string) => [...frontDeskKeys.all, 'tasks', tenantId, staffFilter ?? '__mine'] as const,
  checkIns: (tenantId: string) => [...frontDeskKeys.all, 'check-ins', tenantId] as const,
  staff: (tenantId: string) => [...frontDeskKeys.all, 'staff', tenantId] as const,
  config: (tenantId: string) => [...frontDeskKeys.all, 'config', tenantId] as const,
  practiceAreas: (tenantId: string) => [...frontDeskKeys.all, 'practice-areas', tenantId] as const,
  stats: (tenantId: string) => [...frontDeskKeys.all, 'stats', tenantId] as const,
  activeShift: (userId: string) => [...frontDeskKeys.all, 'active-shift', userId] as const,
  shiftKpis: (shiftId: string) => [...frontDeskKeys.all, 'shift-kpis', shiftId] as const,
  dayKpis: (userId: string, date: string) => [...frontDeskKeys.all, 'day-kpis', userId, date] as const,
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FrontDeskPersonCard {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  phone_primary: string | null
  email_primary: string | null
  last_contacted_at: string | null
  custom_fields: Record<string, unknown> | null
  // Batch-resolved counts
  active_matters_count: number
  open_leads_count: number
  next_appointment: { date: string; time: string } | null
  // Risk flags
  risk_flags: string[]
}

export interface FrontDeskContactDetail {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  phone_primary: string | null
  phone_secondary: string | null
  email_primary: string | null
  email_secondary: string | null
  date_of_birth: string | null
  contact_type: string | null
  last_contacted_at: string | null
  interaction_count: number | null
  engagement_score: number | null
  custom_fields: Record<string, unknown> | null
}

export interface FrontDeskTimelineEvent {
  id: string
  activity_type: string
  title: string
  description: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface FrontDeskAppointment {
  id: string
  guest_name: string | null
  guest_email: string | null
  guest_phone: string | null
  start_time: string | null
  end_time: string | null
  status: string
  user_id: string | null
  contact_id: string | null
  appointment_date: string | null
  booking_page_id: string | null
  duration_minutes: number | null
  room?: string | null
  // Resolved
  staff_name: string | null
  booking_page_title: string | null
}

export interface FrontDeskTask {
  id: string
  title: string
  due_date: string | null
  due_time: string | null
  priority: string | null
  status: string
  assigned_to: string | null
  contact_id: string | null
  contact_name: string | null
  matter_number: string | null
  matter_title: string | null
  created_via: string | null
  created_by: string | null
  assigned_to_name: string | null
}

export interface FrontDeskCheckIn {
  id: string
  status: string
  client_name: string | null
  contact_id: string | null
  booking_appointment_id: string | null
  completed_at: string | null
  started_at: string | null
  id_scan_path: string | null
  id_scan_uploaded_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Resolved
  contact_name: string | null
  appointment_time: string | null
  assigned_staff: string | null
  appointment_status: string | null
}

export interface FrontDeskConfig {
  allowed_templates: string[]
  allowed_appointment_types: string[]
  free_text_follow_up: boolean
  override_booking_permission: boolean
  new_leads_require_id_scan: boolean
  languages: string[]
  sources: string[]
  default_task_bundle: string[]
  task_chains: Record<string, string>
  rooms: string[]
  // Zone visibility toggles
  show_schedule: boolean
  show_tasks: boolean
  show_check_ins: boolean
  show_quick_create: boolean
  show_stats_bar: boolean
  // Action group visibility
  show_action_appointments: boolean
  show_action_tasks: boolean
  show_action_documents: boolean
  show_action_walk_in: boolean
}

const DEFAULT_CONFIG: FrontDeskConfig = {
  allowed_templates: [],
  allowed_appointment_types: [],
  free_text_follow_up: false,
  override_booking_permission: false,
  new_leads_require_id_scan: false,
  languages: [
    'English',
    'French',
    'Arabic',
    'Punjabi',
    'Urdu',
    'Hindi',
    'Mandarin',
    'Cantonese',
    'Tagalog',
    'Portuguese',
    'Spanish',
    'Italian',
    'Polish',
    'Romanian',
    'Tamil',
    'Bengali',
    'Gujarati',
    'Korean',
    'Vietnamese',
    'Persian (Farsi)',
    'Turkish',
    'Somali',
    'Amharic',
    'Russian',
    'Ukrainian',
    'Greek',
    'Tigrinya',
    'Swahili',
    'Pashto',
    'Other',
  ],
  sources: ['Walk-in', 'Phone', 'Website', 'Referral', 'Other'],
  default_task_bundle: [],
  task_chains: {},
  rooms: [],
  show_schedule: true,
  show_tasks: true,
  show_check_ins: true,
  show_quick_create: true,
  show_stats_bar: true,
  show_action_appointments: true,
  show_action_tasks: true,
  show_action_documents: true,
  show_action_walk_in: true,
}

// ─── Search ─────────────────────────────────────────────────────────────────

export function useFrontDeskSearch(query: string) {
  return useQuery({
    queryKey: frontDeskKeys.search(query),
    queryFn: async (): Promise<FrontDeskPersonCard[]> => {
      if (query.trim().length < 2) return []

      const supabase = createClient()
      const term = `%${query.trim()}%`
      const today = new Date().toISOString().split('T')[0]

      // 1. Search contacts  -  explicit column projection
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, preferred_name, phone_primary, email_primary, last_contacted_at, custom_fields')
        .or(`phone_primary.ilike.${term},email_primary.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`)
        .eq('is_archived', false)
        .limit(10)

      if (error) throw error
      if (!contacts || contacts.length === 0) return []

      const contactIds = contacts.map((c) => c.id)

      // 2. Batch-resolve counts (Rule #19: no N+1)
      // Matters link to contacts via the matter_contacts junction table
      const [matterContactsRes, leadsRes, appointmentsRes] = await Promise.all([
        supabase
          .from('matter_contacts')
          .select('contact_id, matter_id, matters!inner(status)')
          .in('contact_id', contactIds),
        supabase
          .from('leads')
          .select('contact_id')
          .in('contact_id', contactIds)
          .eq('status', 'open'),
        supabase
          .from('appointments')
          .select('contact_id, appointment_date, start_time')
          .in('contact_id', contactIds)
          .gte('appointment_date', today)
          .order('appointment_date', { ascending: true })
          .order('start_time', { ascending: true }),
      ])

      // Build lookup maps
      const matterCounts: Record<string, number> = {}
      const leadCounts: Record<string, number> = {}
      const nextAppts: Record<string, { date: string; time: string }> = {}

      for (const mc of matterContactsRes.data ?? []) {
        const matterData = mc.matters as unknown as { status: string } | null
        if (mc.contact_id && matterData && ['active', 'pending'].includes(matterData.status)) {
          matterCounts[mc.contact_id] = (matterCounts[mc.contact_id] ?? 0) + 1
        }
      }
      for (const l of leadsRes.data ?? []) {
        if (l.contact_id) leadCounts[l.contact_id] = (leadCounts[l.contact_id] ?? 0) + 1
      }
      for (const a of appointmentsRes.data ?? []) {
        if (a.contact_id && !nextAppts[a.contact_id]) {
          nextAppts[a.contact_id] = { date: a.appointment_date!, time: a.start_time ?? '' }
        }
      }

      // 3. Build person cards
      return contacts.map((c): FrontDeskPersonCard => {
        const cf = (c.custom_fields ?? {}) as Record<string, unknown>
        const flags: string[] = []
        if (cf.do_not_contact) flags.push('do_not_contact')
        if (cf.id_verification_required) flags.push('id_verification_required')
        if (cf.billing_restricted) flags.push('billing_restricted')
        if (cf.vip) flags.push('vip')

        return {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          preferred_name: c.preferred_name,
          phone_primary: c.phone_primary,
          email_primary: c.email_primary,
          last_contacted_at: c.last_contacted_at,
          custom_fields: c.custom_fields as Record<string, unknown> | null,
          active_matters_count: matterCounts[c.id] ?? 0,
          open_leads_count: leadCounts[c.id] ?? 0,
          next_appointment: nextAppts[c.id] ?? null,
          risk_flags: flags,
        }
      })
    },
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  })
}

// ─── Contact Detail ─────────────────────────────────────────────────────────

export function useFrontDeskContact(contactId: string | null) {
  return useQuery({
    queryKey: frontDeskKeys.contact(contactId ?? ''),
    queryFn: async (): Promise<FrontDeskContactDetail | null> => {
      if (!contactId) return null

      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          id, first_name, last_name, preferred_name,
          phone_primary, phone_secondary, email_primary, email_secondary,
          date_of_birth, contact_type,
          last_contacted_at, interaction_count, engagement_score,
          custom_fields
        `)
        .eq('id', contactId)
        .single()

      if (error) throw error
      return data as FrontDeskContactDetail
    },
    enabled: !!contactId,
  })
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export function useFrontDeskTimeline(contactId: string | null) {
  return useQuery({
    queryKey: frontDeskKeys.timeline(contactId ?? ''),
    queryFn: async (): Promise<FrontDeskTimelineEvent[]> => {
      if (!contactId) return []

      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .select('id, activity_type, title, description, created_at, metadata')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(25)

      if (error) throw error
      return (data ?? []) as FrontDeskTimelineEvent[]
    },
    enabled: !!contactId,
  })
}

// ─── Risk Flags ─────────────────────────────────────────────────────────────

export function useFrontDeskRiskFlags(contactId: string | null) {
  return useQuery({
    queryKey: frontDeskKeys.riskFlags(contactId ?? ''),
    queryFn: async (): Promise<string[]> => {
      if (!contactId) return []

      const supabase = createClient()
      const flags: string[] = []

      // Get contact custom_fields for flags
      const { data: contact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single()

      const cf = ((contact?.custom_fields ?? {}) as Record<string, unknown>)
      if (cf.do_not_contact) flags.push('do_not_contact')
      if (cf.id_verification_required) flags.push('id_verification_required')
      if (cf.billing_restricted) flags.push('billing_restricted')
      if (cf.vip) flags.push('vip')
      if (cf.special_needs) flags.push('special_needs')

      return flags
    },
    enabled: !!contactId,
    staleTime: 60_000,
  })
}

// ─── Today's Schedule ───────────────────────────────────────────────────────

export function useTodaySchedule(tenantId: string, date: string) {
  return useQuery({
    queryKey: frontDeskKeys.schedule(tenantId, date),
    queryFn: async (): Promise<{ staffName: string; staffId: string | null; appointments: FrontDeskAppointment[] }[]> => {
      const supabase = createClient()

      // Select base columns  -  'room' may not exist pre-migration 048, so we
      // use 'as any' on the select and cast the result.
      type ApptRow = { id: string; guest_name: string | null; guest_email: string | null; guest_phone: string | null; start_time: string | null; end_time: string | null; status: string; user_id: string; contact_id: string | null; appointment_date: string | null; booking_page_id: string | null; duration_minutes: number | null; room?: string | null }

      const { data: rawAppointments, error } = await supabase
        .from('appointments')
        .select('id, guest_name, guest_email, guest_phone, start_time, end_time, status, user_id, contact_id, appointment_date, booking_page_id, duration_minutes' as any)
        .eq('appointment_date', date)
        .order('start_time', { ascending: true })

      if (error) throw error
      const appointments = (rawAppointments ?? []) as unknown as ApptRow[]
      if (appointments.length === 0) return []

      // Batch resolve staff and booking pages (Rule #19)
      const userIds = [...new Set(appointments.map((a) => a.user_id).filter(Boolean))] as string[]
      const pageIds = [...new Set(appointments.map((a) => a.booking_page_id).filter(Boolean))] as string[]

      const [usersRes, pagesRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, first_name, last_name').in('id', userIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] },
        pageIds.length > 0
          ? supabase.from('booking_pages').select('id, title').in('id', pageIds)
          : { data: [] as { id: string; title: string }[] },
      ])

      const usersMap = Object.fromEntries(
        (usersRes.data ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
      )
      const pagesMap = Object.fromEntries(
        (pagesRes.data ?? []).map((p) => [p.id, p.title])
      )

      // Enrich + group by staff
      const enriched: FrontDeskAppointment[] = appointments.map((a) => ({
        ...a,
        staff_name: a.user_id ? usersMap[a.user_id] ?? 'Unassigned' : null,
        booking_page_title: a.booking_page_id ? pagesMap[a.booking_page_id] ?? null : null,
      }))

      // Group by staff
      const grouped: Record<string, FrontDeskAppointment[]> = {}
      for (const apt of enriched) {
        const key = apt.user_id ?? '__unassigned'
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(apt)
      }

      return Object.entries(grouped).map(([staffId, apts]) => ({
        staffName: staffId === '__unassigned' ? 'Unassigned' : usersMap[staffId] ?? 'Unknown',
        staffId: staffId === '__unassigned' ? null : staffId,
        appointments: apts,
      }))
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Live Tasks Queue ───────────────────────────────────────────────────────

export function useFrontDeskTasks(tenantId: string, currentUserId: string, staffFilter: string = '__mine') {
  return useQuery({
    queryKey: frontDeskKeys.tasks(tenantId, staffFilter),
    queryFn: async (): Promise<FrontDeskTask[]> => {
      const supabase = createClient()
      const selectCols = 'id, title, due_date, due_time, priority, status, assigned_to, contact_id, matter_id, created_via, created_by'

      let tasks: { id: string; title: string; due_date: string | null; due_time: string | null; priority: string | null; status: string; assigned_to: string | null; contact_id: string | null; matter_id: string | null; created_via: string | null; created_by: string | null }[]

      if (staffFilter === '__all') {
        // All open tasks for the tenant
        const { data, error } = await supabase
          .from('tasks')
          .select(selectCols)
          .eq('tenant_id', tenantId)
          .in('status', ['not_started', 'working_on_it', 'stuck'])
          .eq('is_deleted', false)
          .order('due_date', { ascending: true })
          .limit(50)
        if (error) throw error
        tasks = (data ?? []) as typeof tasks
      } else if (staffFilter !== '__mine') {
        // Specific staff member's tasks
        const { data, error } = await supabase
          .from('tasks')
          .select(selectCols)
          .eq('tenant_id', tenantId)
          .eq('assigned_to', staffFilter)
          .in('status', ['not_started', 'working_on_it', 'stuck'])
          .eq('is_deleted', false)
          .order('due_date', { ascending: true })
          .limit(25)
        if (error) throw error
        tasks = (data ?? []) as typeof tasks
      } else {
        // Default: my tasks (assigned to me + created by me for others)
        const [assignedRes, createdRes] = await Promise.all([
          supabase
            .from('tasks')
            .select(selectCols)
            .eq('tenant_id', tenantId)
            .eq('assigned_to', currentUserId)
            .in('status', ['not_started', 'working_on_it', 'stuck'])
            .eq('is_deleted', false)
            .order('due_date', { ascending: true })
            .limit(25),
          supabase
            .from('tasks')
            .select(selectCols)
            .eq('tenant_id', tenantId)
            .eq('created_by', currentUserId)
            .neq('assigned_to', currentUserId)
            .in('status', ['not_started', 'working_on_it', 'stuck'])
            .eq('is_deleted', false)
            .order('due_date', { ascending: true })
            .limit(15),
        ])
        if (assignedRes.error) throw assignedRes.error
        if (createdRes.error) throw createdRes.error

        const taskMap = new Map<string, (typeof assignedRes.data)[0]>()
        for (const t of assignedRes.data ?? []) taskMap.set(t.id, t)
        for (const t of createdRes.data ?? []) {
          if (!taskMap.has(t.id)) taskMap.set(t.id, t)
        }
        tasks = Array.from(taskMap.values()) as typeof tasks
      }
      if (tasks.length === 0) return []

      // Batch resolve contacts, matters, and assigned-to users (Rule #19)
      const contactIds = [...new Set(tasks.map((t) => t.contact_id).filter(Boolean))] as string[]
      const matterIds = [...new Set(tasks.map((t) => t.matter_id).filter(Boolean))] as string[]
      const assignedUserIds = [...new Set(tasks.map((t) => t.assigned_to).filter(Boolean))] as string[]

      const [contactsRes, mattersRes, usersRes] = await Promise.all([
        contactIds.length > 0
          ? supabase.from('contacts').select('id, first_name, last_name').in('id', contactIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] },
        matterIds.length > 0
          ? supabase.from('matters').select('id, matter_number, title').in('id', matterIds)
          : { data: [] as { id: string; matter_number: string | null; title: string | null }[] },
        assignedUserIds.length > 0
          ? supabase.from('users').select('id, first_name, last_name').in('id', assignedUserIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] },
      ])

      const contactsMap = Object.fromEntries(
        (contactsRes.data ?? []).map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')])
      )
      const mattersMap = Object.fromEntries(
        (mattersRes.data ?? []).map((m) => [m.id, { number: m.matter_number, title: m.title }])
      )
      const usersMap = Object.fromEntries(
        (usersRes.data ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
      )

      // Sort: assigned to me first, then by due date
      return tasks
        .sort((a, b) => {
          // Assigned to me first
          const aIsMine = a.assigned_to === currentUserId ? 0 : 1
          const bIsMine = b.assigned_to === currentUserId ? 0 : 1
          if (aIsMine !== bIsMine) return aIsMine - bIsMine
          // Then by due date
          if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
          if (a.due_date) return -1
          if (b.due_date) return 1
          return 0
        })
        .map((t): FrontDeskTask => ({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          due_time: t.due_time,
          priority: t.priority,
          status: t.status,
          assigned_to: t.assigned_to,
          contact_id: t.contact_id,
          contact_name: t.contact_id ? contactsMap[t.contact_id] ?? null : null,
          matter_number: t.matter_id ? mattersMap[t.matter_id]?.number ?? null : null,
          matter_title: t.matter_id ? mattersMap[t.matter_id]?.title ?? null : null,
          created_via: t.created_via,
          created_by: t.created_by,
          assigned_to_name: t.assigned_to ? usersMap[t.assigned_to] ?? null : null,
        }))
    },
    enabled: !!tenantId && !!currentUserId,
    refetchInterval: 8_000,   // Poll every 8s  -  realtime handles instant updates
    staleTime: 5_000,
  })
}

// ─── Check-in Queue ─────────────────────────────────────────────────────────

export function useFrontDeskCheckIns(tenantId: string) {
  return useQuery({
    queryKey: frontDeskKeys.checkIns(tenantId),
    queryFn: async (): Promise<FrontDeskCheckIn[]> => {
      const supabase = createClient()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: sessions, error } = await supabase
        .from('check_in_sessions')
        .select('id, status, client_name, contact_id, booking_appointment_id, completed_at, started_at, id_scan_path, id_scan_uploaded_at, metadata, created_at')
        .gte('created_at', todayStart.toISOString())
        .not('status', 'in', '("completed","abandoned","acknowledged")')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!sessions || sessions.length === 0) return []

      // Batch resolve contacts and appointments
      const contactIds = [...new Set(sessions.map((s) => s.contact_id).filter(Boolean))] as string[]
      const apptIds = [...new Set(sessions.map((s) => s.booking_appointment_id).filter(Boolean))] as string[]

      const [contactsRes, apptsRes] = await Promise.all([
        contactIds.length > 0
          ? supabase.from('contacts').select('id, first_name, last_name').in('id', contactIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] },
        apptIds.length > 0
          ? supabase.from('appointments').select('id, start_time, user_id, status').in('id', apptIds)
          : { data: [] as { id: string; start_time: string | null; user_id: string | null; status: string }[] },
      ])

      const contactsMap = Object.fromEntries(
        (contactsRes.data ?? []).map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')])
      )

      // Resolve staff names for appointments
      const staffIds = [...new Set((apptsRes.data ?? []).map((a) => a.user_id).filter(Boolean))] as string[]
      const staffRes = staffIds.length > 0
        ? await supabase.from('users').select('id, first_name, last_name').in('id', staffIds)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] }
      const staffMap = Object.fromEntries(
        (staffRes.data ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
      )

      const apptsMap = Object.fromEntries(
        (apptsRes.data ?? []).map((a) => [a.id, { time: a.start_time, staffId: a.user_id, status: a.status }])
      )

      return sessions.map((s): FrontDeskCheckIn => {
        const meta = (s.metadata ?? {}) as Record<string, unknown>
        const apptInfo = s.booking_appointment_id ? apptsMap[s.booking_appointment_id] : null

        return {
          id: s.id,
          status: s.status,
          client_name: s.client_name,
          contact_id: s.contact_id,
          booking_appointment_id: s.booking_appointment_id,
          completed_at: s.completed_at,
          started_at: s.started_at,
          id_scan_path: s.id_scan_path,
          id_scan_uploaded_at: s.id_scan_uploaded_at,
          metadata: s.metadata as Record<string, unknown> | null,
          created_at: s.created_at,
          contact_name: s.contact_id ? contactsMap[s.contact_id] ?? (meta.guest_name as string) ?? null : (s.client_name ?? (meta.guest_name as string) ?? null),
          appointment_time: apptInfo?.time ?? null,
          assigned_staff: apptInfo?.staffId ? staffMap[apptInfo.staffId] ?? null : null,
          appointment_status: apptInfo?.status ?? null,
        }
      })
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Staff List ─────────────────────────────────────────────────────────────

export function useFrontDeskStaffList(tenantId: string) {
  return useQuery({
    queryKey: frontDeskKeys.staff(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name')

      if (error) throw error
      return (data ?? []).map((u) => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' '),
      }))
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })
}

// ─── Practice Areas ─────────────────────────────────────────────────────────

export function useFrontDeskPracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: frontDeskKeys.practiceAreas(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return data ?? []
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })
}

// ─── Front Desk Config ──────────────────────────────────────────────────────

export function useFrontDeskConfig(tenantId: string) {
  return useQuery({
    queryKey: frontDeskKeys.config(tenantId),
    queryFn: async (): Promise<FrontDeskConfig> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      if (error) throw error

      const settings = (data?.settings ?? {}) as Record<string, unknown>
      const fdConfig = (settings.front_desk_config ?? {}) as Partial<FrontDeskConfig>

      return { ...DEFAULT_CONFIG, ...fdConfig }
    },
    enabled: !!tenantId,
    staleTime: 120_000,
  })
}

// ─── Quick Stats ────────────────────────────────────────────────────────────

export function useFrontDeskStats(tenantId: string) {
  return useQuery({
    queryKey: frontDeskKeys.stats(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [appointmentsRes, completedRes, checkInsRes, walkInsRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('appointment_date', today),
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('appointment_date', today)
          .eq('status', 'completed'),
        supabase
          .from('check_in_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('check_in_sessions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString())
          .is('booking_appointment_id', null),
      ])

      return {
        appointmentsTotal: appointmentsRes.count ?? 0,
        appointmentsCompleted: completedRes.count ?? 0,
        checkInsWaiting: (checkInsRes.count ?? 0),
        walkInsToday: walkInsRes.count ?? 0,
      }
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Interaction Breakdown ───────────────────────────────────────────────────

export interface InteractionBreakdown {
  inbound_calls: number
  outbound_calls: number
  no_answer: number
  voicemail: number
  busy: number
  wrong_number: number
  emails: number
  meetings: number
  meetings_in_person: number
  meetings_video: number
  meetings_phone: number
  total: number
}

export function useFrontDeskInteractionBreakdown(contactId: string | null) {
  return useQuery({
    queryKey: [...frontDeskKeys.all, 'interaction-breakdown', contactId ?? ''] as const,
    queryFn: async (): Promise<InteractionBreakdown> => {
      const blank: InteractionBreakdown = {
        inbound_calls: 0, outbound_calls: 0, no_answer: 0, voicemail: 0,
        busy: 0, wrong_number: 0, emails: 0, meetings: 0,
        meetings_in_person: 0, meetings_video: 0, meetings_phone: 0, total: 0,
      }
      if (!contactId) return blank

      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .select('activity_type, metadata')
        .eq('contact_id', contactId)
        .in('activity_type', ['front_desk_call_logged', 'front_desk_email_logged', 'front_desk_meeting_logged'])
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error

      const result: InteractionBreakdown = { ...blank }

      for (const row of data ?? []) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>
        if (row.activity_type === 'front_desk_call_logged') {
          const outcome = meta.outcome as string | undefined
          const direction = meta.direction as string | undefined
          if (outcome === 'connected') {
            if (direction === 'inbound') result.inbound_calls++
            else result.outbound_calls++
          } else if (outcome === 'no_answer') {
            result.no_answer++
          } else if (outcome === 'voicemail') {
            result.voicemail++
          } else if (outcome === 'busy') {
            result.busy++
          } else if (outcome === 'wrong_number') {
            result.wrong_number++
          } else {
            // Any other call outcome counts toward outbound/inbound
            if (direction === 'inbound') result.inbound_calls++
            else result.outbound_calls++
          }
        } else if (row.activity_type === 'front_desk_email_logged') {
          result.emails++
        } else if (row.activity_type === 'front_desk_meeting_logged') {
          result.meetings++
          const meetingType = meta.meeting_type as string | undefined
          if (meetingType === 'in_person') result.meetings_in_person++
          else if (meetingType === 'video') result.meetings_video++
          else if (meetingType === 'phone') result.meetings_phone++
        }
      }

      result.total =
        result.inbound_calls + result.outbound_calls +
        result.no_answer + result.voicemail + result.busy + result.wrong_number +
        result.emails + result.meetings

      return result
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })
}

// ─── Active Shift Hook ───────────────────────────────────────────────────────

export interface FrontDeskActiveShift {
  id: string
  started_at: string
  shift_date: string
  onBreak: boolean
  breakStartedAt: string | null
}

export function useFrontDeskActiveShift(userId: string) {
  return useQuery({
    queryKey: frontDeskKeys.activeShift(userId),
    queryFn: async (): Promise<FrontDeskActiveShift | null> => {
      const supabase = createClient()
      const { data, error } = await (supabase
        .from('front_desk_shifts' as any)
        .select('id, started_at, shift_date') as any)
        .eq('user_id', userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      const shift = data as { id: string; started_at: string; shift_date: string }

      // Check if currently on lunch break by looking at last break event
      const { data: lastBreakEvent } = await (supabase
        .from('front_desk_events' as any)
        .select('event_type, created_at') as any)
        .eq('shift_id', shift.id)
        .in('event_type', ['lunch_break_start', 'lunch_break_end'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const onBreak = lastBreakEvent?.event_type === 'lunch_break_start'
      const breakStartedAt = onBreak ? (lastBreakEvent?.created_at ?? null) : null

      return { ...shift, onBreak, breakStartedAt }
    },
    enabled: !!userId,
    staleTime: 0,            // Always stale  -  refetch immediately on focus/invalidation
    refetchInterval: 10_000, // Poll every 10s as fallback
    refetchOnMount: 'always',// Always hit DB on mount, never serve stale cache
  })
}

// ─── Shift KPI Hook ──────────────────────────────────────────────────────────

export interface ShiftKpiValue {
  key: string
  label: string
  value: number | null
  displayValue: string
  color: 'green' | 'amber' | 'red' | 'grey'
  unit: string
  target: number
  category: 'volume' | 'efficiency' | 'quality' | 'productivity'
}

export interface ShiftKpiResponse {
  mode: 'shift' | 'day'
  shiftId?: string
  userId?: string
  date?: string
  shiftCount?: number
  kpis: ShiftKpiValue[]
  raw: Record<string, number | null>
  responseTimes: { avg_minutes: number | null; p95_minutes: number | null } | null
}

/**
 * Fetches KPIs for a specific shift. Refetches every 60 seconds.
 */
export function useFrontDeskShiftKpis(shiftId: string | null) {
  return useQuery({
    queryKey: frontDeskKeys.shiftKpis(shiftId ?? ''),
    queryFn: async (): Promise<ShiftKpiResponse | null> => {
      if (!shiftId) return null

      const response = await fetch(`/api/front-desk/kpis?shiftId=${shiftId}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to fetch KPIs')
      }

      return response.json() as Promise<ShiftKpiResponse>
    },
    enabled: !!shiftId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

/**
 * Fetches aggregated KPIs for a user on a specific date.
 */
export function useFrontDeskDayKpis(userId: string | null, date: string | null) {
  return useQuery({
    queryKey: frontDeskKeys.dayKpis(userId ?? '', date ?? ''),
    queryFn: async (): Promise<ShiftKpiResponse | null> => {
      if (!userId || !date) return null

      const response = await fetch(`/api/front-desk/kpis?userId=${userId}&date=${date}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to fetch KPIs')
      }

      return response.json() as Promise<ShiftKpiResponse>
    },
    enabled: !!userId && !!date,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

// ─── Kiosk Questions ─────────────────────────────────────────────────────────

export interface TenantKioskQuestionOption {
  label: string
  value: string
}

export interface TenantKioskQuestion {
  id: string
  field_type: 'select' | 'multi_select' | 'text' | 'textarea' | 'boolean' | 'date' | 'country'
  label: string
  description?: string
  is_required: boolean
  options?: TenantKioskQuestionOption[]
  sort_order: number
  condition?: {
    field_id: string
    operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_truthy' | 'is_falsy'
    value?: string | string[]
  }
}

/**
 * Fetches kiosk screening questions from tenant settings.
 * Stored at: tenants.settings.kiosk_config.kiosk_questions (JSONB array)
 */
export function useTenantKioskQuestions(tenantId: string) {
  return useQuery({
    queryKey: [...frontDeskKeys.all, 'kiosk-questions', tenantId] as const,
    queryFn: async (): Promise<TenantKioskQuestion[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      if (error) throw error

      const settings = (data?.settings ?? {}) as Record<string, unknown>
      const kioskConfig = (settings.kiosk_config ?? {}) as Record<string, unknown>
      const questions = (kioskConfig.kiosk_questions ?? []) as TenantKioskQuestion[]
      return questions.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    },
    enabled: !!tenantId,
    staleTime: 120_000,
  })
}

/**
 * Fetches the kiosk self-check-in URL for the tenant.
 * Tries portal_links table first (link_type='kiosk'), then falls back to
 * tenants.settings.kiosk_token.
 */
export function useTenantKioskUrl(tenantId: string) {
  return useQuery({
    queryKey: [...frontDeskKeys.all, 'kiosk-url', tenantId] as const,
    queryFn: async (): Promise<string | null> => {
      const supabase = createClient()

      // Try portal_links table first
      try {
        const { data } = await (supabase as any)
          .from('portal_links')
          .select('kiosk_token')
          .is('matter_id', null)
          .limit(1)
          .maybeSingle()

        if (data?.kiosk_token) {
          return `/kiosk/${data.kiosk_token}`
        }
      } catch {
        // table may not exist yet  -  fall through
      }

      // Fallback: read from tenant settings
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      const settings = ((tenantData?.settings ?? {}) as Record<string, unknown>)
      const kioskToken = settings.kiosk_token as string | undefined
      if (kioskToken) return `/kiosk/${kioskToken}`

      return null
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })
}
