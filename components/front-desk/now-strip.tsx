'use client'

import { useState, useEffect } from 'react'
import { Clock, Users, Calendar, AlertTriangle, Timer, Play, Square, Coffee, RotateCcw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFrontDeskCheckIns, useTodaySchedule, useFrontDeskTasks, frontDeskKeys } from '@/lib/queries/front-desk-queries'
import type { FrontDeskActiveShift } from '@/lib/queries/front-desk-queries'

interface NowStripProps {
  userId: string
  activeShift: FrontDeskActiveShift | null | undefined
}

export function NowStrip({ userId, activeShift }: NowStripProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const today = new Date().toISOString().split('T')[0]
  const queryClient = useQueryClient()

  // ─── Dialog state ──────────────────────────────────────────────
  const [showEndDialog, setShowEndDialog] = useState(false)

  // ─── Live clock ────────────────────────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  // ─── Shift mutations ───────────────────────────────────────────
  const startShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/front_desk_start_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {}, source: 'front_desk', idempotencyKey: `start_shift:${userId}:${Date.now()}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start shift')
      return data
    },
    onSuccess: () => {
      toast.success('Shift started')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const endShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/front_desk_end_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { reason: 'manual' }, source: 'front_desk', idempotencyKey: `end_shift:${userId}:${Date.now()}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end shift')
      return data
    },
    onSuccess: () => {
      toast.success('Shift ended')
      setShowEndDialog(false)
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const startBreakMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/front-desk/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'lunch_break_start', eventData: { started_at: new Date().toISOString() } }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to start break')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Lunch break started — enjoy! You have 1 hour.')
      setShowEndDialog(false)
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const endBreakMutation = useMutation({
    mutationFn: async () => {
      const breakStart = activeShift?.breakStartedAt
      const breakMinutes = breakStart
        ? Math.round((Date.now() - new Date(breakStart).getTime()) / 60000)
        : 60
      const res = await fetch('/api/front-desk/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'lunch_break_end',
          eventData: { ended_at: new Date().toISOString(), duration_minutes: breakMinutes },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to end break')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Welcome back! Break time recorded.')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Data from existing hooks ──────────────────────────────────
  const { data: checkIns } = useFrontDeskCheckIns(tenantId)
  const { data: scheduleGroups } = useTodaySchedule(tenantId, today)
  const { data: tasks } = useFrontDeskTasks(tenantId, userId)

  const lobbyCount = (checkIns ?? []).filter(
    (c) => c.status === 'started' || c.status === 'identity_verified'
  ).length

  const nowTime = now.toTimeString().slice(0, 5)
  const allAppointments = (scheduleGroups ?? []).flatMap((g) => g.appointments)
  const upcomingAppts = allAppointments
    .filter((a) => {
      if (!a.start_time) return false
      if (!['confirmed', 'pending'].includes(a.status)) return false
      return a.start_time >= nowTime
    })
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .slice(0, 2)

  const todayStr = new Date().toISOString().split('T')[0]
  const overdueCount = (tasks ?? []).filter((t) => {
    if (t.status === 'completed' || t.status === 'done') return false
    if (!t.due_date) return false
    return t.due_date < todayStr || (t.due_date === todayStr && t.due_time && t.due_time < nowTime)
  }).length

  // ─── Timers ────────────────────────────────────────────────────
  const shiftDuration = activeShift?.started_at
    ? Math.floor((Date.now() - new Date(activeShift.started_at).getTime()) / 60000)
    : null
  const shiftH = shiftDuration != null ? Math.floor(shiftDuration / 60) : 0
  const shiftM = shiftDuration != null ? shiftDuration % 60 : 0

  // Break countdown: 60 min minus elapsed
  const breakElapsed = activeShift?.breakStartedAt
    ? Math.floor((Date.now() - new Date(activeShift.breakStartedAt).getTime()) / 60000)
    : 0
  const breakRemaining = Math.max(60 - breakElapsed, 0)
  const breakOvertime = breakElapsed > 60

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ─── On-break banner ──────────────────────────────────────────
  if (activeShift?.onBreak) {
    return (
      <div className={`px-4 py-2 rounded-lg flex items-center justify-between gap-4 text-sm ${breakOvertime ? 'bg-red-700' : 'bg-amber-600'} text-white`}>
        <div className="flex items-center gap-2">
          <Coffee className="w-4 h-4" />
          <span className="font-medium">On Lunch Break</span>
          <span className="text-white/70">·</span>
          {breakOvertime ? (
            <span className="font-semibold text-red-200">
              {breakElapsed - 60}m overtime
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {breakRemaining}m remaining
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-white/70" />
          <span className="font-mono tabular-nums">{timeStr}</span>
        </div>
        <button
          onClick={() => endBreakMutation.mutate()}
          disabled={endBreakMutation.isPending}
          className="flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          {endBreakMutation.isPending ? 'Returning...' : 'Return from Lunch'}
        </button>
      </div>
    )
  }

  return (
    <>
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

        {/* Shift Timer + Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {activeShift && shiftDuration != null && (
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-emerald-400" />
              <span className="font-mono tabular-nums">
                {shiftH}h {String(shiftM).padStart(2, '0')}m
              </span>
            </div>
          )}
          {activeShift ? (
            <button
              onClick={() => setShowEndDialog(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <Square className="w-3 h-3" />
              End Shift
            </button>
          ) : (
            <button
              onClick={() => startShiftMutation.mutate()}
              disabled={startShiftMutation.isPending}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
            >
              <Play className="w-3 h-3" />
              {startShiftMutation.isPending ? 'Starting...' : 'Start Shift'}
            </button>
          )}
        </div>
      </div>

      {/* ─── End Shift Confirmation Dialog ─────────────────────────── */}
      {showEndDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              Leaving your station?
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              Let us know whether you're taking a lunch break or ending your shift for the day.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Lunch Break option */}
              <button
                onClick={() => startBreakMutation.mutate()}
                disabled={startBreakMutation.isPending}
                className="flex flex-col items-center gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 p-4 transition-colors disabled:opacity-50"
              >
                <Coffee className="w-6 h-6 text-amber-600" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-amber-800">Lunch Break</p>
                  <p className="text-xs text-amber-600 mt-0.5">1 hour · Clock keeps running</p>
                </div>
              </button>

              {/* End Shift option */}
              <button
                onClick={() => endShiftMutation.mutate()}
                disabled={endShiftMutation.isPending}
                className="flex flex-col items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 hover:bg-red-100 p-4 transition-colors disabled:opacity-50"
              >
                <Square className="w-6 h-6 text-red-600" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-red-800">End Shift</p>
                  <p className="text-xs text-red-600 mt-0.5">Done for the day</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowEndDialog(false)}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
