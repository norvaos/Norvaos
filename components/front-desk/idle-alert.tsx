'use client'

import { AlertTriangle, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Idle Alert — warns front desk staff about inactivity.
 *
 * 10-min idle → amber banner (dismissible)
 * 30-min idle → blocking modal "Are you still there?"
 */

interface IdleAlertProps {
  /** Minutes idle since last activity */
  idleMinutes: number
  /** Whether the 10-min idle threshold was crossed */
  isIdle: boolean
  /** Whether the 30-min long idle threshold was crossed */
  isLongIdle: boolean
  /** Called when user acknowledges they're still here */
  onDismiss: () => void
}

export function IdleAlert({ idleMinutes, isIdle, isLongIdle, onDismiss }: IdleAlertProps) {
  if (!isIdle) return null

  // 30-min: blocking modal
  if (isLongIdle) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Are you still there?</h2>
          <p className="text-slate-500">
            No activity detected for <span className="font-semibold text-red-600">{idleMinutes} minutes</span>.
            Your shift is still active. Please confirm you&apos;re at your desk.
          </p>
          <Button
            onClick={onDismiss}
            className="w-full bg-slate-900 hover:bg-slate-800"
            size="lg"
          >
            I&apos;m here — resume tracking
          </Button>
        </div>
      </div>
    )
  }

  // 10-min: amber banner
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-sm text-amber-800">
          <span className="font-medium">Idle for {idleMinutes} minutes</span>
          {' — '}activity tracking paused
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
        onClick={onDismiss}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
