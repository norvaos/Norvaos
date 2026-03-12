'use client'

import { ListChecks } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { MilestoneGroupList } from './milestone-group-list'
import { ConversionGatesCard } from './conversion-gates-card'
import { ClosureRecordCard } from './closure-record-card'
import { isClosedStage } from '@/lib/config/lead-workflow-definitions'
import { LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'
import type {
  MilestoneGroupWithTasks,
  UserRow,
  GateResult,
  LeadClosureRecordRow,
} from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface RightPanelProps {
  currentStage: string | null
  isReadOnly: boolean

  // Milestones
  milestones: MilestoneGroupWithTasks[] | undefined
  isMilestonesLoading: boolean
  users: UserRow[] | undefined
  onCompleteTask?: (taskId: string) => void
  onSkipTask?: (taskId: string) => void
  updatingTaskId?: string | null

  // Conversion gates (only at retained_active_matter)
  canConvert?: boolean
  gateResults?: GateResult[]
  blockedReasons?: string[]
  isGatesLoading?: boolean
  onConvert?: () => void

  // Closure record (only when closed)
  closureRecords?: LeadClosureRecordRow[]
  onReopen?: () => void
}

export function RightPanel({
  currentStage,
  isReadOnly,
  milestones,
  isMilestonesLoading,
  users,
  onCompleteTask,
  onSkipTask,
  updatingTaskId,
  canConvert,
  gateResults,
  blockedReasons,
  isGatesLoading,
  onConvert,
  closureRecords,
  onReopen,
}: RightPanelProps) {
  const showConversionGates = currentStage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
  const showClosureRecord = isClosedStage(currentStage ?? '') && closureRecords && closureRecords.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Milestones & Tasks</h3>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Closure record (if closed) */}
        {showClosureRecord && closureRecords && (
          <ClosureRecordCard
            record={closureRecords[0]}
            users={users}
            onReopen={isReadOnly ? undefined : onReopen}
          />
        )}

        {/* Conversion gates (if at retained_active_matter) */}
        {showConversionGates && gateResults && onConvert && (
          <ConversionGatesCard
            canConvert={canConvert ?? false}
            gateResults={gateResults}
            blockedReasons={blockedReasons ?? []}
            isLoading={isGatesLoading}
            onConvert={onConvert}
          />
        )}

        {/* Milestones */}
        {isMilestonesLoading ? (
          <MilestonesSkeleton />
        ) : (
          <MilestoneGroupList
            milestones={milestones ?? []}
            users={users}
            isReadOnly={isReadOnly}
            onCompleteTask={onCompleteTask}
            onSkipTask={onSkipTask}
            updatingTaskId={updatingTaskId}
          />
        )}
      </div>
    </div>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function MilestonesSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-8" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-1 w-full rounded-full" />
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-6 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
