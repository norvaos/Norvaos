'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Square, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTimerStore } from '@/lib/stores/timer-store'
import { useCreateTimeEntry } from '@/lib/queries/invoicing'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TimerWidget() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const {
    isRunning, matterId, matterTitle, description,
    startTime, elapsed, stop, setDescription,
  } = useTimerStore()
  const createTimeEntry = useCreateTimeEntry()

  // Tick every second to update display
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  const currentElapsed = isRunning && startTime
    ? elapsed + Math.floor((now - startTime) / 1000)
    : elapsed

  const handleStop = useCallback(() => {
    const result = stop()
    if (result && tenant?.id && appUser?.id) {
      createTimeEntry.mutate({
        tenant_id: tenant.id,
        matter_id: result.matterId,
        user_id: appUser.id,
        description: result.description,
        duration_minutes: result.durationMinutes,
        entry_date: new Date().toISOString().split('T')[0],
        is_billable: true,
      })
    }
  }, [stop, tenant?.id, appUser?.id, createTimeEntry])

  if (!isRunning) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
      <Clock className="size-4 text-primary animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{matterTitle ?? 'Timer running'}</p>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you working on?"
          className="h-6 text-xs border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <span className="text-sm font-mono font-medium tabular-nums text-primary">
        {formatElapsed(currentElapsed)}
      </span>
      <Button
        variant="destructive"
        size="icon"
        className="size-7"
        onClick={handleStop}
      >
        <Square className="size-3" />
      </Button>
    </div>
  )
}
