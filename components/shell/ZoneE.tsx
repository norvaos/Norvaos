'use client'

/**
 * ZoneE — Audit Rail (Right Rail)
 *
 * Collapsible right sidebar (250px expanded, 28px collapsed).
 * Shows the last 20 stage_transition_log entries for the matter.
 * Each entry displays:
 *   - Transition type badge (advance / return_for_correction / override / reassignment)
 *   - From → To stage names
 *   - User who made the transition
 *   - Relative timestamp
 *   - Override reason (if present)
 *
 * Spec ref: Section 3 — Zone E: Audit Rail
 */

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ChevronLeft, ChevronRight, History, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useStageTransitionLog } from '@/lib/queries/stage-transitions'
import type { StageTransitionWithUser } from '@/lib/queries/stage-transitions'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ZoneEProps {
  matterId: string
  tenantId: string
}

// ── Transition type config ────────────────────────────────────────────────────

type TransitionType = 'advance' | 'return_for_correction' | 'override' | 'reassignment'

const TRANSITION_CONFIG: Record<TransitionType, {
  label: string
  className: string
}> = {
  advance: {
    label: 'Advance',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  return_for_correction: {
    label: 'Return',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  override: {
    label: 'Override',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  reassignment: {
    label: 'Reassign',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
}

function getTransitionConfig(type: string) {
  return TRANSITION_CONFIG[type as TransitionType] ?? {
    label: type,
    className: 'bg-muted text-muted-foreground border-border',
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function userDisplayName(
  users: StageTransitionWithUser['users'],
): string | null {
  if (!users) return null
  const name = [users.first_name, users.last_name].filter(Boolean).join(' ')
  return name || users.email || null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ZoneE({ matterId, tenantId: _tenantId }: ZoneEProps) {
  const [collapsed, setCollapsed] = useState(false)

  const { data: transitions = [], isLoading } = useStageTransitionLog(matterId)

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
            Stage History
          </span>
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

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">

        {isLoading && (
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

        {!isLoading && transitions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <History className="h-6 w-6 text-muted-foreground opacity-30" />
            <p className="text-[10px] text-muted-foreground leading-snug">
              No stage transitions recorded yet
            </p>
          </div>
        )}

        {!isLoading && transitions.length > 0 && (
          <div className="divide-y">
            {transitions.map((entry) => (
              <TransitionEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}

      </div>

      {/* Footer count */}
      {!isLoading && transitions.length > 0 && (
        <div className="flex-none border-t px-3 py-1.5">
          <p className="text-[10px] text-muted-foreground text-center">
            {transitions.length === 20
              ? 'Showing last 20 transitions'
              : `${transitions.length} transition${transitions.length === 1 ? '' : 's'}`}
          </p>
        </div>
      )}

    </div>
  )
}

// ── TransitionEntry ───────────────────────────────────────────────────────────

function TransitionEntry({ entry }: { entry: StageTransitionWithUser }) {
  const config    = getTransitionConfig(entry.transition_type)
  const actor     = userDisplayName(entry.users)
  const timeAgo   = entry.created_at
    ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
    : null

  const hasStageNames = entry.from_stage_name || entry.to_stage_name

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

      {/* Stage names */}
      {hasStageNames && (
        <div className="flex items-center gap-1 text-[10px] leading-snug">
          {entry.from_stage_name ? (
            <span className="text-muted-foreground truncate max-w-[80px]">
              {entry.from_stage_name}
            </span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
          )}
          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          {entry.to_stage_name ? (
            <span className="font-medium truncate max-w-[80px]">
              {entry.to_stage_name}
            </span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
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
        <div className="flex items-start gap-1 rounded bg-red-50 px-1.5 py-1">
          <AlertCircle className="h-2.5 w-2.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[9px] text-red-700 leading-snug line-clamp-2">
            {entry.override_reason}
          </p>
        </div>
      )}

    </div>
  )
}
