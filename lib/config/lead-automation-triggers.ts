/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Automation Trigger Registry  -  Declarative Configuration
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized registry of all lead automation triggers. Each trigger defines:
 *   - Which stage(s) it applies to
 *   - Which channels it supports
 *   - Available merge fields for template rendering
 *   - System default templates (subject + body per channel)
 *   - Whether it's system-controlled (cannot be disabled) or workspace-configurable
 *
 * Three-tier resolution:
 *   1. System defaults (from this registry)  -  always present, never editable
 *   2. Workspace settings (from lead_automation_settings)  -  enable/disable, channel control
 *   3. Workspace template overrides (from lead_message_templates)  -  custom message content
 *
 * This registry is the single source of truth for what automations exist.
 * The template engine reads from this registry to resolve system defaults.
 */

import { LEAD_STAGES, type LeadStage } from './lead-workflow-definitions'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MergeFieldDef {
  /** Template placeholder key, e.g., '{{contact.name}}' */
  key: string
  /** Human-readable label for UI display, e.g., 'Contact Full Name' */
  label: string
  /** Sample value for template preview rendering */
  sampleValue: string
}

export interface AutomationTriggerDef {
  /** Unique identifier, e.g., 'consultation_reminder_24h' */
  triggerKey: string
  /** Human-readable label for settings UI */
  label: string
  /** Description shown in settings UI */
  description: string
  /** Categorization for UI grouping */
  category: 'reminder' | 'follow_up' | 'closure' | 'notification' | 'outreach'
  /** Which lead stages this trigger fires in */
  applicableStages: LeadStage[]
  /** Which communication channels this trigger supports */
  supportedChannels: string[]
  /** Context-specific merge fields available for this trigger */
  availableMergeFields: MergeFieldDef[]
  /** System default templates per channel */
  systemDefaultTemplates: Record<string, { subject: string; body: string }>
  /** If true, trigger always runs and cannot be disabled by workspace settings */
  isSystemControlled: boolean
  /** Default enabled state for new workspaces (ignored if isSystemControlled) */
  isEnabledByDefault: boolean
}

// ─── Common Merge Fields ─────────────────────────────────────────────────────

const COMMON_MERGE_FIELDS: MergeFieldDef[] = [
  { key: '{{contact.name}}', label: 'Contact Full Name', sampleValue: 'Jane Smith' },
  { key: '{{contact.email}}', label: 'Contact Email', sampleValue: 'jane@example.com' },
  { key: '{{firm.name}}', label: 'Firm Name', sampleValue: 'Smith & Associates LLP' },
  { key: '{{lead.id}}', label: 'Lead ID', sampleValue: 'LD-00042' },
  { key: '{{lead.stage}}', label: 'Current Stage', sampleValue: 'Consultation Booked' },
]

const CONSULTATION_MERGE_FIELDS: MergeFieldDef[] = [
  { key: '{{consultation.date}}', label: 'Consultation Date', sampleValue: 'March 15, 2026' },
  { key: '{{consultation.time}}', label: 'Consultation Time', sampleValue: '2:00 PM' },
  { key: '{{consultation.type}}', label: 'Consultation Type', sampleValue: 'Initial Consultation' },
  { key: '{{consultation.lawyer}}', label: 'Assigned Lawyer', sampleValue: 'Sarah Johnson' },
]

const FOLLOWUP_MERGE_FIELDS: MergeFieldDef[] = [
  { key: '{{followup.step}}', label: 'Follow-up Step Number', sampleValue: '2' },
  { key: '{{followup.total_steps}}', label: 'Total Follow-up Steps', sampleValue: '4' },
  { key: '{{followup.days_since}}', label: 'Days Since Last Contact', sampleValue: '3' },
]

const CLOSURE_MERGE_FIELDS: MergeFieldDef[] = [
  { key: '{{closure.reason}}', label: 'Closure Reason', sampleValue: 'No response after outreach cadence' },
  { key: '{{closure.stage}}', label: 'Closure Stage', sampleValue: 'Closed  -  No Response' },
  { key: '{{closure.idle_days}}', label: 'Idle Days', sampleValue: '15' },
]

const RETAINER_MERGE_FIELDS: MergeFieldDef[] = [
  { key: '{{retainer.fee}}', label: 'Retainer Fee', sampleValue: '$2,500.00' },
  { key: '{{retainer.type}}', label: 'Retainer Type', sampleValue: 'Full Retainer' },
  { key: '{{retainer.sent_date}}', label: 'Retainer Sent Date', sampleValue: 'March 10, 2026' },
]

// ─── Trigger Registry ────────────────────────────────────────────────────────

export const LEAD_AUTOMATION_TRIGGERS: Record<string, AutomationTriggerDef> = {
  // ── Reminders ──────────────────────────────────────────────────────────────

  consultation_reminder_24h: {
    triggerKey: 'consultation_reminder_24h',
    label: '24-Hour Consultation Reminder',
    description: 'Send a reminder 24 hours before a scheduled consultation',
    category: 'reminder',
    applicableStages: [LEAD_STAGES.CONSULTATION_BOOKED],
    supportedChannels: ['email', 'sms', 'system_reminder'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...CONSULTATION_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Reminder: Your consultation is tomorrow  -  {{consultation.date}}',
        body: 'Hi {{contact.name}},\n\nThis is a reminder that your consultation with {{consultation.lawyer}} is scheduled for {{consultation.date}} at {{consultation.time}}.\n\nIf you need to reschedule, please contact us as soon as possible.\n\nBest regards,\n{{firm.name}}',
      },
      sms: {
        subject: '',
        body: 'Hi {{contact.name}}, reminder: your consultation with {{firm.name}} is tomorrow ({{consultation.date}}) at {{consultation.time}}. Questions? Reply to this message.',
      },
      system_reminder: {
        subject: 'Consultation reminder (24h before)',
        body: 'Upcoming consultation with {{contact.name}} scheduled for {{consultation.date}} at {{consultation.time}}',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  consultation_reminder_2h: {
    triggerKey: 'consultation_reminder_2h',
    label: '2-Hour Consultation Reminder',
    description: 'Send a reminder 2 hours before a scheduled consultation',
    category: 'reminder',
    applicableStages: [LEAD_STAGES.CONSULTATION_BOOKED],
    supportedChannels: ['email', 'sms', 'system_reminder'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...CONSULTATION_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Your consultation is in 2 hours  -  {{consultation.time}}',
        body: 'Hi {{contact.name}},\n\nJust a quick reminder that your consultation with {{consultation.lawyer}} is coming up in 2 hours at {{consultation.time}}.\n\nWe look forward to speaking with you.\n\nBest regards,\n{{firm.name}}',
      },
      sms: {
        subject: '',
        body: 'Hi {{contact.name}}, your consultation with {{firm.name}} is in 2 hours ({{consultation.time}}). See you soon!',
      },
      system_reminder: {
        subject: 'Consultation reminder (2h before)',
        body: 'Consultation with {{contact.name}} starts at {{consultation.time}}  -  2 hours from now',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  // ── Follow-ups ─────────────────────────────────────────────────────────────

  no_show_followup: {
    triggerKey: 'no_show_followup',
    label: 'No-Show Follow-up',
    description: 'Automated follow-up after a consultation no-show, per workspace cadence',
    category: 'follow_up',
    applicableStages: [
      LEAD_STAGES.CONSULTATION_BOOKED,
      LEAD_STAGES.CONSULTATION_COMPLETED,
    ],
    supportedChannels: ['email', 'sms', 'system_reminder'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...CONSULTATION_MERGE_FIELDS, ...FOLLOWUP_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'We missed you  -  reschedule your consultation?',
        body: 'Hi {{contact.name}},\n\nWe noticed you weren\'t able to make your scheduled consultation. We understand things come up.\n\nWe\'d love to help you reschedule. This is follow-up {{followup.step}} of {{followup.total_steps}}.\n\nPlease contact us at your earliest convenience.\n\nBest regards,\n{{firm.name}}',
      },
      sms: {
        subject: '',
        body: 'Hi {{contact.name}}, we missed you at your consultation. Would you like to reschedule? Reply YES or contact {{firm.name}}. (Follow-up {{followup.step}}/{{followup.total_steps}})',
      },
      system_reminder: {
        subject: 'No-show follow-up #{{followup.step}} due',
        body: 'Follow-up #{{followup.step}} is due for consultation no-show  -  {{contact.name}}',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  contact_attempt_reminder: {
    triggerKey: 'contact_attempt_reminder',
    label: 'Contact Attempt Reminder',
    description: 'Remind staff to make the next contact attempt per the outreach cadence',
    category: 'outreach',
    applicableStages: [
      LEAD_STAGES.NEW_INQUIRY,
      LEAD_STAGES.CONTACT_ATTEMPTED,
    ],
    supportedChannels: ['system_reminder', 'in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...FOLLOWUP_MERGE_FIELDS],
    systemDefaultTemplates: {
      system_reminder: {
        subject: 'Contact attempt #{{followup.step}} due for {{contact.name}}',
        body: 'Contact attempt #{{followup.step}} of {{followup.total_steps}} is due. Last contact was {{followup.days_since}} days ago.',
      },
      in_app: {
        subject: 'Contact attempt due',
        body: 'Contact attempt #{{followup.step}} is due for {{contact.name}}',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  retainer_followup: {
    triggerKey: 'retainer_followup',
    label: 'Retainer Follow-up',
    description: 'Follow up with leads who have received but not yet signed a retainer',
    category: 'follow_up',
    applicableStages: [LEAD_STAGES.RETAINER_SENT],
    supportedChannels: ['email', 'sms', 'system_reminder'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...RETAINER_MERGE_FIELDS, ...FOLLOWUP_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Follow-up: Your retainer agreement from {{firm.name}}',
        body: 'Hi {{contact.name}},\n\nWe sent you a retainer agreement on {{retainer.sent_date}} and wanted to check in. If you have any questions about the terms or next steps, we\'re happy to discuss.\n\nThis is follow-up {{followup.step}} of {{followup.total_steps}}.\n\nBest regards,\n{{firm.name}}',
      },
      sms: {
        subject: '',
        body: 'Hi {{contact.name}}, just checking in on the retainer we sent from {{firm.name}}. Any questions? Reply or call us. ({{followup.step}}/{{followup.total_steps}})',
      },
      system_reminder: {
        subject: 'Retainer follow-up #{{followup.step}} due',
        body: 'Retainer follow-up #{{followup.step}} due for {{contact.name}}  -  sent {{retainer.sent_date}}',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  payment_followup: {
    triggerKey: 'payment_followup',
    label: 'Payment Follow-up',
    description: 'Follow up with leads who have signed a retainer but payment is pending',
    category: 'follow_up',
    applicableStages: [LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING],
    supportedChannels: ['email', 'sms', 'system_reminder'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...RETAINER_MERGE_FIELDS, ...FOLLOWUP_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Payment reminder: {{retainer.type}}  -  {{firm.name}}',
        body: 'Hi {{contact.name}},\n\nThank you for signing your retainer agreement. We\'re following up regarding the outstanding payment of {{retainer.fee}}.\n\nPlease arrange payment at your earliest convenience so we can get started on your matter.\n\nBest regards,\n{{firm.name}}',
      },
      sms: {
        subject: '',
        body: 'Hi {{contact.name}}, friendly reminder: retainer payment of {{retainer.fee}} is pending with {{firm.name}}. Please contact us if you have questions.',
      },
      system_reminder: {
        subject: 'Payment follow-up #{{followup.step}} due',
        body: 'Payment follow-up #{{followup.step}} due for {{contact.name}}  -  retainer signed, payment pending',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  // ── Closure ────────────────────────────────────────────────────────────────

  auto_closure_no_response: {
    triggerKey: 'auto_closure_no_response',
    label: 'Auto-Closure: No Response',
    description: 'Notify when a lead is auto-closed after exhausting contact cadence with no response',
    category: 'closure',
    applicableStages: [LEAD_STAGES.CONTACT_ATTEMPTED],
    supportedChannels: ['email', 'in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...CLOSURE_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Your inquiry with {{firm.name}} has been closed',
        body: 'Hi {{contact.name}},\n\nWe\'ve attempted to reach you multiple times regarding your inquiry with {{firm.name}}, but have been unable to connect.\n\nWe\'re closing your file for now. If you\'d like to reopen your inquiry at any time, please don\'t hesitate to contact us.\n\nBest regards,\n{{firm.name}}',
      },
      in_app: {
        subject: 'Lead auto-closed: no response',
        body: 'Lead for {{contact.name}} auto-closed after {{closure.idle_days}} idle days  -  contact cadence exhausted',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  auto_closure_retainer_not_signed: {
    triggerKey: 'auto_closure_retainer_not_signed',
    label: 'Auto-Closure: Retainer Not Signed',
    description: 'Notify when a lead is auto-closed after retainer follow-up cadence exhausted',
    category: 'closure',
    applicableStages: [LEAD_STAGES.RETAINER_SENT],
    supportedChannels: ['email', 'in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS, ...CLOSURE_MERGE_FIELDS, ...RETAINER_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Your retainer with {{firm.name}}  -  file closing notice',
        body: 'Hi {{contact.name}},\n\nWe sent you a retainer agreement on {{retainer.sent_date}} and followed up several times. As we haven\'t received a signed retainer, we\'re closing your file.\n\nIf you\'d like to proceed at a later date, please reach out and we\'ll be happy to assist.\n\nBest regards,\n{{firm.name}}',
      },
      in_app: {
        subject: 'Lead auto-closed: retainer not signed',
        body: 'Lead for {{contact.name}} auto-closed after {{closure.idle_days}} idle days  -  retainer follow-up cadence exhausted',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: true,
  },

  // ── Notifications ──────────────────────────────────────────────────────────

  intake_confirmation: {
    triggerKey: 'intake_confirmation',
    label: 'Intake Confirmation',
    description: 'Send confirmation to the contact after their intake is received',
    category: 'notification',
    applicableStages: [LEAD_STAGES.NEW_INQUIRY],
    supportedChannels: ['email', 'portal_chat'],
    availableMergeFields: [...COMMON_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'We received your inquiry  -  {{firm.name}}',
        body: 'Hi {{contact.name}},\n\nThank you for contacting {{firm.name}}. We\'ve received your inquiry and a member of our team will be in touch shortly.\n\nBest regards,\n{{firm.name}}',
      },
      portal_chat: {
        subject: '',
        body: 'Hi {{contact.name}}, we\'ve received your inquiry and will be in touch shortly. Thank you for contacting {{firm.name}}.',
      },
    },
    isSystemControlled: false,
    isEnabledByDefault: false, // Opt-in  -  firms may prefer manual first contact
  },

  qualification_complete: {
    triggerKey: 'qualification_complete',
    label: 'Qualification Complete',
    description: 'Internal notification when lead qualification decision is recorded',
    category: 'notification',
    applicableStages: [LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE],
    supportedChannels: ['in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS],
    systemDefaultTemplates: {
      in_app: {
        subject: 'Lead qualified',
        body: 'Qualification decision recorded for {{contact.name}}  -  {{lead.stage}}',
      },
    },
    isSystemControlled: true,
    isEnabledByDefault: true,
  },

  conflict_check_result: {
    triggerKey: 'conflict_check_result',
    label: 'Conflict Check Result',
    description: 'Internal notification when a conflict check result is available',
    category: 'notification',
    applicableStages: [
      LEAD_STAGES.NEW_INQUIRY,
      LEAD_STAGES.CONTACT_ATTEMPTED,
      LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE,
    ],
    supportedChannels: ['in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS],
    systemDefaultTemplates: {
      in_app: {
        subject: 'Conflict check complete',
        body: 'Conflict check result available for {{contact.name}}',
      },
    },
    isSystemControlled: true,
    isEnabledByDefault: true,
  },

  stage_transition: {
    triggerKey: 'stage_transition',
    label: 'Stage Transition',
    description: 'Internal notification when a lead advances to a new stage',
    category: 'notification',
    applicableStages: [], // All stages  -  empty means universal
    supportedChannels: ['in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS],
    systemDefaultTemplates: {
      in_app: {
        subject: 'Lead stage changed',
        body: '{{contact.name}} moved to stage: {{lead.stage}}',
      },
    },
    isSystemControlled: true,
    isEnabledByDefault: true,
  },

  conversion_complete: {
    triggerKey: 'conversion_complete',
    label: 'Conversion Complete',
    description: 'Notification when a lead is successfully converted to a matter',
    category: 'notification',
    applicableStages: [LEAD_STAGES.RETAINED_ACTIVE_MATTER],
    supportedChannels: ['email', 'in_app'],
    availableMergeFields: [...COMMON_MERGE_FIELDS],
    systemDefaultTemplates: {
      email: {
        subject: 'Welcome  -  your matter with {{firm.name}} is now active',
        body: 'Hi {{contact.name}},\n\nWe\'re pleased to confirm that your matter with {{firm.name}} is now active. Your assigned team will be in touch with next steps.\n\nBest regards,\n{{firm.name}}',
      },
      in_app: {
        subject: 'Lead converted to matter',
        body: '{{contact.name}}  -  lead successfully converted to active matter',
      },
    },
    isSystemControlled: true,
    isEnabledByDefault: true,
  },
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get all trigger keys grouped by category.
 */
export function getTriggersByCategory(): Record<string, AutomationTriggerDef[]> {
  const grouped: Record<string, AutomationTriggerDef[]> = {}
  for (const trigger of Object.values(LEAD_AUTOMATION_TRIGGERS)) {
    if (!grouped[trigger.category]) {
      grouped[trigger.category] = []
    }
    grouped[trigger.category].push(trigger)
  }
  return grouped
}

/**
 * Get all trigger keys that apply to a specific stage.
 */
export function getTriggersForStage(stage: LeadStage): AutomationTriggerDef[] {
  return Object.values(LEAD_AUTOMATION_TRIGGERS).filter(
    (t) => t.applicableStages.length === 0 || t.applicableStages.includes(stage)
  )
}

/**
 * Get all available merge fields for a trigger (including common fields).
 */
export function getMergeFieldsForTrigger(triggerKey: string): MergeFieldDef[] {
  const trigger = LEAD_AUTOMATION_TRIGGERS[triggerKey]
  if (!trigger) return COMMON_MERGE_FIELDS
  return trigger.availableMergeFields
}

/**
 * Get the system default template for a trigger + channel combination.
 * Returns null if the trigger or channel doesn't exist.
 */
export function getSystemDefaultTemplate(
  triggerKey: string,
  channel: string
): { subject: string; body: string } | null {
  const trigger = LEAD_AUTOMATION_TRIGGERS[triggerKey]
  if (!trigger) return null
  return trigger.systemDefaultTemplates[channel] ?? null
}

/**
 * Check if a trigger is system-controlled (cannot be disabled).
 */
export function isSystemControlledTrigger(triggerKey: string): boolean {
  const trigger = LEAD_AUTOMATION_TRIGGERS[triggerKey]
  return trigger?.isSystemControlled ?? false
}

/**
 * Get all trigger keys.
 */
export function getAllTriggerKeys(): string[] {
  return Object.keys(LEAD_AUTOMATION_TRIGGERS)
}

/**
 * Category labels for UI display.
 */
export const TRIGGER_CATEGORY_LABELS: Record<string, string> = {
  reminder: 'Reminders',
  follow_up: 'Follow-ups',
  closure: 'Auto-Closure',
  notification: 'Notifications',
  outreach: 'Outreach',
}
