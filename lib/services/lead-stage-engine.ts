/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Stage Engine — Guarded Stage Transition System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates transitions via the workflow definition registry, creates relational
 * stage history records, triggers milestone creation, calls the summary
 * recalculator, and logs activity.
 *
 * No arbitrary stage movement. Every transition must pass guards.
 * Uses idempotency ledger for all stage advances.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import {
  STAGE_TRANSITION_RULES,
  STAGE_LABELS,
  LEAD_STAGES,
  isClosedStage,
  type LeadStage,
  type TransitionGuard,
} from '@/lib/config/lead-workflow-definitions'
import { executeIdempotent, idempotencyKeys } from './lead-idempotency'
import { recalculateLeadSummary } from './lead-summary-recalculator'
import { createMilestoneGroupsForStage } from './lead-milestone-engine'
import { getWorkspaceWorkflowConfig } from './workspace-config-service'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StageAdvanceParams {
  supabase: SupabaseClient<Database>
  leadId: string
  tenantId: string
  targetStage: LeadStage
  actorUserId: string
  actorType?: 'user' | 'system' | 'integration' | 'ai'
  reason?: string
  /** Skip guard evaluation (used only by closure engine which does its own checks) */
  skipGuards?: boolean
}

interface StageAdvanceResult {
  success: boolean
  error?: string
  blockedReasons?: string[]
  previousStage?: string | null
}

interface AvailableTransition {
  toStage: LeadStage
  label: string
  guards: TransitionGuard[]
  autoTransition: boolean
}

interface GuardEvaluation {
  allowed: boolean
  blockedReasons: string[]
}

// ─── Lead Context (for guard evaluation) ─────────────────────────────────────

interface LeadContext {
  id: string
  tenantId: string
  currentStage: string | null
  qualificationStatus: string
  conflictStatus: string
  consultationStatus: string
  retainerStatus: string
  paymentStatus: string
}

async function getLeadContext(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<LeadContext | null> {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, tenant_id, current_stage, qualification_status, conflict_status, consultation_status, retainer_status, payment_status')
    .eq('id', leadId)
    .single()

  if (!lead) return null

  return {
    id: lead.id,
    tenantId: lead.tenant_id,
    currentStage: lead.current_stage,
    qualificationStatus: lead.qualification_status,
    conflictStatus: lead.conflict_status,
    consultationStatus: lead.consultation_status,
    retainerStatus: lead.retainer_status,
    paymentStatus: lead.payment_status,
  }
}

// ─── Stage Advance ───────────────────────────────────────────────────────────

/**
 * Advance a lead to a new stage with full guard validation.
 * Idempotent: duplicate advances to the same stage are skipped.
 */
export async function advanceLeadStage(params: StageAdvanceParams): Promise<StageAdvanceResult> {
  const { supabase, leadId, tenantId, targetStage, actorUserId, actorType = 'user', reason, skipGuards } = params

  // 1. Idempotent execution
  const result = await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'stage_advance',
    executionKey: idempotencyKeys.stageAdvance(leadId, targetStage),
    actorUserId,
    handler: async () => {
      // 2. Fetch lead context
      const ctx = await getLeadContext(supabase, leadId)
      if (!ctx) throw new Error('Lead not found')

      const previousStage = ctx.currentStage

      // 3. Validate transition guards (unless skipGuards)
      if (!skipGuards) {
        const guardResult = await evaluateTransitionGuards(supabase, ctx, targetStage)
        if (!guardResult.allowed) {
          return { success: false, blockedReasons: guardResult.blockedReasons, previousStage }
        }
      }

      // 4. Create relational stage history record
      await supabase.from('lead_stage_history').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        from_stage: previousStage,
        to_stage: targetStage,
        changed_at: new Date().toISOString(),
        actor_user_id: actorUserId,
        actor_type: actorType,
        reason: reason ?? null,
      })

      // 5. Update lead's current_stage, stage_entered_at, and is_closed
      await supabase
        .from('leads')
        .update({
          current_stage: targetStage,
          stage_entered_at: new Date().toISOString(),
          is_closed: isClosedStage(targetStage),
        })
        .eq('id', leadId)

      // 6. Log activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'lead_stage_change',
        title: `Stage advanced to "${STAGE_LABELS[targetStage] ?? targetStage}"`,
        description: previousStage
          ? `Lead moved from "${STAGE_LABELS[previousStage as LeadStage] ?? previousStage}" to "${STAGE_LABELS[targetStage] ?? targetStage}"${reason ? `. Reason: ${reason}` : ''}`
          : `Lead stage set to "${STAGE_LABELS[targetStage] ?? targetStage}"`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: actorUserId,
        metadata: {
          from_stage: previousStage,
          to_stage: targetStage,
          actor_type: actorType,
          reason,
        } as unknown as Json,
      })

      // 7. Create milestone groups for the new stage
      const config = await getWorkspaceWorkflowConfig(supabase, tenantId)
      await createMilestoneGroupsForStage(supabase, {
        leadId,
        tenantId,
        stage: targetStage,
        actorUserId,
        workspaceConfig: config,
      })

      // 8. Recalculate derived summary fields
      await recalculateLeadSummary(supabase, leadId, tenantId)

      return { success: true, previousStage }
    },
  })

  // Handle idempotent skip
  if (result.skipped) {
    return { success: true } // Already advanced — idempotency protection
  }

  // Clean up idempotency entry when guards blocked the transition.
  // A guard-blocked advance should NOT consume the idempotency key —
  // the transition didn't happen, so future attempts must re-evaluate guards.
  if (result.executed && result.data && !result.data.success && result.data.blockedReasons) {
    await supabase
      .from('lead_workflow_executions')
      .delete()
      .eq('execution_key', idempotencyKeys.stageAdvance(leadId, targetStage))
      .eq('lead_id', leadId)
  }

  return result.data ?? { success: false, error: 'Unexpected execution failure' }
}

// ─── Guard Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate all transition guards for moving a lead to a target stage.
 * Returns allowed=false with human-readable reasons if any guard fails.
 */
export async function evaluateTransitionGuards(
  supabase: SupabaseClient<Database>,
  ctx: LeadContext,
  targetStage: LeadStage
): Promise<GuardEvaluation> {
  const currentStage = ctx.currentStage as LeadStage | null
  if (!currentStage) {
    return { allowed: true, blockedReasons: [] } // No current stage — initial entry
  }

  const rules = STAGE_TRANSITION_RULES[currentStage]
  if (!rules) {
    return { allowed: false, blockedReasons: [`No transitions defined from stage "${currentStage}"`] }
  }

  const targetRule = rules.find((r) => r.toStage === targetStage)
  if (!targetRule) {
    return { allowed: false, blockedReasons: [`Transition from "${STAGE_LABELS[currentStage]}" to "${STAGE_LABELS[targetStage]}" is not allowed`] }
  }

  const blockedReasons: string[] = []

  for (const guard of targetRule.guards) {
    const passed = await evaluateSingleGuard(supabase, ctx, guard)
    if (!passed) {
      blockedReasons.push(guard.description)
    }
  }

  return { allowed: blockedReasons.length === 0, blockedReasons }
}

async function evaluateSingleGuard(
  supabase: SupabaseClient<Database>,
  ctx: LeadContext,
  guard: TransitionGuard
): Promise<boolean> {
  switch (guard.type) {
    case 'first_outbound_communication': {
      const { count } = await supabase
        .from('lead_communication_events')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', ctx.id)
        .eq('direction', 'outbound')
      return (count ?? 0) > 0
    }

    case 'contact_made_and_qualification_complete':
      return ctx.qualificationStatus === 'qualified' || ctx.qualificationStatus === 'needs_lawyer_review'

    case 'qualification_complete':
      return ctx.qualificationStatus === 'qualified' || ctx.qualificationStatus === 'needs_lawyer_review'

    case 'not_qualified':
      return ctx.qualificationStatus === 'not_qualified'

    case 'consultation_booked':
      return ctx.consultationStatus === 'booked'

    case 'consultation_completed':
      return ctx.consultationStatus === 'completed'

    case 'consultation_outcome_send_retainer': {
      const { data } = await supabase
        .from('lead_consultations')
        .select('outcome')
        .eq('lead_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.outcome === 'send_retainer'
    }

    case 'consultation_outcome_client_declined': {
      const { data } = await supabase
        .from('lead_consultations')
        .select('outcome')
        .eq('lead_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.outcome === 'client_declined'
    }

    case 'consultation_outcome_not_a_fit': {
      const { data } = await supabase
        .from('lead_consultations')
        .select('outcome')
        .eq('lead_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.outcome === 'not_a_fit'
    }

    case 'retainer_sent':
      return ctx.retainerStatus !== 'not_sent'

    case 'retainer_signed':
      return ctx.retainerStatus === 'signed' || ctx.retainerStatus === 'payment_pending' || ctx.retainerStatus === 'fully_retained'

    case 'retainer_signed_and_paid':
      return ctx.retainerStatus === 'fully_retained' || (ctx.retainerStatus === 'signed' && ctx.paymentStatus === 'paid')

    case 'payment_received':
      return ctx.paymentStatus === 'paid' || ctx.paymentStatus === 'waived'

    case 'all_conversion_gates_pass': {
      // Delegate to conversion gate service (lazy import to avoid circular deps)
      const { evaluateConversionGates } = await import('./lead-conversion-gate')
      const config = await getWorkspaceWorkflowConfig(supabase, ctx.tenantId)
      const gateResult = await evaluateConversionGates(supabase, ctx.id, ctx.tenantId, config)
      return gateResult.canConvert
    }

    case 'cadence_exhausted':
      // Cadence exhaustion is determined by the scheduler, not by guard eval.
      // When the scheduler determines cadence is exhausted, it calls advanceLeadStage
      // with skipGuards=true. This guard always returns true for manual closure.
      return true

    case 'closure_record_required':
      // Closure records are created by the closure engine before stage advance.
      // This guard checks that a closure record exists.
      const { count: closureCount } = await supabase
        .from('lead_closure_records')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', ctx.id)
        .order('created_at', { ascending: false })
        .limit(1)
      return (closureCount ?? 0) > 0

    default:
      return false
  }
}

// ─── Available Transitions ───────────────────────────────────────────────────

/**
 * Get all valid next stages for a lead, based on the workflow registry.
 */
export function getAvailableTransitions(currentStage: string | null): AvailableTransition[] {
  if (!currentStage) return []

  const rules = STAGE_TRANSITION_RULES[currentStage as LeadStage]
  if (!rules) return []

  return rules.map((rule) => ({
    toStage: rule.toStage,
    label: STAGE_LABELS[rule.toStage] ?? rule.toStage,
    guards: rule.guards,
    autoTransition: rule.autoTransition,
  }))
}

/**
 * Get available transitions with guard evaluation results.
 * Useful for UI — shows which transitions are available and which are blocked.
 */
export async function getAvailableTransitionsWithStatus(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<Array<AvailableTransition & { allowed: boolean; blockedReasons: string[] }>> {
  const ctx = await getLeadContext(supabase, leadId)
  if (!ctx || !ctx.currentStage) return []

  const transitions = getAvailableTransitions(ctx.currentStage)
  const results = await Promise.all(
    transitions.map(async (t) => {
      const guardResult = await evaluateTransitionGuards(supabase, ctx, t.toStage)
      return { ...t, allowed: guardResult.allowed, blockedReasons: guardResult.blockedReasons }
    })
  )

  return results
}
