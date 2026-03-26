'use client'

import { useState, useMemo } from 'react'
import { useTodaySchedule, useFrontDeskStaffList, type FrontDeskAppointment } from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  Calendar,
  Clock,
  User,
  Users,
  ClipboardCheck,
  Bell,
  StickyNote,
  UserCheck,
} from 'lucide-react'

// ─── Props ───────────────────────────────────────────────────────────────────

interface TodayScheduleProps {
  onCheckIn: (appointmentId: string) => void
  onNotifyStaff: (appointmentId: string, staffId: string) => void
  onAddNote: (appointmentId: string) => void
  onAcknowledge?: (appointmentId: string) => void
  onSelectContact?: (contactId: string) => void
}

// ─── Status Badge Colours ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-blue-50 text-blue-700',
  pending: 'bg-blue-50 text-blue-700',
  checked_in: 'bg-emerald-50 text-emerald-700',
  in_meeting: 'bg-purple-50 text-purple-700',
  completed: 'bg-slate-50 text-slate-500',
  cancelled: 'bg-red-50 text-red-700',
  no_show: 'bg-red-50 text-red-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timeString: string | null): string {
  if (!timeString) return 'TBD'
  const parts = timeString.split(':')
  const hours = parseInt(parts[0], 10)
  const minutes = parts[1] ?? '00'
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${minutes} ${period}`
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getTodayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ─── Appointment Row ─────────────────────────────────────────────────────────

function AppointmentRow({
  appointment,
  staffId,
  onCheckIn,
  onNotifyStaff,
  onAddNote,
  onAcknowledge,
  onSelectContact,
}: {
  appointment: FrontDeskAppointment
  staffId: string | null
  onCheckIn: (appointmentId: string) => void
  onNotifyStaff: (appointmentId: string, staffId: string) => void
  onAddNote: (appointmentId: string) => void
  onAcknowledge?: (appointmentId: string) => void
  onSelectContact?: (contactId: string) => void
}) {
  const statusStyle = STATUS_STYLES[appointment.status] ?? 'bg-slate-50 text-slate-500'
  const isCheckedIn = appointment.status === 'checked_in'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100">
      {/* Left: Time + Guest + Status */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Time */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 w-20">
          <Clock className="w-3 h-3" />
          <span className="font-medium">{formatTime(appointment.start_time)}</span>
        </div>

        {/* Guest Name  -  clickable to open contact panel */}
        {appointment.contact_id && onSelectContact ? (
          <button
            type="button"
            className="text-sm font-medium text-foreground hover:text-blue-700 transition-colors truncate"
            onClick={() => onSelectContact(appointment.contact_id!)}
          >
            {appointment.guest_name || 'Walk-in'}
          </button>
        ) : (
          <span className="text-sm font-medium text-foreground truncate">
            {appointment.guest_name || 'Walk-in'}
          </span>
        )}

        {/* Status Badge */}
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 shrink-0 border-transparent ${statusStyle}`}
        >
          {formatStatusLabel(appointment.status)}
        </Badge>

        {/* Duration */}
        {appointment.duration_minutes && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {appointment.duration_minutes} min
          </span>
        )}

        {/* Room */}
        {appointment.room && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-violet-50 text-violet-700 border-violet-200">
            {appointment.room}
          </Badge>
        )}

        {/* Booking Page Title */}
        {appointment.booking_page_title && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {appointment.booking_page_title}
          </span>
        )}
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <TooltipProvider>
          {/* Accept/Acknowledge  -  only shown when client is checked in */}
          {isCheckedIn && onAcknowledge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAcknowledge(appointment.id)
                  }}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Accept Meeting</TooltipContent>
            </Tooltip>
          )}

          {/* Check In */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onCheckIn(appointment.id)
                }}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Check In</TooltipContent>
          </Tooltip>

          {/* Notify Lawyer */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onNotifyStaff(appointment.id, staffId ?? '')
                }}
              >
                <Bell className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notify Lawyer</TooltipContent>
          </Tooltip>

          {/* Add Note */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onAddNote(appointment.id)
                }}
              >
                <StickyNote className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Note</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TodaySchedule({ onCheckIn, onNotifyStaff, onAddNote, onAcknowledge, onSelectContact }: TodayScheduleProps) {
  const { tenant } = useTenant()
  const [selectedDate, setSelectedDate] = useState(getTodayString)
  const [staffFilter, setStaffFilter] = useState<string>('__all')

  const tenantId = tenant?.id ?? ''
  const { data: staffGroups, isLoading } = useTodaySchedule(tenantId, selectedDate)
  const { data: staffList } = useFrontDeskStaffList(tenantId)

  // Apply staff filter  -  show all or just one staff member
  const filteredGroups = useMemo(() => {
    if (!staffGroups) return []
    if (staffFilter === '__all') return staffGroups
    return staffGroups.filter((g) => g.staffId === staffFilter)
  }, [staffGroups, staffFilter])

  const totalAppointments = filteredGroups.reduce(
    (sum, group) => sum + group.appointments.length,
    0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Schedule
          {!isLoading && totalAppointments > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalAppointments}
            </Badge>
          )}
        </CardTitle>

        {/* Date Picker + Staff Switcher */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <TenantDateInput
            value={selectedDate}
            onChange={(iso) => setSelectedDate(iso)}
            className="w-44 text-sm"
          />
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-48 text-sm">
              <Users className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Staff</SelectItem>
              {(staffList ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Calendar className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No appointments scheduled for this day.</p>
          </div>
        )}

        {/* Staff-Grouped Appointments */}
        {!isLoading && filteredGroups.length > 0 && (
          <div className="space-y-5">
            {filteredGroups.map((group) => {
              const groupKey = group.staffId ?? '__unassigned'

              return (
                <div key={groupKey}>
                  {/* Staff Section Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {group.staffName}
                    </h3>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {group.appointments.length}
                    </Badge>
                  </div>

                  {/* Appointments List */}
                  <div className="space-y-1.5">
                    {group.appointments.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        staffId={group.staffId}
                        onCheckIn={onCheckIn}
                        onNotifyStaff={onNotifyStaff}
                        onAddNote={onAddNote}
                        onAcknowledge={onAcknowledge}
                        onSelectContact={onSelectContact}
                      />
                    ))}
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
