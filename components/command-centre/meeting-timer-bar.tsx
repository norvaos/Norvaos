'use client'

import { useCommandCentre } from './command-centre-context'
import { Button } from '@/components/ui/button'
import { Timer, Square } from 'lucide-react'
import { formatElapsed } from '@/lib/utils/formatters'

export function MeetingTimerBar() {
  const { timerRunning, timerElapsed, stopMeetingTimer } = useCommandCentre()

  if (!timerRunning) return null

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-red-600 text-white animate-pulse">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5" />
        <span className="text-sm font-medium">Meeting in progress</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold tabular-nums text-lg">
          {formatElapsed(timerElapsed)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
          onClick={stopMeetingTimer}
        >
          <Square className="h-3 w-3 fill-current mr-1" />
          Stop
        </Button>
      </div>
    </div>
  )
}
