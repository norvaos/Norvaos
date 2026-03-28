/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Pipeline Event Triggers — NorvaOS Standard 7-Stage Auto-Move Registry
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Declarative configuration for event-driven stage advancement in the
 * NorvaOS Standard 7-stage sovereign pipeline.
 *
 * When a system event fires, the pipeline engine checks this registry
 * to determine whether the lead should auto-advance to the next stage.
 *
 * ┌──────────────────────────────┬──────────────────┬──────────────────────┐
 * │ Event                        │ From Stage       │ To Stage             │
 * ├──────────────────────────────┼──────────────────┼──────────────────────┤
 * │ incoming_lead                │ (new)            │ 1. Inquiry           │
 * │ outbound_comm_logged         │ 1. Inquiry       │ 2. Contacted         │
 * │ calendar_invite_sent         │ 2. Contacted     │ 3. Meeting Set       │
 * │ document_signature_received  │ 5. Retainer Sent │ 6. Payment Pending   │
 * │ stripe_payment_success       │ 6. Payment Pend. │ 7. Won / Onboarded   │
 * └──────────────────────────────┴──────────────────┴──────────────────────┘
 *
 * Stage 4 (Strategy Held) is a decision junction — no auto-advance.
 * The "Smart Pause" NurtureControl component handles re-entry manually.
 *
 * Stage 5 (Retainer Sent) requires manual advance from Stage 4 by the
 * responsible lawyer after the strategy meeting decision.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PipelineEventType =
  | 'incoming_lead'
  | 'outbound_comm_logged'
  | 'calendar_invite_sent'
  | 'meeting_completed'
  | 'retainer_sent'
  | 'document_signature_received'
  | 'stripe_payment_success'
  | 'snooze_expired'

export interface PipelineEventTrigger {
  /** Unique event key */
  eventType: PipelineEventType
  /** Human-readable label */
  label: string
  /** Description shown in settings / audit log */
  description: string
  /** Stage the lead must currently be in (by name) for this trigger to fire */
  fromStageName: string | null
  /** Stage the lead will advance to (by name) */
  toStageName: string
  /** Additional side effects to execute after the stage move */
  sideEffects: PipelineSideEffect[]
  /** Whether this trigger is active by default */
  isActive: boolean
  /** Whether this trigger can be disabled by workspace settings */
  isSystemControlled: boolean
}

export type PipelineSideEffect =
  | { type: 'create_matter' }
  | { type: 'send_notification'; template: string }
  | { type: 'log_activity'; activityType: string; description: string }
  | { type: 'update_field'; field: string; value: string | boolean | null }

// ─── Trigger Registry ────────────────────────────────────────────────────────

export const PIPELINE_EVENT_TRIGGERS: Record<string, PipelineEventTrigger> = {
  // ── Stage 1: Inquiry (auto-create on intake) ──────────────────────────────
  incoming_lead: {
    eventType: 'incoming_lead',
    label: 'Incoming Lead → Inquiry',
    description: 'Automatically place new leads in Stage 1 (Inquiry) when created via intake form, API, or manual entry.',
    fromStageName: null, // New lead — no prior stage
    toStageName: 'Inquiry',
    sideEffects: [
      { type: 'log_activity', activityType: 'lead_created', description: 'Lead created and placed in Inquiry stage' },
      { type: 'send_notification', template: 'intake_confirmation' },
    ],
    isActive: true,
    isSystemControlled: true,
  },

  // ── Stage 2: Contacted (first outbound contact) ───────────────────────────
  outbound_comm_logged: {
    eventType: 'outbound_comm_logged',
    label: 'Outbound Contact → Contacted',
    description: 'Auto-advance from Inquiry to Contacted when the first outbound communication (call, email, or SMS) is logged.',
    fromStageName: 'Inquiry',
    toStageName: 'Contacted',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Auto-advanced to Contacted after first outbound communication' },
    ],
    isActive: true,
    isSystemControlled: false,
  },

  // ── Stage 3: Meeting Set (calendar invite sent) ───────────────────────────
  calendar_invite_sent: {
    eventType: 'calendar_invite_sent',
    label: 'Calendar Invite → Meeting Set',
    description: 'Auto-advance from Contacted to Meeting Set when a calendar invite is sent for a strategy meeting.',
    fromStageName: 'Contacted',
    toStageName: 'Meeting Set',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Auto-advanced to Meeting Set after calendar invite sent' },
      { type: 'update_field', field: 'consultation_status', value: 'scheduled' },
    ],
    isActive: true,
    isSystemControlled: false,
  },

  // ── Stage 4: Strategy Held (meeting completed) ────────────────────────────
  // NOTE: This is a MANUAL decision junction. The "Smart Pause" NurtureControl
  // component lives here. No auto-advance beyond this point.
  meeting_completed: {
    eventType: 'meeting_completed',
    label: 'Meeting Completed → Strategy Held',
    description: 'Auto-advance from Meeting Set to Strategy Held when the strategy meeting is marked as completed.',
    fromStageName: 'Meeting Set',
    toStageName: 'Strategy Held',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Auto-advanced to Strategy Held after meeting completed' },
      { type: 'update_field', field: 'consultation_status', value: 'completed' },
    ],
    isActive: true,
    isSystemControlled: false,
  },

  // ── Stage 5: Retainer Sent (manual — from Stage 4 decision) ───────────────
  // No auto-trigger. The responsible lawyer manually advances after strategy
  // decision. This preserves the "decision junction" design of Stage 4.
  retainer_sent: {
    eventType: 'retainer_sent',
    label: 'Retainer Sent → Retainer Sent Stage',
    description: 'Advance from Strategy Held to Retainer Sent when a retainer agreement is dispatched via DocuSign or PandaDoc.',
    fromStageName: 'Strategy Held',
    toStageName: 'Retainer Sent',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Advanced to Retainer Sent after retainer dispatched' },
      { type: 'update_field', field: 'retainer_status', value: 'sent' },
    ],
    isActive: true,
    isSystemControlled: false,
  },

  // ── Stage 6: Payment Pending (document signed) ────────────────────────────
  document_signature_received: {
    eventType: 'document_signature_received',
    label: 'Signature Received → Payment Pending',
    description: 'Auto-advance from Retainer Sent to Payment Pending when the retainer agreement is signed.',
    fromStageName: 'Retainer Sent',
    toStageName: 'Payment Pending',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Auto-advanced to Payment Pending after retainer signed' },
      { type: 'update_field', field: 'retainer_status', value: 'signed' },
    ],
    isActive: true,
    isSystemControlled: false,
  },

  // ── Stage 7: Won / Onboarded (payment received) ──────────────────────────
  stripe_payment_success: {
    eventType: 'stripe_payment_success',
    label: 'Payment Received → Won / Onboarded',
    description: 'Auto-advance from Payment Pending to Won / Onboarded when Stripe confirms payment. Triggers matter creation.',
    fromStageName: 'Payment Pending',
    toStageName: 'Won / Onboarded',
    sideEffects: [
      { type: 'log_activity', activityType: 'stage_auto_advanced', description: 'Auto-advanced to Won / Onboarded after payment received' },
      { type: 'update_field', field: 'payment_status', value: 'paid' },
      { type: 'create_matter' },
      { type: 'send_notification', template: 'conversion_complete' },
    ],
    isActive: true,
    isSystemControlled: true,
  },

  // ── Snooze Expiry (Smart Pause re-entry) ──────────────────────────────────
  snooze_expired: {
    eventType: 'snooze_expired',
    label: 'Snooze Expired → Radar Alert',
    description: 'When a snoozed lead\'s pause expires, surface it on the Principal\'s Radar with Emerald Pulse. No stage change.',
    fromStageName: 'Strategy Held',
    toStageName: 'Strategy Held', // No stage change — just visibility
    sideEffects: [
      { type: 'update_field', field: 'visibility_status', value: 'visible' },
      { type: 'log_activity', activityType: 'snooze_expired', description: 'Smart Pause expired — lead surfaced on Principal\'s Radar' },
      { type: 'send_notification', template: 'snooze_expired_alert' },
    ],
    isActive: true,
    isSystemControlled: true,
  },
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get the trigger config for a given event type.
 */
export function getTriggerForEvent(eventType: PipelineEventType): PipelineEventTrigger | null {
  return PIPELINE_EVENT_TRIGGERS[eventType] ?? null
}

/**
 * Check if a lead in the given stage should auto-advance for the given event.
 */
export function shouldAutoAdvance(
  eventType: PipelineEventType,
  currentStageName: string | null
): { advance: boolean; toStageName: string | null } {
  const trigger = PIPELINE_EVENT_TRIGGERS[eventType]
  if (!trigger || !trigger.isActive) {
    return { advance: false, toStageName: null }
  }

  // For incoming_lead, there's no prior stage requirement
  if (trigger.fromStageName === null) {
    return { advance: true, toStageName: trigger.toStageName }
  }

  // Check current stage matches the required "from" stage
  if (currentStageName === trigger.fromStageName) {
    return { advance: true, toStageName: trigger.toStageName }
  }

  return { advance: false, toStageName: null }
}

/**
 * Get all triggers, grouped by their source stage.
 */
export function getTriggersByFromStage(): Record<string, PipelineEventTrigger[]> {
  const grouped: Record<string, PipelineEventTrigger[]> = {}
  for (const trigger of Object.values(PIPELINE_EVENT_TRIGGERS)) {
    const key = trigger.fromStageName ?? '(new)'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(trigger)
  }
  return grouped
}

/**
 * Get the display-ready pipeline flow for UI rendering.
 */
export const PIPELINE_STAGES_DISPLAY = [
  { order: 1, name: 'Inquiry',          color: '#3b82f6', eventTrigger: 'incoming_lead' },
  { order: 2, name: 'Contacted',        color: '#6366f1', eventTrigger: 'outbound_comm_logged' },
  { order: 3, name: 'Meeting Set',      color: '#8b5cf6', eventTrigger: 'calendar_invite_sent' },
  { order: 4, name: 'Strategy Held',    color: '#f59e0b', eventTrigger: 'meeting_completed',     isDecisionJunction: true },
  { order: 5, name: 'Retainer Sent',    color: '#f97316', eventTrigger: 'retainer_sent' },
  { order: 6, name: 'Payment Pending',  color: '#eab308', eventTrigger: 'document_signature_received' },
  { order: 7, name: 'Won / Onboarded',  color: '#10b981', eventTrigger: 'stripe_payment_success', isWinStage: true },
] as const
