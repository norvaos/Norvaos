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

      // Fetch booking pages (no FK join — resolve users separately)
      const { data: pages, error } = await supabase
        .from('booking_pages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!pages || pages.length === 0) return [] as BookingPageWithUser[]

      // Resolve user info
      const userIds = [...new Set(pages.map((p) => p.user_id))]
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds)

      const userMap = new Map((users ?? []).map((u) => [u.id, u]))

      return pages.map((p) => ({
        ...p,
        users: userMap.get(p.user_id) ?? null,
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
  options?: { status?: string; upcoming?: boolean }
) {
  return useQuery({
    queryKey: [...bookingKeys.appointments(tenantId), options?.status ?? 'all', options?.upcoming ?? false],
    queryFn: async () => {
      const supabase = createClient()

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

      const { data: appointments, error } = await q
      if (error) throw error
      if (!appointments || appointments.length === 0) return [] as AppointmentWithDetails[]

      // Resolve booking page + user info
      const pageIds = [...new Set(appointments.map((a) => a.booking_page_id))]
      const userIds = [...new Set(appointments.map((a) => a.user_id))]

      const [pagesRes, usersRes] = await Promise.all([
        supabase.from('booking_pages').select('id, title, slug').in('id', pageIds),
        supabase.from('users').select('id, first_name, last_name').in('id', userIds),
      ])

      const pageMap = new Map((pagesRes.data ?? []).map((p) => [p.id, p]))
      const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u]))

      return appointments.map((a) => {
        const page = pageMap.get(a.booking_page_id)
        const user = userMap.get(a.user_id)
        return {
          ...a,
          booking_page_title: page?.title ?? null,
          booking_page_slug: page?.slug ?? null,
          user_first_name: user?.first_name ?? null,
          user_last_name: user?.last_name ?? null,
        }
      }) as AppointmentWithDetails[]
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
