'use client'

import { useState, useEffect } from 'react'
import { Clock, Users, Calendar, AlertTriangle, Timer } from 'lucide-react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFrontDeskCheckIns, useTodaySchedule, useFrontDeskTasks } from '@/lib/queries/front-desk-queries'
import type { FrontDeskActiveShift } from '@/lib/queries/front-desk-queries'

/**
 * "Now" Strip — persistent bar between header and stats showing live context.
 *
 * Displays: current time (live), lobby count, next 2 appointments,
 * critical overdue tasks count, and shift duration.
 */

interface NowStripProps {
  userId: string
  activeShift: FrontDeskActiveShift | null | undefined
}

export function NowStrip({ userId, activeShift }: NowStripProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const today = new Date().toISOString().split('T')[0]

  // ─── Live clock ────────────────────────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ─── Data from existing hooks ──────────────────────────────────
  const { data: checkIns } = useFrontDeskCheckIns(tenantId)
  const { data: scheduleGroups } = useTodaySchedule(tenantId, today)
  const { data: tasks } = useFrontDeskTasks(tenantId, userId)

  // Lobby count: check-ins that are started but not completed
  const lobbyCount = (checkIns ?? []).filter(
    (c) => c.status === 'started' || c.status === 'identity_verified'
  ).length

  // Next 2 upcoming appointments (confirmed/pending, after current time)
  const nowTime = now.toTimeString().slice(0, 5) // HH:MM
  const allAppointments = (scheduleGroups ?? []).flatMap((g) => g.appointments)
  const upcomingAppts = allAppointments
    .filter((a) => {
      if (!a.start_time) return false
      if (!['confirmed', 'pending'].includes(a.status)) return false
      return a.start_time >= nowTime
    })
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .slice(0, 2)

  // Critical overdue count
  const todayStr = new Date().toISOString().split('T')[0]
  const overdueCount = (tasks ?? []).filter((t) => {
    if (t.status === 'completed' || t.status === 'done') return false
    if (!t.due_date) return false
    return t.due_date < todayStr || (t.due_date === todayStr && t.due_time && t.due_time < nowTime)
  }).length

  // Shift duration
  const shiftDuration = activeShift?.started_at
    ? Math.floor((Date.now() - new Date(activeShift.started_at).getTime()) / 60000)
    : null
  const shiftH = shiftDuration != null ? Math.floor(shiftDuration / 60) : 0
  const shiftM = shiftDuration != null ? shiftDuration % 60 : 0

  return (
    <div className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center justify-between gap-4 text-sm">
      {/* Current Time */}
      <div className="flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-slate-400" />
        <span className="font-mono font-semibold tabular-nums">{timeStr}</span>
      </div>

      {/* Lobby Count */}
      <div className="flex items-center gap-1.5">
        <Users className="w-4 h-4 text-blue-400" />
        <span>
          Lobby:{' '}
          <span className={lobbyCount > 0 ? 'font-bold text-blue-300' : 'text-slate-400'}>
            {lobbyCount}
          </span>
        </span>
      </div>

      {/* Next Appointments */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Calendar className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        {upcomingAppts.length > 0 ? (
          <span className="truncate">
            Next:{' '}
            {upcomingAppts.map((a, i) => (
              <span key={a.id}>
                {i > 0 && <span className="text-slate-500 mx-1">|</span>}
                <span className="text-emerald-300">{a.start_time?.slice(0, 5)}</span>
                <span className="text-slate-400 ml-1">{a.guest_name ?? 'Unknown'}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-slate-500">No upcoming appointments</span>
        )}
      </div>

      {/* Overdue Tasks */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-red-300 font-semibold">
            {overdueCount} overdue
          </span>
        </div>
      )}

      {/* Shift Timer */}
      {activeShift && shiftDuration != null && (
        <div className="flex items-center gap-1.5">
          <Timer className="w-4 h-4 text-emerald-400" />
          <span className="font-mono tabular-nums">
            {shiftH}h {String(shiftM).padStart(2, '0')}m
          </span>
        </div>
      )}
    </div>
  )
}
