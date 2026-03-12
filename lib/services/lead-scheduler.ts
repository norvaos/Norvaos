/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Scheduled Automation Processor
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cron-driven service for evaluating and executing time-based lead automations.
 * Called by the cron endpoint on a regular schedule (e.g., every 15 minutes).
 *
 * All sub-processors:
 *   1. Use business-day logic (via addBusinessDays)
 *   2. Are idempotent (via workflow execution ledger)
 *   3. Are auditable (logged in activity log)
 *   4. Are deterministic (same input → same output, no random behaviour)
 *
 * Sub-processors:
 *   - processContactAttemptCadence: Next attempt tasks based on workspace config
 *   - processConsultationReminders: Reminder events before scheduled consultations
 *   - processNoShowRecovery: Follow-up tasks for no-show consultations
 *   - processRetainerFollowUp: Follow-up tasks for unsigned retainers
 *   - processPaymentFollowUp: Follow-up tasks for pending payments
 *   - processAutoClosureCheck: Auto-close leads when cadence exhausted
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { LEAD_STAGES, isClosedStage } from '@/lib/config/lead-workflow-definitions'
import { executeIdempotent, idempotencyKeys, todayDateKey } from './lead-idempotency'
import { getWorkspaceWorkflowConfig, type ResolvedWorkflowConfig } from './workspace-config-service'
import { addBusinessDays, businessDaysBetween } from '@/lib/utils/business-days'
import { logCommunicationEvent } from './lead-communication-engine'
import { closeLead } from './lead-closure-engine'
import { recalculateLeadSummary } from './lead-summary-recalculator'
import {
  isAutomationEnabled,
  resolveTemplate,
  buildBaseTemplateContext,
  type TemplateContext,
} from './lead-template-engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SchedulerResult {
  tenantsProcessed: number
  consultationReminders: number
  noShowRecovery: number
  autoClosures: number
  errors: number
}

interface TenantContext {
  supabase: SupabaseClient<Database>
  tenantId: string
  config: ResolvedWorkflowConfig
  timezone: string
  dateKey: string
  now: Date
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Process all scheduled lead automations for a single tenant.
 * Called by the cron endpoint per tenant.
 */
export async function processScheduledLeadAutomations(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<SchedulerResult> {
  const stats: SchedulerResult = {
    tenantsProcessed: 1,
    consultationReminders: 0,
    noShowRecovery: 0,
    autoClosures: 0,
    errors: 0,
  }

  // Resolve workspace config
  const config = await getWorkspaceWorkflowConfig(supabase, tenantId)

  // Resolve tenant timezone
  const { data: tenant } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('id', tenantId)
    .single()
  const timezone = tenant?.timezone ?? 'America/Toronto'
  const dateKey = todayDateKey(timezone)
  const now = new Date()

  const ctx: TenantContext = { supabase, tenantId, config, timezone, dateKey, now }

  // Run sub-processors — each one handles its own errors to avoid blocking others
  try {
    stats.consultationReminders += await processConsultationReminders(ctx)
  } catch (e) {
    console.error(`[lead-scheduler] Consultation reminders failed for tenant ${tenantId}:`, e)
    stats.errors++
  }

  try {
    stats.noShowRecovery += await processNoShowRecovery(ctx)
  } catch (e) {
    console.error(`[lead-scheduler] No-show recovery failed for tenant ${tenantId}:`, e)
    stats.errors++
  }

  try {
    stats.autoClosures += await processAutoClosureCheck(ctx)
  } catch (e) {
    console.error(`[lead-scheduler] Auto-closure check failed for tenant ${tenantId}:`, e)
    stats.errors++
  }

  return stats
}

// ─── Consultation Reminders ─────────────────────────────────────────────────

/**
 * Send reminder communication events for upcoming consultations.
 * Uses workspace config consultationReminderHours (e.g., [24, 2] = 24h and 2h before).
 */
async function processConsultationReminders(ctx: TenantContext): Promise<number> {
  const { supabase, tenantId, config, dateKey } = ctx
  let sent = 0

  if (config.consultationReminderHours.length === 0) return 0

  // Find consultations with status 'booked' that are upcoming
  const { data: consultations } = await supabase
    .from('lead_consultations')
    .select('id, lead_id, scheduled_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'booked')
    .gte('scheduled_at', ctx.now.toISOString())

  if (!consultations) return 0

  for (const consultation of consultations) {
    if (!consultation.scheduled_at) continue

    const scheduledAt = new Date(consultation.scheduled_at)
    const hoursUntil = (scheduledAt.getTime() - ctx.now.getTime()) / (1000 * 60 * 60)

    for (const reminderHour of config.consultationReminderHours) {
      // Determine which trigger key to use based on reminder hour
      const triggerKey = reminderHour >= 12
        ? 'consultation_reminder_24h'
        : 'consultation_reminder_2h'

      // Check if this automation is enabled for the workspace
      const enabled = await isAutomationEnabled(supabase, tenantId, triggerKey)
      if (!enabled) continue

      // Send reminder if within a 30-minute window of the target hour
      if (hoursUntil > reminderHour - 0.5 && hoursUntil <= reminderHour + 0.5) {
        const result = await executeIdempotent(supabase, {
          tenantId,
          leadId: consultation.lead_id,
          executionType: 'reminder_sent',
          executionKey: idempotencyKeys.reminderSent(
            consultation.lead_id,
            `consultation_${reminderHour}h`,
            dateKey
          ),
          handler: async () => {
            // Build template context with consultation-specific data
            const baseContext = await buildBaseTemplateContext(supabase, tenantId, consultation.lead_id)
            const templateContext: TemplateContext = {
              ...baseContext,
              consultation: {
                date: scheduledAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                time: scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              },
            }

            // Resolve template (workspace override → system default → merge field substitution)
            const template = await resolveTemplate(
              supabase, tenantId, triggerKey, 'system_reminder', templateContext
            )

            await logCommunicationEvent({
              supabase,
              tenantId,
              leadId: consultation.lead_id,
              channel: 'system_reminder',
              direction: 'system',
              subtype: 'consultation_reminder',
              actorType: 'system',
              subject: template?.subject ?? `Consultation reminder (${reminderHour}h before)`,
              bodyPreview: template?.body ?? `Upcoming consultation scheduled for ${scheduledAt.toISOString()}`,
              metadata: {
                consultation_id: consultation.id,
                reminder_hours_before: reminderHour,
                template_source: template?.isWorkspaceOverride ? 'workspace' : 'system_default',
              },
            })
          },
        })

        if (result.executed) sent++
      }
    }
  }

  return sent
}

// ─── No-Show Recovery ───────────────────────────────────────────────────────

/**
 * Process no-show consultations and create follow-up communication events.
 * Finds consultations marked as 'no_show' that haven't been followed up.
 */
async function processNoShowRecovery(ctx: TenantContext): Promise<number> {
  const { supabase, tenantId, config, timezone, dateKey, now } = ctx
  let processed = 0

  if (config.noShowCadenceDays.length === 0) return 0

  // Find leads with no-show consultations that are still active
  const { data: noShowConsultations } = await supabase
    .from('lead_consultations')
    .select('id, lead_id, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'no_show')

  if (!noShowConsultations) return 0

  for (const consultation of noShowConsultations) {
    // Check if the lead is still active (not closed)
    const { data: lead } = await supabase
      .from('leads')
      .select('current_stage, is_closed')
      .eq('id', consultation.lead_id)
      .single()

    if (!lead || lead.is_closed) continue
    if (lead.current_stage && isClosedStage(lead.current_stage)) continue

    const noShowDate = new Date(consultation.updated_at)

    // Count existing follow-ups since the no-show
    const { count: followUpCount } = await supabase
      .from('lead_communication_events')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', consultation.lead_id)
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .gte('occurred_at', noShowDate.toISOString())

    const currentStep = followUpCount ?? 0
    if (currentStep >= config.noShowCadenceDays.length) continue

    // Check if the next follow-up is due
    const cumulativeDays = config.noShowCadenceDays
      .slice(0, currentStep + 1)
      .reduce((sum, d) => sum + d, 0)
    const nextDueDate = addBusinessDays(noShowDate, cumulativeDays, timezone)

    if (now < nextDueDate) continue

    // Check if no-show follow-up automation is enabled
    const noShowEnabled = await isAutomationEnabled(supabase, tenantId, 'no_show_followup')
    if (!noShowEnabled) continue

    // Create reminder for the next follow-up step
    const result = await executeIdempotent(supabase, {
      tenantId,
      leadId: consultation.lead_id,
      executionType: 'reminder_sent',
      executionKey: idempotencyKeys.reminderSent(
        consultation.lead_id,
        `no_show_followup_${currentStep}`,
        dateKey
      ),
      handler: async () => {
        // Build template context with follow-up-specific data
        const baseContext = await buildBaseTemplateContext(supabase, tenantId, consultation.lead_id)
        const templateContext: TemplateContext = {
          ...baseContext,
          followup: {
            step: currentStep + 1,
            totalSteps: config.noShowCadenceDays.length,
            daysSince: businessDaysBetween(noShowDate, now, timezone),
          },
        }

        const template = await resolveTemplate(
          supabase, tenantId, 'no_show_followup', 'system_reminder', templateContext
        )

        await logCommunicationEvent({
          supabase,
          tenantId,
          leadId: consultation.lead_id,
          channel: 'system_reminder',
          direction: 'system',
          subtype: 'no_show_followup',
          actorType: 'system',
          subject: template?.subject ?? `No-show follow-up #${currentStep + 1} due`,
          bodyPreview: template?.body ?? `Follow-up #${currentStep + 1} is due for consultation no-show on ${noShowDate.toISOString().split('T')[0]}`,
          metadata: {
            consultation_id: consultation.id,
            follow_up_step: currentStep + 1,
            total_steps: config.noShowCadenceDays.length,
            template_source: template?.isWorkspaceOverride ? 'workspace' : 'system_default',
          },
        })
      },
    })

    if (result.executed) processed++
  }

  return processed
}

// ─── Auto-Closure Check ─────────────────────────────────────────────────────

/**
 * Auto-close leads that have been idle beyond the configured threshold.
 *
 * Evaluates leads that are in stages where auto-closure is possible:
 *   - contact_attempted → closed_no_response (cadence exhausted + idle)
 *   - retainer_sent → closed_retainer_not_signed (follow-up cadence exhausted + idle)
 *
 * "Idle" = no inbound communication for autoClosureAfterDays business days.
 */
async function processAutoClosureCheck(ctx: TenantContext): Promise<number> {
  const { supabase, tenantId, config, timezone, dateKey, now } = ctx
  let closedCount = 0

  if (config.autoClosureAfterDays <= 0) return 0

  // ── Check contact_attempted leads for auto-closure ──

  const { data: contactAttemptLeads } = await supabase
    .from('leads')
    .select('id, current_stage, last_inbound_at, last_outbound_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('current_stage', LEAD_STAGES.CONTACT_ATTEMPTED)
    .eq('is_closed', false)

  if (contactAttemptLeads) {
    for (const lead of contactAttemptLeads) {
      const closed = await checkAndAutoClose(ctx, lead, {
        targetClosedStage: LEAD_STAGES.CLOSED_NO_RESPONSE,
        reasonCode: 'auto_closure_no_response',
        reasonText: 'Auto-closed: contact cadence exhausted and idle period exceeded',
        cadenceType: 'contact_attempts',
        cadence: config.contactAttemptCadenceDays,
        triggerKey: 'auto_closure_no_response',
      })
      if (closed) closedCount++
    }
  }

  // ── Check retainer_sent leads for auto-closure ──

  const { data: retainerSentLeads } = await supabase
    .from('leads')
    .select('id, current_stage, last_inbound_at, last_outbound_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('current_stage', LEAD_STAGES.RETAINER_SENT)
    .eq('is_closed', false)

  if (retainerSentLeads) {
    for (const lead of retainerSentLeads) {
      const closed = await checkAndAutoClose(ctx, lead, {
        targetClosedStage: LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED,
        reasonCode: 'auto_closure_retainer_not_signed',
        reasonText: 'Auto-closed: retainer follow-up cadence exhausted and idle period exceeded',
        cadenceType: 'retainer_followup',
        cadence: config.retainerFollowupCadenceDays,
        triggerKey: 'auto_closure_retainer_not_signed',
      })
      if (closed) closedCount++
    }
  }

  return closedCount
}

async function checkAndAutoClose(
  ctx: TenantContext,
  lead: {
    id: string
    current_stage: string | null
    last_inbound_at: string | null
    last_outbound_at: string | null
    created_at: string
  },
  params: {
    targetClosedStage: string
    reasonCode: string
    reasonText: string
    cadenceType: string
    cadence: number[]
    triggerKey: string
  }
): Promise<boolean> {
  const { supabase, tenantId, config, timezone, dateKey, now } = ctx

  // Check if this auto-closure automation is enabled
  const enabled = await isAutomationEnabled(supabase, tenantId, params.triggerKey)
  if (!enabled) return false

  // Check if contact attempts are exhausted
  const { count: attemptCount } = await supabase
    .from('lead_communication_events')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', lead.id)
    .eq('counts_as_contact_attempt', true)

  if ((attemptCount ?? 0) < params.cadence.length) return false

  // Check if idle period has been exceeded
  const lastActivity = lead.last_inbound_at ?? lead.last_outbound_at ?? lead.created_at
  const lastActivityDate = new Date(lastActivity)
  const businessDaysSinceActivity = businessDaysBetween(lastActivityDate, now, timezone)

  if (businessDaysSinceActivity < config.autoClosureAfterDays) return false

  // Idempotent auto-closure (one per lead per date)
  const result = await executeIdempotent(supabase, {
    tenantId,
    leadId: lead.id,
    executionType: 'auto_closure',
    executionKey: idempotencyKeys.autoClosure(lead.id, dateKey),
    handler: async () => {
      // Build template context for closure notification
      const baseContext = await buildBaseTemplateContext(supabase, tenantId, lead.id)
      const templateContext: TemplateContext = {
        ...baseContext,
        closure: {
          reason: params.reasonCode,
          stage: params.targetClosedStage,
          idleDays: businessDaysSinceActivity,
        },
      }

      // Resolve closure notification template
      const template = await resolveTemplate(
        supabase, tenantId, params.triggerKey, 'in_app', templateContext
      )

      await closeLead({
        supabase,
        leadId: lead.id,
        tenantId,
        closedStage: params.targetClosedStage as Parameters<typeof closeLead>[0]['closedStage'],
        reasonCode: params.reasonCode,
        reasonText: params.reasonText,
        closedBy: 'system',
      })

      // Log the automation action with template-resolved title
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'lead_auto_closed',
        title: template?.subject ?? `Lead auto-closed: ${params.reasonCode}`,
        description: template?.body ?? params.reasonText,
        entity_type: 'lead',
        entity_id: lead.id,
        user_id: 'system',
        metadata: {
          closed_stage: params.targetClosedStage,
          reason_code: params.reasonCode,
          business_days_idle: businessDaysSinceActivity,
          auto_closure_threshold_days: config.autoClosureAfterDays,
          cadence_type: params.cadenceType,
          cadence_length: params.cadence.length,
          attempt_count: attemptCount,
          template_source: template?.isWorkspaceOverride ? 'workspace' : 'system_default',
        } as unknown as Json,
      })

      // Recalculate summary
      await recalculateLeadSummary(supabase, lead.id, tenantId)
    },
  })

  return result.executed
}
