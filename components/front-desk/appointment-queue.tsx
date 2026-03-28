'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Clock, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface AppointmentQueueProps {
  tenantId: string
}

function useTodayAppointments(tenantId: string) {
  return useQuery({
    queryKey: ['front-desk', 'appointments', 'today', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id, guest_name, guest_email, guest_phone, start_time, end_time, status, booking_page_id, user_id, appointment_date')
        .eq('tenant_id', tenantId)
        .eq('appointment_date', today)
        .order('start_time', { ascending: true })

      if (error) throw error
      if (!appointments || appointments.length === 0) return []

      // Batch resolve booking pages and users (Rule #19)
      const pageIds = [...new Set(appointments.map((a) => a.booking_page_id).filter(Boolean))] as string[]
      const userIds = [...new Set(appointments.map((a) => a.user_id).filter(Boolean))] as string[]

      const [pagesRes, usersRes] = await Promise.all([
        pageIds.length > 0
          ? supabase.from('booking_pages').select('id, title').in('id', pageIds)
          : { data: [] as { id: string; title: string }[] },
        userIds.length > 0
          ? supabase.from('users').select('id, first_name, last_name').in('id', userIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] },
      ])

      const pagesMap = Object.fromEntries((pagesRes.data ?? []).map((p) => [p.id, p.title]))
      const usersMap = Object.fromEntries(
        (usersRes.data ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')]),
      )

      return appointments.map((a) => ({
        ...a,
        booking_page_title: a.booking_page_id ? pagesMap[a.booking_page_id] ?? null : null,
        lawyer_name: a.user_id ? usersMap[a.user_id] ?? null : null,
      }))
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-blue-950/30 text-blue-400 border-blue-500/20',
  pending: 'bg-amber-950/30 text-amber-400 border-amber-500/20',
  checked_in: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20',
  completed: 'bg-slate-50 text-slate-500 border-slate-200',
  cancelled: 'bg-red-950/30 text-red-400 border-red-500/20',
  no_show: 'bg-red-950/30 text-red-500 border-red-500/20',
}

/**
 * Today's appointment queue for the Front Desk dashboard.
 * Shows all appointments for today with status badges.
 */
export function AppointmentQueue({ tenantId }: AppointmentQueueProps) {
  const { data: appointments, isLoading } = useTodayAppointments(tenantId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Today&apos;s Appointments
          {appointments && (
            <Badge variant="secondary" className="ml-2">
              {appointments.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No appointments scheduled for today.
          </p>
        ) : (
          <div className="space-y-2">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{apt.guest_name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {apt.start_time
                        ? new Date(`1970-01-01T${apt.start_time}`).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'TBD'}
                      {apt.lawyer_name && <span>with {apt.lawyer_name}</span>}
                    </div>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={STATUS_COLORS[apt.status] ?? 'bg-slate-50 text-slate-500'}
                >
                  {apt.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
