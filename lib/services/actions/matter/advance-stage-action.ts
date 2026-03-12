import type { ActionDefinition } from '../types'
import { advanceMatterStageSchema, type AdvanceMatterStageInput } from '@/lib/schemas/workflow-actions'

interface AdvanceStageResult {
  matterId: string
  stageName: string
  stageId: string
}

/**
 * Server-validated stage advancement action.
 * Wraps the existing stage-engine.ts (advanceGenericStage / advanceImmigrationStage)
 * and adds workflow_actions + audit_logs + activities triple-write.
 *
 * Rule #2: No drag-and-drop. All stage movement via this action.
 * Rule #3: Server-side enforcement — gating rules validated by stage engine.
 * Rule #11: Front desk cannot manually move stages (enforced by allowedSources).
 */
export const advanceStageAction: ActionDefinition<AdvanceMatterStageInput, AdvanceStageResult> = {
  type: 'advance_matter_stage',
  label: 'Advance Matter Stage',
  inputSchema: advanceMatterStageSchema,
  permission: { entity: 'matters', action: 'edit' },
  // Rule #11: Front desk excluded — stage changes only as side effects of other actions
  allowedSources: ['command_centre', 'dashboard', 'api'],
  entityType: 'matter',
  getEntityId: (input) => input.matterId,
  getMatterId: (input) => input.matterId,

  async snapshotBefore({ input, supabase, tenantId }) {
    // Get current stage state
    const { data: matter } = await supabase
      .from('matters')
      .select('status, practice_area_id')
      .eq('id', input.matterId)
      .eq('tenant_id', tenantId)
      .single()

    const { data: stageState } = await supabase
      .from('matter_stage_state')
      .select('current_stage_id, previous_stage_id, entered_at')
      .eq('matter_id', input.matterId)
      .limit(1)
      .maybeSingle()

    return {
      matter_status: matter?.status,
      current_stage_id: stageState?.current_stage_id,
      previous_stage_id: stageState?.previous_stage_id,
      entered_at: stageState?.entered_at,
    }
  },

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // Determine if this is an immigration matter
    const { data: matterImm } = await supabase
      .from('matter_immigration')
      .select('id')
      .eq('matter_id', input.matterId)
      .limit(1)
      .maybeSingle()

    // Import and call the appropriate stage engine
    const { advanceGenericStage, advanceImmigrationStage } = await import('@/lib/services/stage-engine')

    // skipActivityLog: true — the action executor handles the activity record
    // via the atomic triple-write (Rule #5). Without this flag, the stage engine
    // writes its own activity AND the executor writes another = duplicate.
    // Phase 7 Fix 5a.
    const stageResult = matterImm
      ? await advanceImmigrationStage({
          supabase,
          matterId: input.matterId,
          tenantId,
          targetStageId: input.targetStageId,
          userId,
          skipActivityLog: true,
        })
      : await advanceGenericStage({
          supabase,
          matterId: input.matterId,
          tenantId,
          targetStageId: input.targetStageId,
          userId,
          skipActivityLog: true,
        })

    if (!stageResult.success) {
      throw new Error(stageResult.error)
    }

    // Get new stage state for snapshot
    const { data: newStageState } = await supabase
      .from('matter_stage_state')
      .select('current_stage_id, previous_stage_id, entered_at')
      .eq('matter_id', input.matterId)
      .limit(1)
      .maybeSingle()

    return {
      data: {
        matterId: input.matterId,
        stageName: stageResult.stageName,
        stageId: input.targetStageId,
      },
      newState: {
        current_stage_id: newStageState?.current_stage_id,
        previous_stage_id: newStageState?.previous_stage_id,
        entered_at: newStageState?.entered_at,
        stage_name: stageResult.stageName,
      },
      activity: {
        // Stage engine's own activity is skipped (skipActivityLog: true).
        // This is the single authoritative activity for the stage change,
        // written atomically with workflow_actions + audit_logs (Rule #5).
        activityType: 'stage_change',
        title: `Stage advanced to "${stageResult.stageName}"`,
        description: `Server-validated stage advancement through action executor`,
        metadata: {
          target_stage_id: input.targetStageId,
          stage_name: stageResult.stageName,
          is_immigration: !!matterImm,
        },
        matterId: input.matterId,
      },
    }
  },

  // Stage engine already triggers automations internally, so we don't double-trigger
  // automationTrigger is intentionally not set here
}
