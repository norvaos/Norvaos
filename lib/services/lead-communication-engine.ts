/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Communication Event Engine — First-Class Workflow Driver
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Communication events are operational drivers, not mere log entries. They
 * directly drive task completion, contact-attempt logic, and stage transitions.
 *
 * If staff can advance the process without real communication evidence, the
 * model has failed. This engine ensures communication events are the source
 * of truth for outreach and contact attempts.
 *
 * All operations are idempotent via the workflow execution ledger.
 * After any mutation, calls recalculateLeadSummary().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { isContactAttempt, type AutoCompleteTrigger } from '@/lib/config/lead-workflow-definitions'
import { executeIdempotent, idempotencyKeys } from './lead-idempotency'
import { recalculateLeadSummary } from './lead-summary-recalculator'
import { autoCompleteMilestoneTask, findTasksMatchingTrigger } from './lead-milestone-engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LogCommunicationEventParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  leadId: string
  contactId?: string
  channel: 'call' | 'email' | 'sms' | 'portal_chat' | 'system_reminder'
  direction: 'inbound' | 'outbound' | 'system'
  subtype?: string
  occurredAt?: string
  actorUserId?: string
  actorType?: 'user' | 'system' | 'integration' | 'ai'
  deliveryStatus?: string
  readStatus?: string
  subject?: string
  bodyPreview?: string
  metadata?: Record<string, unknown>
  // Thread support
  threadKey?: string
  providerThreadId?: string
  providerMessageId?: string
  inReplyTo?: string
  // Linked task (if the event is directly completing a task)
  linkedTaskId?: string
}

export interface CommunicationEventResult {
  eventId: string
  countsAsContactAttempt: boolean
  tasksAutoCompleted: number
}

// ─── Log Communication Event ─────────────────────────────────────────────────

/**
 * Log a communication event. This is the primary entry point for all
 * communication-driven workflow.
 *
 * 1. Creates the event record
 * 2. Determines if it counts as a contact attempt
 * 3. Auto-completes matching milestone tasks
 * 4. Recalculates lead summary fields
 *
 * Idempotent: duplicate events with the same provider_message_id are skipped.
 */
export async function logCommunicationEvent(
  params: LogCommunicationEventParams
): Promise<CommunicationEventResult> {
  const {
    supabase, tenantId, leadId, contactId, channel, direction, subtype,
    occurredAt, actorUserId, actorType = 'user', deliveryStatus, readStatus,
    subject, bodyPreview, metadata, threadKey, providerThreadId,
    providerMessageId, inReplyTo, linkedTaskId,
  } = params

  const countsAsAttempt = isContactAttempt(channel, direction)

  // Insert the event
  const { data: event, error: insertError } = await supabase
    .from('lead_communication_events')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      contact_id: contactId ?? null,
      channel,
      direction,
      subtype: subtype ?? null,
      occurred_at: occurredAt ?? new Date().toISOString(),
      actor_user_id: actorUserId ?? null,
      actor_type: actorType,
      delivery_status: deliveryStatus ?? null,
      read_status: readStatus ?? null,
      subject: subject ?? null,
      body_preview: bodyPreview ?? null,
      metadata: (metadata ?? null) as Json,
      counts_as_contact_attempt: countsAsAttempt,
      linked_task_id: linkedTaskId ?? null,
      thread_key: threadKey ?? null,
      provider_thread_id: providerThreadId ?? null,
      provider_message_id: providerMessageId ?? null,
      in_reply_to: inReplyTo ?? null,
    })
    .select('id')
    .single()

  if (insertError || !event) {
    throw new Error(`Failed to log communication event: ${insertError?.message}`)
  }

  // Process the event idempotently (auto-complete tasks, etc.)
  let tasksAutoCompleted = 0

  const processResult = await executeIdempotent(supabase, {
    tenantId,
    leadId,
    executionType: 'comm_event_processed',
    executionKey: idempotencyKeys.commEventProcessed(event.id),
    actorUserId,
    handler: async () => {
      // Build trigger for auto-completion matching
      const trigger: AutoCompleteTrigger = {
        event: 'communication_logged',
        channel,
        direction,
        subtype: subtype ?? undefined,
      }

      // Find and auto-complete matching tasks
      const matchingTasks = await findTasksMatchingTrigger(supabase, leadId, tenantId, trigger)

      for (const task of matchingTasks) {
        await autoCompleteMilestoneTask(supabase, {
          taskId: task.id,
          tenantId,
          leadId,
          completionSource: actorType === 'user' ? 'system' : actorType,
          linkedCommunicationEventId: event.id,
          actorUserId,
        })
        tasksAutoCompleted++
      }

      // Log activity for the communication event
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'communication_event',
        title: formatEventTitle(channel, direction, subtype),
        description: subject ?? bodyPreview ?? `${direction} ${channel}`,
        entity_type: 'lead',
        entity_id: leadId,
        user_id: actorUserId ?? 'system',
        metadata: {
          event_id: event.id,
          channel,
          direction,
          subtype,
          counts_as_contact_attempt: countsAsAttempt,
          tasks_auto_completed: tasksAutoCompleted,
        } as unknown as Json,
      })
    },
  })

  // Recalculate summary (regardless of idempotency — event was still inserted)
  const fieldsToRecalc: Array<'last_inbound_at' | 'last_outbound_at' | 'last_automated_action_at' | 'overdue_task_count' | 'next_required_action'> = []
  if (direction === 'inbound') fieldsToRecalc.push('last_inbound_at')
  if (direction === 'outbound') fieldsToRecalc.push('last_outbound_at')
  if (actorType === 'system') fieldsToRecalc.push('last_automated_action_at')
  if (processResult.executed && tasksAutoCompleted > 0) {
    fieldsToRecalc.push('overdue_task_count', 'next_required_action')
  }

  if (fieldsToRecalc.length > 0) {
    await recalculateLeadSummary(supabase, leadId, tenantId, { fields: fieldsToRecalc })
  }

  return {
    eventId: event.id,
    countsAsContactAttempt: countsAsAttempt,
    tasksAutoCompleted,
  }
}

// ─── Contact Attempt Counting ────────────────────────────────────────────────

/**
 * Get the number of contact attempts for a lead.
 */
export async function getContactAttemptCount(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<number> {
  const { count } = await supabase
    .from('lead_communication_events')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('counts_as_contact_attempt', true)

  return count ?? 0
}

/**
 * Check if the contact attempt cadence is exhausted for a lead.
 * Compares the number of contact attempts against the workspace config cadence.
 */
export async function checkCadenceExhausted(
  supabase: SupabaseClient<Database>,
  leadId: string,
  cadenceDays: number[]
): Promise<boolean> {
  const attemptCount = await getContactAttemptCount(supabase, leadId)
  return attemptCount >= cadenceDays.length
}

/**
 * Check if the retainer follow-up cadence is exhausted.
 */
export async function checkRetainerFollowUpExhausted(
  supabase: SupabaseClient<Database>,
  leadId: string,
  cadenceDays: number[]
): Promise<boolean> {
  // Count outbound communications that occurred after retainer was sent
  const { data: retainer } = await supabase
    .from('lead_retainer_packages')
    .select('sent_at')
    .eq('lead_id', leadId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!retainer?.sent_at) return false

  const { count } = await supabase
    .from('lead_communication_events')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('direction', 'outbound')
    .gte('occurred_at', retainer.sent_at)

  return (count ?? 0) >= cadenceDays.length
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventTitle(channel: string, direction: string, subtype?: string): string {
  const channelLabel = {
    call: 'Call',
    email: 'Email',
    sms: 'SMS',
    portal_chat: 'Portal Message',
    system_reminder: 'System Reminder',
  }[channel] ?? channel

  const directionLabel = {
    inbound: 'Inbound',
    outbound: 'Outbound',
    system: 'System',
  }[direction] ?? direction

  const subtypeLabel = subtype ? ` (${subtype.replace(/_/g, ' ')})` : ''

  return `${directionLabel} ${channelLabel}${subtypeLabel}`
}
