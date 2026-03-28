'use client'

import {
  ArrowRight, Bot, User as UserIcon, CheckCircle2, History,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatRelativeDate } from '@/lib/utils/formatters'
import { getStageLabel, getActorDisplay } from './lead-workflow-helpers'
import type { LeadStageHistoryRow, Activity, UserRow } from './lead-workflow-types'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Unified feed item  -  either a stage transition or an activity */
type FeedItem =
  | { type: 'stage_transition'; data: LeadStageHistoryRow; timestamp: string }
  | { type: 'activity'; data: Activity; timestamp: string }

// ─── Component ──────────────────────────────────────────────────────────────

interface StageActivityFeedProps {
  stageHistory: LeadStageHistoryRow[]
  activities: Activity[]
  users: UserRow[] | undefined
}

export function StageActivityFeed({ stageHistory, activities, users }: StageActivityFeedProps) {
  // Merge and sort chronologically (newest first)
  const items: FeedItem[] = [
    ...stageHistory.map((sh): FeedItem => ({
      type: 'stage_transition',
      data: sh,
      timestamp: sh.changed_at,
    })),
    ...activities.map((act): FeedItem => ({
      type: 'activity',
      data: act,
      timestamp: act.created_at ?? '',
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No timeline entries yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {items.map((item, idx) => (
        <div key={`${item.type}-${item.type === 'stage_transition' ? item.data.id : item.data.id}-${idx}`}>
          {item.type === 'stage_transition' ? (
            <StageTransitionItem entry={item.data} users={users} />
          ) : (
            <ActivityItem activity={item.data} users={users} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Stage Transition Item ──────────────────────────────────────────────────

function StageTransitionItem({
  entry,
  users,
}: {
  entry: LeadStageHistoryRow
  users: UserRow[] | undefined
}) {
  const actor = getActorDisplay(entry.actor_type, entry.actor_user_id, users)
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>
  const isAutoTriggered = metadata.autoTriggered === true

  return (
    <div className="flex gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <ArrowRight className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">Stage changed</span>
          {entry.from_stage && (
            <Badge variant="outline" size="xs">
              {getStageLabel(entry.from_stage)}
            </Badge>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="outline" size="xs" className="bg-primary/5 text-primary border-primary/20">
            {getStageLabel(entry.to_stage)}
          </Badge>
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {isAutoTriggered && (
            <Badge variant="outline" size="xs" className="bg-muted text-muted-foreground border-border">
              <Bot className="mr-0.5 h-2.5 w-2.5" />
              Auto-advanced
            </Badge>
          )}
          <span>{actor.label}</span>
          <span>·</span>
          <span>{formatRelativeDate(entry.changed_at)}</span>
        </div>

        {entry.reason && (
          <p className="mt-1 text-xs text-muted-foreground italic">{entry.reason}</p>
        )}
      </div>
    </div>
  )
}

// ─── Activity Item ──────────────────────────────────────────────────────────

function ActivityItem({
  activity,
  users,
}: {
  activity: Activity
  users: UserRow[] | undefined
}) {
  const actor = activity.user_id
    ? getActorDisplay('user', activity.user_id, users)
    : getActorDisplay('system', null, users)

  return (
    <div className="flex gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          {activity.user_id ? (
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <p className="text-sm text-foreground">{activity.title}</p>
        {activity.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {activity.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{actor.label}</span>
          <span>·</span>
          <span>{formatRelativeDate(activity.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
