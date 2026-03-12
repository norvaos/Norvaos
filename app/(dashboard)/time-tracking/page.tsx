'use client'

import { useState, useCallback } from 'react'
import { Plus, Clock, Play } from 'lucide-react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useTimeEntries,
  useDeleteTimeEntry,
  useCreateTimeEntry,
  type TimeEntry,
} from '@/lib/queries/invoicing'
import { useTimerStore } from '@/lib/stores/timer-store'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

import { TimeEntryForm } from '@/components/time-tracking/time-entry-form'
import { TimeEntryTable } from '@/components/time-tracking/time-entry-table'
import { TimerWidget } from '@/components/time-tracking/timer-widget'

import { RequirePermission } from '@/components/require-permission'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export default function TimeTrackingPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  const [formOpen, setFormOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [matterFilter, setMatterFilter] = useState<string>('all')

  const timerIsRunning = useTimerStore((s) => s.isRunning)
  const startTimer = useTimerStore((s) => s.start)

  // Fetch time entries
  const { data: entries, isLoading } = useTimeEntries(
    tenantId,
    matterFilter !== 'all' ? matterFilter : undefined
  )

  const deleteTimeEntry = useDeleteTimeEntry()

  // Fetch active matters for filter dropdown + timer start
  const { data: matters } = useQuery({
    queryKey: ['matters', tenantId, 'active-list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'intake'])
        .order('title')
        .limit(200)
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })

  const handleEdit = useCallback((entry: TimeEntry) => {
    setEditEntry(entry)
    setFormOpen(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    deleteTimeEntry.mutate(id)
  }, [deleteTimeEntry])

  const handleCreate = useCallback(() => {
    setEditEntry(null)
    setFormOpen(true)
  }, [])

  // Quick-start timer with matter selection
  const [timerMatterId, setTimerMatterId] = useState<string>('')

  const handleStartTimer = useCallback(() => {
    if (!timerMatterId) return
    const matter = matters?.find((m) => m.id === timerMatterId)
    startTimer(timerMatterId, matter?.title ?? 'Matter')
  }, [timerMatterId, matters, startTimer])

  // Stats
  const totalMinutes = (entries ?? []).reduce((sum, e) => sum + e.duration_minutes, 0)
  const billableMinutes = (entries ?? []).reduce(
    (sum, e) => sum + (e.is_billable ? e.duration_minutes : 0), 0
  )

  return (
    <RequirePermission entity="billing" action="view">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Time Tracking</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track time spent on matters and manage billable hours.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="size-4" />
            Log Time
          </Button>
        </div>

        {/* Timer widget (shows when running) */}
        <TimerWidget />

        {/* Quick timer start (shows when NOT running) */}
        {!timerIsRunning && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Clock className="size-4 text-muted-foreground" />
            <Select value={timerMatterId} onValueChange={setTimerMatterId}>
              <SelectTrigger className="h-8 flex-1 max-w-xs text-sm">
                <SelectValue placeholder="Select matter to start timer..." />
              </SelectTrigger>
              <SelectContent>
                {(matters ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.matter_number ? `${m.matter_number} — ` : ''}{m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!timerMatterId}
              onClick={handleStartTimer}
            >
              <Play className="size-3.5" />
              Start Timer
            </Button>
          </div>
        )}

        {/* Stats bar */}
        {!isLoading && entries && entries.length > 0 && (
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</span>
            </div>
            <div>
              <span className="text-muted-foreground">Billable: </span>
              <span className="font-medium">{Math.floor(billableMinutes / 60)}h {billableMinutes % 60}m</span>
            </div>
            <div>
              <span className="text-muted-foreground">Entries: </span>
              <span className="font-medium">{entries.length}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={matterFilter} onValueChange={setMatterFilter}>
            <SelectTrigger className="h-8 w-64 text-sm">
              <SelectValue placeholder="All matters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All matters</SelectItem>
              {(matters ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.matter_number ? `${m.matter_number} — ` : ''}{m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="rounded-lg border bg-white divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-[40%]" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <TimeEntryTable
            entries={entries ?? []}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {/* Form dialog */}
        <TimeEntryForm
          open={formOpen}
          onOpenChange={setFormOpen}
          editEntry={editEntry}
        />
      </div>
    </RequirePermission>
  )
}
