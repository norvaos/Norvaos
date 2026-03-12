'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type BookingPage = Database['public']['Tables']['booking_pages']['Row']
type BookingPageInsert = Database['public']['Tables']['booking_pages']['Insert']
type BookingPageUpdate = Database['public']['Tables']['booking_pages']['Update']
type Appointment = Database['public']['Tables']['appointments']['Row']
type BookingOverride = Database['public']['Tables']['booking_page_overrides']['Row']

// ── Types ───────────────────────────────────────────────────────────────────

export type { BookingPage, Appointment, BookingOverride }

export interface BookingPageWithUser extends BookingPage {
  users: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null
}

export interface AppointmentWithDetails extends Appointment {
  booking_page_title: string | null
  booking_page_slug: string | null
  user_first_name: string | null
  user_last_name: string | null
}

// ── Query Key Factory ───────────────────────────────────────────────────────

export const bookingKeys = {
  all: ['booking'] as const,
  pages: (tenantId: string) => [...bookingKeys.all, 'pages', tenantId] as const,
  page: (id: string) => [...bookingKeys.all, 'page', id] as const,
  appointments: (tenantId: string) => [...bookingKeys.all, 'appointments', tenantId] as const,
  overrides: (bookingPageId: string) => [...bookingKeys.all, 'overrides', bookingPageId] as const,
}

// ── Booking Pages ───────────────────────────────────────────────────────────

export function useBookingPages(tenantId: string) {
  return useQuery({
    queryKey: bookingKeys.pages(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      // No direct FK from booking_pages to users in generated types — batch resolve
      const { data: pages, error } = await supabase
        .from('booking_pages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!pages || pages.length === 0) return [] as BookingPageWithUser[]

      const userIds = [...new Set(pages.map((p) => p.user_id).filter(Boolean))] as string[]
      let usersMap: Record<string, { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds)
        if (users) {
          usersMap = Object.fromEntries(users.map((u) => [u.id, u]))
        }
      }

      return pages.map((p) => ({
        ...p,
        users: p.user_id ? usersMap[p.user_id] ?? null : null,
      })) as BookingPageWithUser[]
    },
    enabled: !!tenantId,
  })
}

export function useBookingPage(id: string | null) {
  return useQuery({
    queryKey: bookingKeys.page(id ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data: page, error } = await supabase
        .from('booking_pages')
        .select('*')
        .eq('id', id!)
        .single()

      if (error) throw error

      // Resolve user
      const { data: user } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', page.user_id)
        .single()

      return { ...page, users: user ?? null } as BookingPageWithUser
    },
    enabled: !!id,
  })
}

export function useCreateBookingPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BookingPageInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('booking_pages')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data as BookingPage
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.pages(vars.tenant_id) })
      toast.success('Booking page created')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create booking page')
    },
  })
}

export function useUpdateBookingPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string; data: BookingPageUpdate }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('booking_pages')
        .update(input.data)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
        .select()
        .single()

      if (error) throw error
      return data as BookingPage
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.pages(vars.tenantId) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.page(vars.id) })
      toast.success('Booking page updated')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update booking page')
    },
  })
}

export function useDeleteBookingPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('booking_pages')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)

      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.pages(vars.tenantId) })
      toast.success('Booking page removed')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove booking page')
    },
  })
}

export function useToggleBookingPageStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string; status: 'draft' | 'published' }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('booking_pages')
        .update({ status: input.status })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)

      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.pages(vars.tenantId) })
      toast.success(vars.status === 'published' ? 'Booking page published' : 'Booking page unpublished')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update status')
    },
  })
}

// ── Appointments ────────────────────────────────────────────────────────────

export function useAppointments(
  tenantId: string,
  options?: { status?: string; upcoming?: boolean; contactId?: string }
) {
  return useQuery({
    queryKey: [...bookingKeys.appointments(tenantId), options?.status ?? 'all', options?.upcoming ?? false, options?.contactId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()

      // No direct FK from appointments to booking_pages/users in generated types — batch resolve
      let q = supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(100)

      if (options?.status && options.status !== 'all') {
        q = q.eq('status', options.status)
      }

      if (options?.upcoming) {
        const today = new Date().toISOString().split('T')[0]
        q = q.gte('appointment_date', today)
      }

      if (options?.contactId) {
        q = q.eq('contact_id', options.contactId)
      }

      const { data: appointments, error } = await q
      if (error) throw error
      if (!appointments || appointments.length === 0) return [] as AppointmentWithDetails[]

      // Batch-fetch booking pages and users in 2 parallel queries (instead of per-row)
      const pageIds = [...new Set(appointments.map((a) => a.booking_page_id).filter(Boolean))] as string[]
      const userIds = [...new Set(appointments.map((a) => a.user_id).filter(Boolean))] as string[]

      const [pagesRes, usersRes] = await Promise.all([
        pageIds.length > 0
          ? supabase.from('booking_pages').select('id, title, slug').in('id', pageIds)
          : { data: [] },
        userIds.length > 0
          ? supabase.from('users').select('id, first_name, last_name').in('id', userIds)
          : { data: [] },
      ])

      const pagesMap = Object.fromEntries((pagesRes.data ?? []).map((p) => [p.id, p]))
      const usersMap = Object.fromEntries((usersRes.data ?? []).map((u) => [u.id, u]))

      return appointments.map((a) => ({
        ...a,
        booking_page_title: a.booking_page_id ? pagesMap[a.booking_page_id]?.title ?? null : null,
        booking_page_slug: a.booking_page_id ? pagesMap[a.booking_page_id]?.slug ?? null : null,
        user_first_name: a.user_id ? usersMap[a.user_id]?.first_name ?? null : null,
        user_last_name: a.user_id ? usersMap[a.user_id]?.last_name ?? null : null,
      })) as AppointmentWithDetails[]
    },
    enabled: !!tenantId,
  })
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      status: string
      cancellationReason?: string
    }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = { status: input.status }
      if (input.status === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString()
        if (input.cancellationReason) {
          updateData.cancellation_reason = input.cancellationReason
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)

      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.appointments(vars.tenantId) })
      toast.success(`Appointment marked as ${vars.status}`)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update appointment')
    },
  })
}

// ── Internal Booking (CRM-initiated) ────────────────────────────────────────

export function useCreateAppointmentInternal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      bookingPageId: string
      contactId: string
      date: string
      time: string
      notes?: string
    }) => {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to book appointment')
      return data as { success: boolean; appointment_id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Appointment booked successfully')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to book appointment')
    },
  })
}

export function useCancelAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { appointmentId: string; reason?: string }) => {
      const res = await fetch(`/api/appointments/${input.appointmentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: input.reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel appointment')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Appointment cancelled')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel appointment')
    },
  })
}

export function useMarkNoShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(`/api/appointments/${appointmentId}/no-show`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to mark no-show')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Appointment marked as no-show')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to mark no-show')
    },
  })
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { appointmentId: string; date: string; time: string }) => {
      const res = await fetch(`/api/appointments/${input.appointmentId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: input.date, time: input.time }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule appointment')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Appointment rescheduled')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reschedule appointment')
    },
  })
}

// ── Appointment Lifecycle ─────────────────────────────────────────────────

export function useCheckInAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(`/api/appointments/${appointmentId}/check-in`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to check in')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Client checked in')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to check in')
    },
  })
}

export function useStartAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(`/api/appointments/${appointmentId}/start`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start meeting')
      return data as { success: boolean; leadId: string | null; matterId: string | null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Meeting started')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to start meeting')
    },
  })
}

export function useCompleteAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { appointmentId: string; notes?: string }) => {
      const res = await fetch(`/api/appointments/${input.appointmentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: input.notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to complete appointment')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all })
      toast.success('Appointment completed')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to complete appointment')
    },
  })
}

export function useTodaysAppointments(tenantId: string, userId: string) {
  return useQuery({
    queryKey: [...bookingKeys.appointments(tenantId), 'today', userId],
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      const { data: appts, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('appointment_date', today)
        .in('status', ['confirmed', 'checked_in', 'in_meeting'])
        .order('start_time', { ascending: true })

      if (error) throw error
      if (!appts?.length) return [] as AppointmentWithDetails[]

      // Batch resolve contact names
      const contactIds = [...new Set(appts.map((a) => a.contact_id).filter(Boolean))] as string[]
      let contactMap: Record<string, { first_name: string | null; last_name: string | null }> = {}
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds)
        if (contacts) contactMap = Object.fromEntries(contacts.map((c) => [c.id, c]))
      }

      return appts.map((a) => ({
        ...a,
        booking_page_title: null,
        booking_page_slug: null,
        user_first_name: null,
        user_last_name: null,
        contact_first_name: a.contact_id ? contactMap[a.contact_id]?.first_name ?? null : null,
        contact_last_name: a.contact_id ? contactMap[a.contact_id]?.last_name ?? null : null,
      })) as AppointmentWithDetails[]
    },
    enabled: !!tenantId && !!userId,
    refetchInterval: 60 * 1000,
  })
}

// ── Booking Overrides ───────────────────────────────────────────────────────

export function useBookingOverrides(bookingPageId: string | null) {
  return useQuery({
    queryKey: bookingKeys.overrides(bookingPageId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('booking_page_overrides')
        .select('*')
        .eq('booking_page_id', bookingPageId!)
        .order('override_date', { ascending: true })

      if (error) throw error
      return data as BookingOverride[]
    },
    enabled: !!bookingPageId,
  })
}

export function useCreateBookingOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      bookingPageId: string
      overrideDate: string
      isAvailable: boolean
      startTime?: string
      endTime?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('booking_page_overrides')
        .upsert({
          tenant_id: input.tenantId,
          booking_page_id: input.bookingPageId,
          override_date: input.overrideDate,
          is_available: input.isAvailable,
          start_time: input.startTime ?? null,
          end_time: input.endTime ?? null,
        }, { onConflict: 'booking_page_id,override_date' })
        .select()
        .single()

      if (error) throw error
      return data as BookingOverride
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.overrides(vars.bookingPageId) })
      toast.success('Date override saved')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save override')
    },
  })
}
