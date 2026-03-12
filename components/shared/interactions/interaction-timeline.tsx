'use client'

import { useState, useMemo } from 'react'
import { useActivities } from '@/lib/queries/activities'
import { formatRelativeDate } from '@/lib/utils/formatters'
import { CALL_OUTCOMES, MEETING_OUTCOME_TYPES } from '@/lib/utils/constants'
import {
  INTERACTION_GROUPS,
  ALL_INTERACTION_TYPES,
  getActivityTypeLabel,
} from './interaction-constants'
import type { InteractionGroup } from './interaction-constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  Mail,
  MailOpen,
  Calendar,
  MessageSquare,
  Send,
  Inbox,
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

// ─── Props ──────────────────────────────────────────────────────────

interface InteractionTimelineProps {
  contactId?: string
  matterId?: string
  tenantId: string
}

// ─── Helpers ────────────────────────────────────────────────────────

function getItemIcon(activityType: string, metadata?: Record<string, unknown>): { Icon: LucideIcon; colorClass: string } {
  switch (activityType) {
    case 'phone_inbound':
      return { Icon: PhoneIncoming, colorClass: 'bg-green-50 text-green-600' }
    case 'phone_outbound':
      return { Icon: PhoneOutgoing, colorClass: 'bg-blue-50 text-blue-600' }
    case 'phone_call': {
      const dir = (metadata?.direction as string) ?? 'outbound'
      return dir === 'inbound'
        ? { Icon: PhoneIncoming, colorClass: 'bg-green-50 text-green-600' }
        : { Icon: PhoneOutgoing, colorClass: 'bg-blue-50 text-blue-600' }
    }
    case 'email_sent':
      return { Icon: Mail, colorClass: 'bg-purple-50 text-purple-600' }
    case 'email_received':
      return { Icon: MailOpen, colorClass: 'bg-purple-50 text-purple-600' }
    case 'sms_sent':
      return { Icon: Send, colorClass: 'bg-amber-50 text-amber-600' }
    case 'sms_received':
      return { Icon: Inbox, colorClass: 'bg-amber-50 text-amber-600' }
    case 'meeting':
    case 'consultation':
    case 'booking_created':
    case 'booking_rescheduled':
    case 'appointment_started':
    case 'appointment_checked_in':
    case 'appointment_completed':
      return { Icon: Calendar, colorClass: 'bg-green-50 text-green-600' }
    default:
      return { Icon: Activity, colorClass: 'bg-slate-50 text-slate-600' }
  }
}

function getOutcomeBadge(activityType: string, metadata?: Record<string, unknown>) {
  const outcomeVal = metadata?.outcome as string | undefined
  if (!outcomeVal) return null

  // Check call outcomes
  const callOutcome = CALL_OUTCOMES.find((o) => o.value === outcomeVal)
  if (callOutcome) {
    return { label: callOutcome.label, color: callOutcome.color }
  }

  // Check meeting outcomes
  const meetingOutcome = MEETING_OUTCOME_TYPES.find((o) => o.value === outcomeVal)
  if (meetingOutcome) {
    return { label: meetingOutcome.label, color: meetingOutcome.color }
  }

  return { label: outcomeVal.replace(/_/g, ' '), color: '#6b7280' }
}

function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes) return null
  if (minutes < 60) return `${minutes}m`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

// ─── Component ──────────────────────────────────────────────────────

export function InteractionTimeline({ contactId, matterId, tenantId }: InteractionTimelineProps) {
  const { data: allActivities, isLoading } = useActivities({
    tenantId,
    contactId,
    matterId,
    limit: 200,
  })

  // Filter to only interaction types and group them
  const groupedData = useMemo(() => {
    if (!allActivities) return []

    const interactionActivities = allActivities.filter((a) =>
      ALL_INTERACTION_TYPES.includes(a.activity_type)
    )

    return INTERACTION_GROUPS.map((group) => {
      const items = interactionActivities
        .filter((a) => group.activityTypes.includes(a.activity_type))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return { group, items }
    })
  }, [allActivities])

  // Expand/collapse state — default: first non-empty group expanded
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    let firstSet = false
    for (const g of INTERACTION_GROUPS) {
      if (!firstSet) {
        initial[g.key] = true
        firstSet = true
      } else {
        initial[g.key] = false
      }
    }
    return initial
  })

  const allExpanded = useMemo(
    () => INTERACTION_GROUPS.every((g) => expandedGroups[g.key]),
    [expandedGroups]
  )

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAll = () => {
    const newVal = !allExpanded
    const next: Record<string, boolean> = {}
    for (const g of INTERACTION_GROUPS) {
      next[g.key] = newVal
    }
    setExpandedGroups(next)
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const totalInteractions = groupedData.reduce((sum, g) => sum + g.items.length, 0)

  if (totalInteractions === 0) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto h-10 w-10 text-slate-200 mb-3" />
        <p className="text-sm font-medium text-slate-500">No interactions recorded</p>
        <p className="text-xs text-slate-400 mt-1">
          Use the quick actions above to log phone calls, emails, meetings, or SMS.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header with expand/collapse all */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {totalInteractions} interaction{totalInteractions !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={toggleAll}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Grouped sections */}
      {groupedData.map(({ group, items }) => (
        <GroupSection
          key={group.key}
          group={group}
          items={items}
          expanded={expandedGroups[group.key] ?? false}
          onToggle={() => toggleGroup(group.key)}
        />
      ))}
    </div>
  )
}

// ─── Group Section ──────────────────────────────────────────────────

interface GroupSectionProps {
  group: InteractionGroup
  items: Array<{
    id: string
    activity_type: string
    title: string
    description: string | null
    metadata: unknown
    created_at: string
    user_id: string | null
  }>
  expanded: boolean
  onToggle: () => void
}

function GroupSection({ group, items, expanded, onToggle }: GroupSectionProps) {
  const GroupIcon = group.icon
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
          'hover:bg-slate-50',
          expanded && 'border-b border-slate-100'
        )}
      >
        <Chevron className="h-4 w-4 text-slate-400 shrink-0" />
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', group.bgClass)}>
          <GroupIcon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium text-slate-700 flex-1">{group.label}</span>
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px] px-1.5 py-0',
            items.length === 0 && 'opacity-50'
          )}
        >
          {items.length}
        </Badge>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="bg-white">
          {items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-slate-400">No {group.label.toLowerCase()} recorded</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map((item) => {
                const meta = (item.metadata ?? {}) as Record<string, unknown>
                const { Icon, colorClass } = getItemIcon(item.activity_type, meta)
                const outcomeBadge = getOutcomeBadge(item.activity_type, meta)
                const duration = formatDuration(meta.duration_minutes as number | undefined)

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClass)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {getActivityTypeLabel(item.activity_type)}
                        </span>
                        {outcomeBadge && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                            style={{
                              backgroundColor: `${outcomeBadge.color}15`,
                              color: outcomeBadge.color,
                              borderColor: `${outcomeBadge.color}40`,
                            }}
                          >
                            {outcomeBadge.label}
                          </Badge>
                        )}
                        {duration && (
                          <span className="text-xs text-slate-400 flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {duration}
                          </span>
                        )}
                      </div>

                      {/* Description / notes */}
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      {/* Timestamp */}
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        {formatRelativeDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
