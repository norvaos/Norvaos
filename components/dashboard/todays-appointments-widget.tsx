'use client'

import { memo } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, User, LogIn, Play } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import { HelperTip } from '@/components/ui/helper-tip'
import {
  useTodaysAppointments,
  useCheckInAppointment,
  useStartAppointment,
} from '@/lib/queries/booking'

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700' },
  checked_in: { label: 'Checked In', color: 'bg-amber-100 text-amber-700' },
  in_meeting: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

// ── Widget ───────────────────────────────────────────────────────────────────

export const TodaysAppointmentsWidget = memo(function TodaysAppointmentsWidget({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const { data: appointments, isLoading } = useTodaysAppointments(tenantId, userId)
  const router = useRouter()
  const checkInMutation = useCheckInAppointment()
  const startMutation = useStartAppointment()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Today&apos;s Appointments <HelperTip contentKey="dashboard.todays_appointments" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments today"
            description="Your scheduled appointments for today will appear here."
          />
        ) : (
          <div className="space-y-1">
            {appointments.map((appt) => {
              const status = STATUS_BADGE[appt.status] ?? { label: appt.status, color: 'bg-slate-100 text-slate-600' }
              const extra = appt as unknown as { contact_first_name?: string | null; contact_last_name?: string | null }
              const guestName = appt.guest_name || [
                extra.contact_first_name,
                extra.contact_last_name,
              ].filter(Boolean).join(' ') || 'Client'

              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{guestName}</span>
                      <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 shrink-0', status.color)}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatTime12(appt.start_time)}
                      </span>
                      <span>{appt.duration_minutes} min</span>
                    </div>
                  </div>

                  {appt.status === 'confirmed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => checkInMutation.mutate(appt.id)}
                      disabled={checkInMutation.isPending}
                    >
                      <LogIn className="mr-1 size-3" />
                      Check In
                    </Button>
                  )}
                  {appt.status === 'checked_in' && (
                    <Button
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => {
                        startMutation.mutate(appt.id, {
                          onSuccess: (data) => {
                            if (data.matterId) {
                              router.push(`/matters/${data.matterId}`)
                            } else if (data.leadId) {
                              router.push(`/command/lead/${data.leadId}`)
                            }
                          },
                        })
                      }}
                      disabled={startMutation.isPending}
                    >
                      <Play className="mr-1 size-3" />
                      Start
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
