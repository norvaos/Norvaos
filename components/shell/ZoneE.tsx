'use client'

/**
 * ZoneE  -  Audit Rail (Right Rail)
 *
 * Collapsible right sidebar (250px expanded, 28px collapsed).
 * Section 1: Stage transition log (last 20 entries) with expandable gate snapshots.
 * Section 2: Activity feed (last 50 activities for the matter).
 *
 * Collapse state is persisted to the norvaos-ui Zustand store.
 *
 * Spec ref: Section 3  -  Zone E: Audit Rail
 */

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  History,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  XCircle,
  FileText,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  UserCheck,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { useStageTransitionLog } from '@/lib/queries/stage-transitions'
import { useUIStore } from '@/lib/stores/ui-store'
import type { StageTransitionWithUser } from '@/lib/queries/stage-transitions'
import type { ActivityRow, GateSnapshot, GateConditionResult } from '@/lib/types/database'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ZoneEProps {
  matterId: string
  tenantId: string
}

// ── Transition type config ────────────────────────────────────────────────────

type TransitionType = 'advance' | 'return_for_correction' | 'override' | 'reassignment' | 'rollback' | 'system'

const TRANSITION_CONFIG: Record<TransitionType, {
  label: string
  className: string
}> = {
  advance: {
    label: 'Advance',
    className: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20',
  },
  rollback: {
    label: 'Rollback',
    className: 'bg-red-950/30 text-red-400 border-red-500/20',
  },
  system: {
    label: 'System',
    className: 'bg-blue-950/30 text-blue-400 border-blue-500/20',
  },
  return_for_correction: {
    label: 'Return',
    className: 'bg-amber-950/30 text-amber-400 border-amber-500/20',
  },
  override: {
    label: 'Override',
    className: 'bg-red-950/30 text-red-400 border-red-500/20',
  },
  reassignment: {
    label: 'Reassign',
    className: 'bg-blue-950/30 text-blue-400 border-blue-500/20',
  },
}

function getTransitionConfig(type: string) {
  return TRANSITION_CONFIG[type as TransitionType] ?? {
    label: type,
    className: 'bg-muted text-muted-foreground border-border',
  }
}

// ── Activity type → icon ──────────────────────────────────────────────────────

function ActivityIcon({ type }: { type: string }) {
  const cls = 'h-3 w-3 shrink-0'
  switch (type) {
    case 'email':        return <Mail className={cls} />
    case 'call':         return <Phone className={cls} />
    case 'note':         return <FileText className={cls} />
    case 'meeting':      return <Calendar className={cls} />
    case 'sms':          return <MessageSquare className={cls} />
    case 'task':         return <CheckCircle2 className={cls} />
    case 'stage_change': return <UserCheck className={cls} />
    case 'system':       return <Zap className={cls} />
    default:             return <Activity className={cls} />
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function userDisplayName(
  users: StageTransitionWithUser['users'],
): string | null {
  if (!users) return null
  const name = [users.first_name, users.last_name].filter(Boolean).join(' ')
  return name || users.email || null
}

function relativeTime(ts: string | null | undefined): string | null {
  if (!ts) return null
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
  } catch {
    return null
  }
}

function parseGateSnapshot(raw: unknown): GateSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  // Empty object  -  legacy entry
  if (Object.keys(obj).length === 0) return null
  if (!Array.isArray(obj.conditions)) return null
  return obj as unknown as GateSnapshot
}

// ── Gate Snapshot Detail ──────────────────────────────────────────────────────

function GateSnapshotDetail({ snapshot }: { snapshot: GateSnapshot | null }) {
  if (!snapshot) {
    return (
      <p className="text-[9px] text-muted-foreground italic px-1 py-1">
        Gate details not available for this transition.
      </p>
    )
  }

  return (
    <div className="mt-1.5 rounded border bg-muted/30 px-2 py-1.5 space-y-1">
      <p className="text-[9px] text-muted-foreground">
        Evaluated {relativeTime(snapshot.evaluatedAt) ?? snapshot.evaluatedAt}
        {' · '}
        <span className={snapshot.allPassed ? 'text-green-600' : 'text-red-600'}>
          {snapshot.allPassed ? 'All gates passed' : 'Gate(s) failed'}
        </span>
      </p>
      <div className="space-y-0.5">
        {snapshot.conditions.map((c: GateConditionResult) => (
          <div key={c.conditionId} className="flex items-start gap-1">
            {c.passed
              ? <CheckCircle2 className="h-2.5 w-2.5 text-green-600 shrink-0 mt-0.5" />
              : <XCircle     className="h-2.5 w-2.5 text-red-500   shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <span className={cn(
                'text-[9px] leading-snug',
                c.passed ? 'text-foreground' : 'text-red-400',
              )}>
                {c.conditionName}
              </span>
              {c.details && (
                <p className="text-[8px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {c.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── TransitionEntry ───────────────────────────────────────────────────────────

function TransitionEntry({ entry }: { entry: StageTransitionWithUser }) {
  const [expanded, setExpanded] = useState(false)

  const config      = getTransitionConfig(entry.transition_type)
  const actor       = userDisplayName(entry.users)
  const timeAgo     = relativeTime(entry.created_at)
  const hasStages   = entry.from_stage_name || entry.to_stage_name
  const gateSnap    = parseGateSnapshot(entry.gate_snapshot)
  const hasGate     = entry.gate_snapshot !== null

  return (
    <div className="px-3 py-2.5 space-y-1.5 hover:bg-accent/30 transition-colors">

      {/* Type badge + timestamp */}
      <div className="flex items-center justify-between gap-1">
        <Badge
          variant="outline"
          className={cn('text-[9px] px-1 py-0 h-4 font-medium leading-none', config.className)}
        >
          {config.label}
        </Badge>
        {timeAgo && (
          <span className="text-[9px] text-muted-foreground shrink-0">
            {timeAgo}
          </span>
        )}
      </div>

      {/* Stage names with arrow */}
      {hasStages && (
        <div className="flex items-center gap-1 text-[10px] leading-snug">
          {entry.from_stage_name ? (
            <span className="text-muted-foreground truncate max-w-[80px]">
              {entry.from_stage_name}
            </span>
          ) : (
            <span className="text-muted-foreground italic"> - </span>
          )}
          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          {entry.to_stage_name ? (
            <span className="font-medium truncate max-w-[80px]">
              {entry.to_stage_name}
            </span>
          ) : (
            <span className="text-muted-foreground italic"> - </span>
          )}
        </div>
      )}

      {/* Actor */}
      {actor && (
        <p className="text-[10px] text-muted-foreground truncate">
          by {actor}
        </p>
      )}

      {/* Override reason */}
      {entry.override_reason && (
        <div className="flex items-start gap-1 rounded bg-red-950/30 px-1.5 py-1">
          <AlertCircle className="h-2.5 w-2.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[9px] text-red-400 leading-snug line-clamp-2">
            {entry.override_reason}
          </p>
        </div>
      )}

      {/* Gate snapshot toggle */}
      {hasGate && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded
            ? <ChevronUp   className="h-2.5 w-2.5" />
            : <ChevronDown className="h-2.5 w-2.5" />
          }
          {expanded ? 'Hide gate detail' : 'Gate detail'}
        </button>
      )}

      {/* Gate snapshot expanded */}
      {hasGate && expanded && (
        <GateSnapshotDetail snapshot={gateSnap} />
      )}

    </div>
  )
}

// ── ActivityEntry ─────────────────────────────────────────────────────────────

function ActivityEntry({ item }: { item: ActivityRow }) {
  const timeAgo = relativeTime(item.created_at)
  return (
    <div className="px-3 py-2 space-y-0.5 hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-1.5">
        <span className="text-muted-foreground mt-0.5">
          <ActivityIcon type={item.activity_type} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium truncate">{item.title}</p>
            {timeAgo && (
              <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo}</span>
            )}
          </div>
          {item.description && (
            <p className="text-[9px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
              {item.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ZoneE ─────────────────────────────────────────────────────────────────────

export function ZoneE({ matterId, tenantId: _tenantId }: ZoneEProps) {
  const collapsed    = useUIStore((s) => s.zoneECollapsed)
  const setCollapsed = useUIStore((s) => s.setZoneECollapsed)

  const { data: transitions = [], isLoading: transitionsLoading } =
    useStageTransitionLog(matterId)

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('activities')
        .select('id, activity_type, title, description, created_at, metadata')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(50)
      return (data ?? []) as ActivityRow[]
    },
    enabled: !!matterId,
  })

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex-none w-7 border-l bg-card flex flex-col items-center pt-2 gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          title="Expand audit rail"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <History
          className="h-3.5 w-3.5 text-muted-foreground opacity-50 mt-1"
          style={{ writingMode: 'vertical-lr' }}
        />
      </div>
    )
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  return (
    <div className="flex-none w-[250px] border-l bg-card flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-none">
        <div className="flex items-center gap-1.5">
          <History className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Norva Vault
          </span>
          <NorvaWhisper contentKey="vault.audit" side="bottom" />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          title="Collapse audit rail"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Section 1: Stage History ───────────────────────────────────── */}
        <div className="border-b">
          <div className="px-3 py-1.5 bg-muted/40 flex items-center gap-1.5">
            <History className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Norva Vault  -  Stage History
            </span>
          </div>

          {transitionsLoading && (
            <div className="p-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
          )}

          {!transitionsLoading && transitions.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
              <History className="h-5 w-5 text-muted-foreground opacity-30" />
              <p className="text-[9px] text-muted-foreground leading-snug">
                No stage transitions recorded yet
              </p>
            </div>
          )}

          {!transitionsLoading && transitions.length > 0 && (
            <>
              <div className="divide-y">
                {transitions.map((entry) => (
                  <TransitionEntry key={entry.id} entry={entry} />
                ))}
              </div>
              <div className="px-3 py-1.5 border-t">
                <p className="text-[9px] text-muted-foreground text-center">
                  {transitions.length === 20
                    ? 'Showing last 20 transitions'
                    : `${transitions.length} transition${transitions.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Section 2: Activity Feed ───────────────────────────────────── */}
        <div>
          <div className="px-3 py-1.5 bg-muted/40 flex items-center gap-1.5">
            <Activity className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Norva Timeline
            </span>
          </div>

          {activitiesLoading && (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-3/4" />
                </div>
              ))}
            </div>
          )}

          {!activitiesLoading && activities.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
              <Activity className="h-5 w-5 text-muted-foreground opacity-30" />
              <p className="text-[9px] text-muted-foreground leading-snug">
                No activity recorded for this matter
              </p>
            </div>
          )}

          {!activitiesLoading && activities.length > 0 && (
            <div className="divide-y">
              {activities.map((item) => (
                <ActivityEntry key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
