'use client'

import { useMemo, useState } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useAuditLogs } from '@/lib/queries/audit-logs'
import { formatFullName, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ChevronDown,
  Clock,
  ArrowRight,
  User,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return formatDate(date)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from)
  const b = new Date(to)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}


// ─── Component ──────────────────────────────────────────────────────

export function StageHistory() {
  const { entityId, tenantId, lead, stages, users } = useCommandCentre()
  const [expanded, setExpanded] = useState(false)

  const { data: auditLogs } = useAuditLogs({
    tenantId,
    entityType: 'lead',
    entityId,
    limit: 100,
  })

  // Filter to stage_changed events and build timeline
  const stageEvents = useMemo(() => {
    if (!auditLogs) return []

    return auditLogs
      .filter((log) => log.action === 'stage_changed')
      .sort((a, b) => new Date(a.created_at ?? '').getTime() - new Date(b.created_at ?? '').getTime())
      .map((log, idx, arr) => {
        const changes = (log.changes ?? {}) as Record<string, unknown>
        const stageId = changes.stage_id as string
        const stage = stages.find((s) => s.id === stageId)
        const user = log.user_id ? users.find((u) => u.id === log.user_id) : null
        const userName = user ? formatFullName(user.first_name, user.last_name) || user.email : 'System'

        // Days spent = diff between this event and the NEXT event (or now for the last one)
        const nextEvent = arr[idx + 1]
        const exitTime = nextEvent ? (nextEvent.created_at ?? new Date().toISOString()) : new Date().toISOString()
        const daysSpent = daysBetween(log.created_at ?? '', exitTime)
        const isCurrent = !nextEvent

        return {
          id: log.id,
          stageId,
          stageName: stage?.name ?? 'Unknown Stage',
          stageColor: stage?.color ?? '#6b7280',
          userName,
          movedAt: log.created_at,
          daysSpent,
          isCurrent,
        }
      })
  }, [auditLogs, stages, users])

  // Summary: total days in pipeline, current stage days
  const totalDays = useMemo(() => {
    if (!stageEvents.length) return 0
    return daysBetween(stageEvents[0].movedAt ?? '', new Date().toISOString())
  }, [stageEvents])

  const currentStageDays = useMemo(() => {
    if (!lead?.stage_entered_at) return 0
    return daysBetween(lead.stage_entered_at, new Date().toISOString())
  }, [lead?.stage_entered_at])

  if (!lead) return null

  // Only render if we have stage history
  const hasHistory = stageEvents.length > 0

  return (
    <div className="px-4 pb-2">
      {/* Summary bar  -  always visible */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-7 text-xs text-slate-500 hover:text-slate-700 justify-between px-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {currentStageDays}d in current stage
          </span>
          {hasHistory && (
            <span className="text-slate-400">
              · {totalDays}d total · {stageEvents.length} transition{stageEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </Button>

      {/* Expanded timeline */}
      {expanded && hasHistory && (
        <div className="mt-1 mb-1 space-y-0">
          {stageEvents.map((event, idx) => (
            <div key={event.id} className="flex items-start gap-2 py-1.5">
              {/* Timeline dot + line */}
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full border-2',
                    event.isCurrent ? 'ring-2 ring-offset-1' : ''
                  )}
                  style={{
                    backgroundColor: event.stageColor,
                    borderColor: event.stageColor,
                    ...(event.isCurrent ? { ringColor: event.stageColor } : {}),
                  }}
                />
                {idx < stageEvents.length - 1 && (
                  <div className="w-px h-full min-h-[16px] bg-slate-200 mt-0.5" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 -mt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-xs font-medium"
                    style={{ color: event.stageColor }}
                  >
                    {event.stageName}
                  </span>
                  {event.isCurrent && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      current
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                    {event.daysSpent}d
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                  <User className="h-2.5 w-2.5" />
                  <span>{event.userName}</span>
                  <span>·</span>
                  <span>{formatDate(event.movedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No stage history yet */}
      {expanded && !hasHistory && (
        <p className="text-[10px] text-slate-400 py-1 px-2">
          No stage transitions recorded yet.
        </p>
      )}
    </div>
  )
}
