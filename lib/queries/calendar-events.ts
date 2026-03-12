'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'
import { calendarKeys } from './calendar'

type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row']
type CalendarEventInsert = Database['public']['Tables']['calendar_events']['Insert']
type CalendarEventUpdate = Database['public']['Tables']['calendar_events']['Update']
type AttendeeRow = Database['public']['Tables']['calendar_event_attendees']['Row']
type AttendeeInsert = Database['public']['Tables']['calendar_event_attendees']['Insert']

// Query keys
export const calendarEventKeys = {
  all: ['calendar-events'] as const,
  detail: (id: string) => [...calendarEventKeys.all, id] as const,
  attendees: (eventId: string) => [...calendarEventKeys.all, eventId, 'attendees'] as const,
}

// ── Single Event ────────────────────────────────────────
export function useCalendarEvent(eventId: string) {
  return useQuery({
    queryKey: calendarEventKeys.detail(eventId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single()
      if (error) throw error

      // Separately fetch linked matter and contact names
      let matterTitle: string | null = null
      let contactName: string | null = null

      if (data.matter_id) {
        const { data: m } = await supabase
          .from('matters')
          .select('id, title')
          .eq('id', data.matter_id)
          .single()
        matterTitle = m?.title ?? null
      }
      if (data.contact_id) {
        const { data: c } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .eq('id', data.contact_id)
          .single()
        contactName = c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null : null
      }

      return { ...data, matterTitle, contactName } as CalendarEventRow & {
        matterTitle: string | null
        contactName: string | null
      }
    },
    enabled: !!eventId,
  })
}

// ── Event Attendees ──────────────────────────────────────
export function useEventAttendees(eventId: string) {
  return useQuery({
    queryKey: calendarEventKeys.attendees(eventId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('calendar_event_attendees')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at')
      if (error) throw error
      return data as AttendeeRow[]
    },
    enabled: !!eventId,
  })
}

// ── Create Event ─────────────────────────────────────────
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (event: CalendarEventInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(event)
        .select()
        .single()
      if (error) throw error
      return data as CalendarEventRow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all })
      toast.success('Event created')
    },
    onError: () => {
      toast.error('Failed to create event')
    },
  })
}

// ── Update Event ─────────────────────────────────────────
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: CalendarEventUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('calendar_events')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CalendarEventRow
    },
    onSuccess: (data) => {
      queryClient.setQueryData(calendarEventKeys.detail(data.id), data)
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all })
      toast.success('Event updated')
    },
    onError: () => {
      toast.error('Failed to update event')
    },
  })
}

// ── Delete Event (soft-delete via is_active = false) ─────
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('calendar_events')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all })
      toast.success('Event deleted')
    },
    onError: () => {
      toast.error('Failed to delete event')
    },
  })
}

// ── Add Attendee ─────────────────────────────────────────
export function useAddEventAttendee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attendee: AttendeeInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('calendar_event_attendees')
        .insert(attendee)
        .select()
        .single()
      if (error) throw error
      return data as AttendeeRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.attendees(data.event_id) })
    },
    onError: () => {
      toast.error('Failed to add attendee')
    },
  })
}

// ── Contact Calendar Events ─────────────────────────────
/**
 * Fetches calendar events linked to a specific contact —
 * either via contact_id on the event or as an attendee.
 */
export function useContactCalendarEvents(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: [...calendarEventKeys.all, 'contact', contactId],
    queryFn: async () => {
      const supabase = createClient()

      // Fetch events where contact_id matches
      const { data: directEvents, error: directError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('start_at', { ascending: false })
        .limit(50)

      if (directError) throw directError

      // Fetch events where contact is an attendee
      const { data: attendeeLinks, error: attendeeError } = await supabase
        .from('calendar_event_attendees')
        .select('event_id')
        .eq('contact_id', contactId)
        .limit(50)

      if (attendeeError) throw attendeeError

      const attendeeEventIds = (attendeeLinks ?? []).map((a) => a.event_id)
      const directIds = new Set((directEvents ?? []).map((e) => e.id))
      const extraIds = attendeeEventIds.filter((id) => !directIds.has(id))

      let attendeeEvents: CalendarEventRow[] = []
      if (extraIds.length > 0) {
        const { data } = await supabase
          .from('calendar_events')
          .select('*')
          .in('id', extraIds)
          .eq('is_active', true)
          .order('start_at', { ascending: false })

        attendeeEvents = (data ?? []) as CalendarEventRow[]
      }

      // Merge and deduplicate
      const all = [...(directEvents ?? []), ...attendeeEvents] as CalendarEventRow[]
      const seen = new Set<string>()
      return all
        .filter((e) => {
          if (seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })
        .sort((a, b) => b.start_at.localeCompare(a.start_at))
    },
    enabled: !!contactId && !!tenantId,
  })
}

// ── Remove Attendee ──────────────────────────────────────
export function useRemoveEventAttendee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ attendeeId, eventId }: { attendeeId: string; eventId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('calendar_event_attendees')
        .delete()
        .eq('id', attendeeId)
      if (error) throw error
      return { eventId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.attendees(data.eventId) })
    },
    onError: () => {
      toast.error('Failed to remove attendee')
    },
  })
}
