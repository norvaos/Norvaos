'use client'

/**
 * ZoneB  -  Stage Rail
 *
 * Horizontal pill-based stage navigator below Zone A.
 * Current stage highlighted. Completed stages green with checkmark.
 * Upcoming stages grey. Gated stages red with lock icon.
 *
 * Wired to:
 *   - matter_stage_state        (current_stage_id, stage_history)
 *   - matter_stages             (all stages for the pipeline)
 *   - check-gating API          (which stages have unmet gate conditions)
 *   - useImmigrationReadiness   (blockers surfaced on next stage for imm. matters)
 *   - useAdvanceMatterStage mutation
 *
 * Read-only when matter is closed.
 */

import { useCallback, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { StagePipelineBar } from '@/components/matters/stage-pipeline-bar'
import {
  useMatterStageState,
  useMatterStages,
  useAdvanceMatterStage,
  useCheckGating,
} from '@/lib/queries/matter-types'
import { useImmigrationReadiness } from '@/lib/queries/immigration-readiness'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoneBProps {
  matterId: string
  tenantId: string
  matter: Matter
}

// ── Component ────────────────────────────────────────────────────────────────

export function ZoneB({ matterId, matter }: ZoneBProps) {
  // Stage state: current stage + history
  const { data: stageState, isLoading: stateLoading } = useMatterStageState(matterId)

  // Resolve pipeline ID: prefer stage_state.pipeline_id, fall back to matter column
  const pipelineId = stageState?.pipeline_id ?? matter.matter_stage_pipeline_id ?? null

  // All stages for this pipeline, sorted by sort_order
  const { data: stages, isLoading: stagesLoading } = useMatterStages(pipelineId)

  // Pre-evaluated gating errors for all stages
  const { data: gatingData } = useCheckGating(matterId, !!pipelineId)

  // Immigration readiness blockers  -  only fetched for immigration matters
  const isImmigrationMatter = !!matter.matter_type_id
  const { data: readinessData } = useImmigrationReadiness(isImmigrationMatter ? matterId : null)

  const advanceStage = useAdvanceMatterStage()

  const isLoading = stateLoading || stagesLoading
  const isClosed = ['closed_won', 'closed_refused', 'closed_withdrawn'].includes(matter.status ?? '')

  const handleStageClick = useCallback(
    (stageId: string) => {
      if (isClosed) return
      if (stageId === stageState?.current_stage_id) return
      // Determine system type based on matter type presence
      const system = matter.matter_type_id ? 'immigration' : 'generic'
      advanceStage.mutate({ matterId, targetStageId: stageId, system })
    },
    [matterId, stageState?.current_stage_id, isClosed, advanceStage, matter.matter_type_id],
  )

  /**
   * Merge check-gating API errors with immigration readiness blockers.
   *
   * For immigration matters: if there are known readiness blockers (docs
   * missing, questionnaire incomplete, etc.), annotate the "next" stage
   * (the stage immediately after the current one) with those reasons.
   *
   * The check-gating API evaluates matter_stages.gating_rules; the readiness
   * hook provides granular immigration-specific blockers. Both are surfaced
   * in the tooltip so the lawyer sees a single, complete blocked view.
   */
  const effectiveGatingErrors = useMemo((): Record<string, string[]> | undefined => {
    const base: Record<string, string[]> = { ...(gatingData?.gatingErrors ?? {}) }

    if (!readinessData || !stages || stages.length === 0) return base

    const blockers = readinessData.blockedReasons
    if (!blockers || blockers.length === 0) return base

    // Find the next stage (immediately after current)
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order)
    const currentIndex = sorted.findIndex((s) => s.id === stageState?.current_stage_id)
    const nextStage = currentIndex >= 0 ? sorted[currentIndex + 1] : null

    if (!nextStage) return base

    // Merge: deduplicate with any existing check-gating errors on this stage
    const existing = base[nextStage.id] ?? []
    const merged = Array.from(new Set([...existing, ...blockers]))
    if (merged.length > 0) {
      base[nextStage.id] = merged
    }

    return base
  }, [gatingData?.gatingErrors, readinessData, stages, stageState?.current_stage_id])

  if (isLoading) {
    return (
      <div className="flex-none border-b bg-card px-4 py-2">
        <Skeleton className="h-5 w-full rounded-full" />
      </div>
    )
  }

  // No pipeline configured for this matter type  -  hide rail entirely
  if (!stages || stages.length === 0) return null

  // Stage history is stored as JSONB on matter_stage_state
  const stageHistory = (stageState?.stage_history as Array<{
    stage_id: string
    stage_name: string
    entered_at: string
    exited_at?: string
    user_id?: string
  }>) ?? []

  return (
    <div className="flex-none border-b bg-card px-4 py-2">
      <StagePipelineBar
        stages={stages}
        currentStageId={stageState?.current_stage_id ?? null}
        stageEnteredAt={stageState?.entered_at ?? null}
        stageHistory={stageHistory}
        onStageClick={isClosed ? undefined : handleStageClick}
        disabled={isClosed || advanceStage.isPending}
        gatingErrors={effectiveGatingErrors}
      />
    </div>
  )
}
