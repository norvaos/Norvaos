'use client'

import { useFrontDeskCheckIns } from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'
import { ClipboardCheck, Clock, User, Bell, CheckCircle2, UserPlus, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckInQueueProps {
  onNotifyStaff: (checkInId: string) => void
  onComplete: (checkInId: string) => void
  onCreateWalkIn: () => void
  onSelectContact?: (contactId: string) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  started: { label: 'In Progress', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  identity_verified: { label: 'Verified', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'Checked In', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  acknowledged: { label: 'In Meeting', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  abandoned: { label: 'Abandoned', color: 'bg-slate-50 text-slate-400 border-slate-200' },
}

/** Derive display status  -  if appointment is in_meeting, show as acknowledged */
function getDisplayStatus(sessionStatus: string, appointmentStatus: string | null): string {
  if (appointmentStatus === 'in_meeting' || appointmentStatus === 'completed') {
    return 'acknowledged'
  }
  return sessionStatus
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getIdStatus(
  idScanPath: string | null,
  idScanUploadedAt: string | null,
  checkInStatus: string
): { label: string; color: string } {
  if (!idScanPath) {
    return { label: 'Not Required', color: 'bg-slate-50 text-slate-500 border-slate-200' }
  }

  if (checkInStatus === 'identity_verified' || checkInStatus === 'completed') {
    return { label: 'Verified', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }

  if (idScanUploadedAt) {
    return { label: 'Uploaded', color: 'bg-blue-50 text-blue-700 border-blue-200' }
  }

  return { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' }
}

function getWaitTimeIndicator(createdAt: string): {
  minutes: number
  color: string
  pulse: boolean
} {
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))

  if (minutes < 5) {
    return { minutes, color: 'text-emerald-600', pulse: false }
  }

  if (minutes <= 15) {
    return { minutes, color: 'text-amber-600', pulse: false }
  }

  return { minutes, color: 'text-red-600', pulse: true }
}

function formatWaitTime(minutes: number): string {
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function formatAppointmentTime(time: string | null): string {
  if (!time) return 'Walk-in'
  try {
    return new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return time
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Kiosk Check-In Queue for the Front Desk dashboard.
 * Shows today's check-in sessions with ID verification status,
 * wait time indicators, and action buttons for staff notification
 * and session completion. Auto-refreshes every 30 seconds.
 */
export function CheckInQueue({
  onNotifyStaff,
  onComplete,
  onCreateWalkIn,
  onSelectContact,
}: CheckInQueueProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: checkIns, isLoading } = useFrontDeskCheckIns(tenantId)

  // Count active (non-completed, non-abandoned, non-acknowledged) check-ins
  const activeCount = checkIns
    ? checkIns.filter((ci) => {
        const displayStatus = getDisplayStatus(ci.status, ci.appointment_status)
        return displayStatus !== 'completed' && displayStatus !== 'abandoned' && displayStatus !== 'acknowledged'
      }).length
    : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            Kiosk Check-Ins
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeCount}
              </Badge>
            )}
          </CardTitle>

          {/* Walk-in creation button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onCreateWalkIn}
          >
            <UserPlus className="w-4 h-4" />
            Walk-In
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !checkIns || checkIns.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No check-ins today yet.
          </p>
        ) : (
          <div className="space-y-2">
            {checkIns.map((ci) => {
              const metadata = (ci.metadata ?? {}) as Record<string, unknown>
              const clientName =
                ci.contact_name ??
                ci.client_name ??
                (metadata.client_name as string) ??
                'Unknown Guest'

              const displayStatus = getDisplayStatus(ci.status, ci.appointment_status)
              const status = STATUS_LABELS[displayStatus] ?? STATUS_LABELS.started
              const idStatus = getIdStatus(ci.id_scan_path, ci.id_scan_uploaded_at, ci.status)
              const waitTime = getWaitTimeIndicator(ci.created_at)
              const isActionable = displayStatus !== 'completed' && displayStatus !== 'abandoned' && displayStatus !== 'acknowledged'

              return (
                <div
                  key={ci.id}
                  className="p-3 bg-slate-50 rounded-lg"
                >
                  {/* Top row: client info + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-slate-500" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Client name */}
                        {ci.contact_id && onSelectContact ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-slate-900 hover:text-blue-700 transition-colors truncate block"
                            onClick={() => onSelectContact(ci.contact_id!)}
                          >
                            {clientName}
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {clientName}
                          </p>
                        )}

                        {/* Appointment time + assigned staff */}
                        <div className="flex items-center gap-3 mt-0.5">
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span>{formatAppointmentTime(ci.appointment_time)}</span>
                          </div>

                          {ci.assigned_staff && (
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[100px]">{ci.assigned_staff}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <Badge variant="outline" className={status.color}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Bottom row: ID status + wait time + actions */}
                  <div className="flex items-center justify-between mt-2 pl-[52px]">
                    <div className="flex items-center gap-3">
                      {/* ID verification status  -  only show when ID was actually scanned/uploaded */}
                      {ci.id_scan_path && (
                        <div className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-slate-400" />
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${idStatus.color}`}
                          >
                            {idStatus.label}
                          </Badge>
                        </div>
                      )}

                      {/* Wait time */}
                      <div
                        className={`flex items-center gap-1 text-xs font-medium ${waitTime.color} ${
                          waitTime.pulse ? 'animate-pulse' : ''
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{formatWaitTime(waitTime.minutes)} waiting</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {isActionable && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => onNotifyStaff(ci.id)}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          Notify Staff
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onComplete(ci.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
