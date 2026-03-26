/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Workflow Definition Registry — Authoritative Workflow Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized, declarative, testable definitions for the lead intake pipeline.
 * All milestone logic, transition rules, auto-complete behaviour, and task
 * definitions live HERE — not scattered across services.
 *
 * Services read from this registry. They do not define workflow behaviour.
 *
 * Future: workspace-level overrides merge on top of these defaults.
 */

// ─── Stage Enum ──────────────────────────────────────────────────────────────

export const LEAD_STAGES = {
  NEW_INQUIRY: 'new_inquiry',
  CONTACT_ATTEMPTED: 'contact_attempted',
  CONTACTED_QUALIFICATION_COMPLETE: 'contacted_qualification_complete',
  CONSULTATION_BOOKED: 'consultation_booked',
  CONSULTATION_COMPLETED: 'consultation_completed',
  RETAINER_SENT: 'retainer_sent',
  RETAINER_SIGNED_PAYMENT_PENDING: 'retainer_signed_payment_pending',
  RETAINED_ACTIVE_MATTER: 'retained_active_matter',
  CONVERTED: 'converted',
  CLOSED_NO_RESPONSE: 'closed_no_response',
  CLOSED_RETAINER_NOT_SIGNED: 'closed_retainer_not_signed',
  CLOSED_CLIENT_DECLINED: 'closed_client_declined',
  CLOSED_NOT_A_FIT: 'closed_not_a_fit',
} as const

export type LeadStage = (typeof LEAD_STAGES)[keyof typeof LEAD_STAGES]

/** All active (non-closed) stages in pipeline order */
export const ACTIVE_STAGES: LeadStage[] = [
  LEAD_STAGES.NEW_INQUIRY,
  LEAD_STAGES.CONTACT_ATTEMPTED,
  LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE,
  LEAD_STAGES.CONSULTATION_BOOKED,
  LEAD_STAGES.CONSULTATION_COMPLETED,
  LEAD_STAGES.RETAINER_SENT,
  LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING,
  LEAD_STAGES.RETAINED_ACTIVE_MATTER,
]

/** All closed (terminal) stages */
export const CLOSED_STAGES: LeadStage[] = [
  LEAD_STAGES.CLOSED_NO_RESPONSE,
  LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED,
  LEAD_STAGES.CLOSED_CLIENT_DECLINED,
  LEAD_STAGES.CLOSED_NOT_A_FIT,
]

export function isClosedStage(stage: string): boolean {
  return CLOSED_STAGES.includes(stage as LeadStage)
}

/** All terminal stages (no forward transitions — includes closed + converted) */
export const TERMINAL_STAGES: LeadStage[] = [
  ...CLOSED_STAGES,
  LEAD_STAGES.CONVERTED,
]

export function isTerminalStage(stage: string): boolean {
  return TERMINAL_STAGES.includes(stage as LeadStage)
}

/** Human-readable stage labels */
export const STAGE_LABELS: Record<LeadStage, string> = {
  [LEAD_STAGES.NEW_INQUIRY]: 'New Inquiry',
  [LEAD_STAGES.CONTACT_ATTEMPTED]: 'Contact Attempted',
  [LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE]: 'Contacted – Qualification Complete',
  [LEAD_STAGES.CONSULTATION_BOOKED]: 'Consultation Booked',
  [LEAD_STAGES.CONSULTATION_COMPLETED]: 'Consultation Completed',
  [LEAD_STAGES.RETAINER_SENT]: 'Retainer Sent',
  [LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING]: 'Retainer Signed – Payment Pending',
  [LEAD_STAGES.RETAINED_ACTIVE_MATTER]: 'Retained – Active Matter',
  [LEAD_STAGES.CONVERTED]: 'Converted to Matter',
  [LEAD_STAGES.CLOSED_NO_RESPONSE]: 'Closed – No Response',
  [LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED]: 'Closed – Retainer Not Signed',
  [LEAD_STAGES.CLOSED_CLIENT_DECLINED]: 'Closed – Client Declined',
  [LEAD_STAGES.CLOSED_NOT_A_FIT]: 'Closed – Not a Fit',
}

// ─── Milestone Group Types ───────────────────────────────────────────────────

export const MILESTONE_GROUP_TYPES = {
  INITIAL_INTAKE: 'initial_intake',
  CONTACT_ATTEMPTS: 'contact_attempts',
  QUALIFICATION: 'qualification',
  CONSULTATION_PREPARATION: 'consultation_preparation',
  CONSULTATION_OUTCOME: 'consultation_outcome',
  RETAINER_DELIVERY: 'retainer_delivery',
  RETAINER_SIGNATURE_FOLLOWUP: 'retainer_signature_followup',
  PAYMENT_FOLLOWUP: 'payment_followup',
  RETENTION_COMPLETION: 'retention_completion',
  NO_SHOW_RECOVERY: 'no_show_recovery',
  CLOSURE_NO_RESPONSE: 'closure_no_response',
  CLOSURE_RETAINER_NOT_SIGNED: 'closure_retainer_not_signed',
  CLOSURE_CLIENT_DECLINED: 'closure_client_declined',
  CLOSURE_NOT_A_FIT: 'closure_not_a_fit',
} as const

export type MilestoneGroupType = (typeof MILESTONE_GROUP_TYPES)[keyof typeof MILESTONE_GROUP_TYPES]

// ─── Auto-Complete Trigger Types ─────────────────────────────────────────────

export interface AutoCompleteTrigger {
  /** The event type that triggers auto-completion */
  event: 'communication_logged' | 'consultation_updated' | 'retainer_updated' | 'payment_received' | 'qualification_decided' | 'conflict_resolved' | 'document_uploaded'
  /** Optional channel filter (for communication events) */
  channel?: string
  /** Optional direction filter (for communication events) */
  direction?: 'inbound' | 'outbound' | 'system'
  /** Optional subtype filter */
  subtype?: string
  /** Optional status filter (for consultation/retainer updates) */
  status?: string
}

// ─── Task Definitions ────────────────────────────────────────────────────────

export interface MilestoneTaskDef {
  taskType: string
  title: string
  sortOrder: number
  /** If set, task auto-completes when this trigger fires */
  autoCompleteOn?: AutoCompleteTrigger
  /** Business days from group creation to due date */
  dueDaysOffset?: number
  /** References workspace config key for dynamic cadence-based due dates */
  cadenceConfigKey?: string
  /** Which role should own this task */
  ownerRole?: 'assigned_intake_staff' | 'responsible_lawyer'
}

export interface MilestoneGroupDef {
  groupType: MilestoneGroupType
  title: string
  sortOrder: number
  tasks: MilestoneTaskDef[]
}

// ─── Stage → Milestone Group Definitions ─────────────────────────────────────

export const STAGE_MILESTONE_DEFINITIONS: Partial<Record<LeadStage, MilestoneGroupDef[]>> = {
  [LEAD_STAGES.NEW_INQUIRY]: [
    {
      groupType: MILESTONE_GROUP_TYPES.INITIAL_INTAKE,
      title: 'Initial Intake',
      sortOrder: 1,
      tasks: [
        {
          taskType: 'review_intake_form',
          title: 'Review intake submission',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'ai_analysis',
          title: 'AI intake analysis',
          sortOrder: 2,
          autoCompleteOn: { event: 'communication_logged', subtype: 'ai_analysis_complete' },
        },
        {
          taskType: 'assign_practice_area',
          title: 'Assign practice area',
          sortOrder: 3,
          dueDaysOffset: 1,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'run_conflict_check',
          title: 'Run conflict check',
          sortOrder: 4,
          dueDaysOffset: 1,
          autoCompleteOn: { event: 'conflict_resolved' },
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'assign_intake_staff',
          title: 'Assign intake staff',
          sortOrder: 5,
          dueDaysOffset: 0,
        },
        {
          taskType: 'first_outbound_contact',
          title: 'Make first contact attempt',
          sortOrder: 6,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
      ],
    },
  ],

  [LEAD_STAGES.CONTACT_ATTEMPTED]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CONTACT_ATTEMPTS,
      title: 'Contact Attempts',
      sortOrder: 2,
      tasks: [
        {
          taskType: 'contact_attempt_1',
          title: 'Contact attempt #1',
          sortOrder: 1,
          cadenceConfigKey: 'contact_attempt_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'contact_attempt_2',
          title: 'Contact attempt #2',
          sortOrder: 2,
          cadenceConfigKey: 'contact_attempt_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'contact_attempt_3',
          title: 'Contact attempt #3',
          sortOrder: 3,
          cadenceConfigKey: 'contact_attempt_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'contact_attempt_4',
          title: 'Contact attempt #4 (final)',
          sortOrder: 4,
          cadenceConfigKey: 'contact_attempt_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
      ],
    },
  ],

  [LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE]: [
    {
      groupType: MILESTONE_GROUP_TYPES.QUALIFICATION,
      title: 'Qualification',
      sortOrder: 3,
      tasks: [
        {
          taskType: 'complete_qualification',
          title: 'Complete qualification assessment',
          sortOrder: 1,
          dueDaysOffset: 1,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'qualification_decided' },
        },
        {
          taskType: 'conflict_check_cleared',
          title: 'Conflict check cleared',
          sortOrder: 2,
          autoCompleteOn: { event: 'conflict_resolved' },
        },
        {
          taskType: 'lawyer_review',
          title: 'Lawyer review (if required)',
          sortOrder: 3,
          ownerRole: 'responsible_lawyer',
          autoCompleteOn: { event: 'qualification_decided', status: 'qualified' },
        },
      ],
    },
  ],

  [LEAD_STAGES.CONSULTATION_BOOKED]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CONSULTATION_PREPARATION,
      title: 'Consultation Preparation',
      sortOrder: 4,
      tasks: [
        {
          taskType: 'send_consultation_invite',
          title: 'Send consultation invite',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', subtype: 'consultation_invite' },
        },
        {
          taskType: 'send_consultation_reminder',
          title: 'Send consultation reminder',
          sortOrder: 2,
          autoCompleteOn: { event: 'communication_logged', subtype: 'consultation_reminder' },
        },
        {
          taskType: 'prepare_consultation_notes',
          title: 'Prepare consultation brief',
          sortOrder: 3,
          dueDaysOffset: 0,
          ownerRole: 'responsible_lawyer',
        },
        {
          taskType: 'collect_consultation_fee',
          title: 'Collect consultation fee (if required)',
          sortOrder: 4,
          autoCompleteOn: { event: 'payment_received' },
        },
      ],
    },
  ],

  [LEAD_STAGES.CONSULTATION_COMPLETED]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CONSULTATION_OUTCOME,
      title: 'Consultation Outcome',
      sortOrder: 5,
      tasks: [
        {
          taskType: 'record_consultation_outcome',
          title: 'Record consultation outcome',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'responsible_lawyer',
          autoCompleteOn: { event: 'consultation_updated', status: 'completed' },
        },
        {
          taskType: 'save_consultation_notes',
          title: 'Save consultation notes',
          sortOrder: 2,
          dueDaysOffset: 0,
          ownerRole: 'responsible_lawyer',
        },
        {
          taskType: 'send_consultation_summary',
          title: 'Send consultation summary to client',
          sortOrder: 3,
          dueDaysOffset: 1,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', subtype: 'consultation_summary' },
        },
      ],
    },
  ],

  [LEAD_STAGES.RETAINER_SENT]: [
    {
      groupType: MILESTONE_GROUP_TYPES.RETAINER_DELIVERY,
      title: 'Retainer Delivery',
      sortOrder: 6,
      tasks: [
        {
          taskType: 'prepare_retainer',
          title: 'Prepare retainer package',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'send_retainer',
          title: 'Send retainer to client',
          sortOrder: 2,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'retainer_updated', status: 'sent' },
        },
        {
          taskType: 'confirm_retainer_receipt',
          title: 'Confirm client received retainer',
          sortOrder: 3,
          dueDaysOffset: 1,
          autoCompleteOn: { event: 'communication_logged', direction: 'inbound' },
        },
      ],
    },
    {
      groupType: MILESTONE_GROUP_TYPES.RETAINER_SIGNATURE_FOLLOWUP,
      title: 'Retainer Signature Follow-Up',
      sortOrder: 7,
      tasks: [
        {
          taskType: 'retainer_followup_1',
          title: 'Retainer follow-up #1',
          sortOrder: 1,
          cadenceConfigKey: 'retainer_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'retainer_followup_2',
          title: 'Retainer follow-up #2',
          sortOrder: 2,
          cadenceConfigKey: 'retainer_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'retainer_followup_3',
          title: 'Retainer follow-up #3',
          sortOrder: 3,
          cadenceConfigKey: 'retainer_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'retainer_followup_4',
          title: 'Retainer follow-up #4 (final)',
          sortOrder: 4,
          cadenceConfigKey: 'retainer_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'retainer_signature_received',
          title: 'Retainer signature received',
          sortOrder: 5,
          autoCompleteOn: { event: 'retainer_updated', status: 'signed' },
        },
      ],
    },
  ],

  [LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING]: [
    {
      groupType: MILESTONE_GROUP_TYPES.PAYMENT_FOLLOWUP,
      title: 'Payment Follow-Up',
      sortOrder: 8,
      tasks: [
        {
          taskType: 'send_payment_request',
          title: 'Send payment request',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', subtype: 'payment_request' },
        },
        {
          taskType: 'payment_followup_1',
          title: 'Payment follow-up #1',
          sortOrder: 2,
          cadenceConfigKey: 'payment_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'payment_followup_2',
          title: 'Payment follow-up #2',
          sortOrder: 3,
          cadenceConfigKey: 'payment_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'payment_followup_3',
          title: 'Payment follow-up #3 (final)',
          sortOrder: 4,
          cadenceConfigKey: 'payment_followup_cadence_days',
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
        },
        {
          taskType: 'payment_received',
          title: 'Payment received',
          sortOrder: 5,
          autoCompleteOn: { event: 'payment_received' },
        },
      ],
    },
  ],

  [LEAD_STAGES.RETAINED_ACTIVE_MATTER]: [
    {
      groupType: MILESTONE_GROUP_TYPES.RETENTION_COMPLETION,
      title: 'Retention Completion',
      sortOrder: 9,
      tasks: [
        {
          taskType: 'create_matter',
          title: 'Create active matter',
          sortOrder: 1,
          dueDaysOffset: 0,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'verify_id',
          title: 'Verify client identity (if required)',
          sortOrder: 2,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'complete_onboarding',
          title: 'Complete client onboarding',
          sortOrder: 3,
          dueDaysOffset: 2,
          ownerRole: 'assigned_intake_staff',
        },
        {
          taskType: 'send_welcome_package',
          title: 'Send welcome package',
          sortOrder: 4,
          dueDaysOffset: 1,
          ownerRole: 'assigned_intake_staff',
          autoCompleteOn: { event: 'communication_logged', subtype: 'welcome_package' },
        },
      ],
    },
  ],

  // ─── Closure Stage Milestone Groups ──────────────────────────────────────

  [LEAD_STAGES.CLOSED_NO_RESPONSE]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CLOSURE_NO_RESPONSE,
      title: 'No Response Closure',
      sortOrder: 10,
      tasks: [
        {
          taskType: 'send_closure_notice',
          title: 'Send closure notice',
          sortOrder: 1,
          dueDaysOffset: 0,
          autoCompleteOn: { event: 'communication_logged', subtype: 'closure_notice' },
        },
        {
          taskType: 'record_closure_reason',
          title: 'Record closure reason',
          sortOrder: 2,
          dueDaysOffset: 0,
        },
      ],
    },
  ],

  [LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CLOSURE_RETAINER_NOT_SIGNED,
      title: 'Retainer Not Signed Closure',
      sortOrder: 10,
      tasks: [
        {
          taskType: 'send_closure_notice',
          title: 'Send closure notice',
          sortOrder: 1,
          dueDaysOffset: 0,
          autoCompleteOn: { event: 'communication_logged', subtype: 'closure_notice' },
        },
        {
          taskType: 'record_closure_reason',
          title: 'Record closure reason',
          sortOrder: 2,
          dueDaysOffset: 0,
        },
      ],
    },
  ],

  [LEAD_STAGES.CLOSED_CLIENT_DECLINED]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CLOSURE_CLIENT_DECLINED,
      title: 'Client Declined Closure',
      sortOrder: 10,
      tasks: [
        {
          taskType: 'send_closure_notice',
          title: 'Send courtesy close message',
          sortOrder: 1,
          dueDaysOffset: 0,
          autoCompleteOn: { event: 'communication_logged', subtype: 'closure_notice' },
        },
        {
          taskType: 'record_closure_reason',
          title: 'Record closure reason',
          sortOrder: 2,
          dueDaysOffset: 0,
        },
      ],
    },
  ],

  [LEAD_STAGES.CLOSED_NOT_A_FIT]: [
    {
      groupType: MILESTONE_GROUP_TYPES.CLOSURE_NOT_A_FIT,
      title: 'Not a Fit Closure',
      sortOrder: 10,
      tasks: [
        {
          taskType: 'send_closure_notice',
          title: 'Send referral/closure message',
          sortOrder: 1,
          dueDaysOffset: 0,
          autoCompleteOn: { event: 'communication_logged', subtype: 'closure_notice' },
        },
        {
          taskType: 'record_closure_reason',
          title: 'Record closure reason',
          sortOrder: 2,
          dueDaysOffset: 0,
        },
      ],
    },
  ],
}

// ─── No-Show Recovery (triggered in-stage, not on stage entry) ───────────────

export const NO_SHOW_RECOVERY_GROUP: MilestoneGroupDef = {
  groupType: MILESTONE_GROUP_TYPES.NO_SHOW_RECOVERY,
  title: 'No-Show Recovery',
  sortOrder: 99,
  tasks: [
    {
      taskType: 'no_show_followup_1',
      title: 'No-show follow-up #1',
      sortOrder: 1,
      cadenceConfigKey: 'no_show_cadence_days',
      ownerRole: 'assigned_intake_staff',
      autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
    },
    {
      taskType: 'no_show_followup_2',
      title: 'No-show follow-up #2',
      sortOrder: 2,
      cadenceConfigKey: 'no_show_cadence_days',
      ownerRole: 'assigned_intake_staff',
      autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
    },
    {
      taskType: 'no_show_followup_3',
      title: 'No-show follow-up #3 (final)',
      sortOrder: 3,
      cadenceConfigKey: 'no_show_cadence_days',
      ownerRole: 'assigned_intake_staff',
      autoCompleteOn: { event: 'communication_logged', direction: 'outbound' },
    },
    {
      taskType: 'reschedule_consultation',
      title: 'Reschedule consultation',
      sortOrder: 4,
      autoCompleteOn: { event: 'consultation_updated', status: 'booked' },
    },
  ],
}

// ─── Transition Rules ────────────────────────────────────────────────────────

export interface TransitionGuard {
  /** Machine-readable guard type */
  type:
    | 'first_outbound_communication'
    | 'contact_made_and_qualification_complete'
    | 'qualification_complete'
    | 'consultation_booked'
    | 'not_qualified'
    | 'consultation_completed'
    | 'consultation_outcome_send_retainer'
    | 'consultation_outcome_client_declined'
    | 'consultation_outcome_not_a_fit'
    | 'retainer_sent'
    | 'retainer_signed'
    | 'retainer_signed_and_paid'
    | 'payment_received'
    | 'all_conversion_gates_pass'
    | 'cadence_exhausted'
    | 'closure_record_required'
  /** Human-readable description */
  description: string
}

export interface TransitionRule {
  toStage: LeadStage
  guards: TransitionGuard[]
  /** If true, system can trigger this transition automatically (not just user-initiated) */
  autoTransition: boolean
}

export const STAGE_TRANSITION_RULES: Record<LeadStage, TransitionRule[]> = {
  [LEAD_STAGES.NEW_INQUIRY]: [
    {
      toStage: LEAD_STAGES.CONTACT_ATTEMPTED,
      guards: [
        { type: 'first_outbound_communication', description: 'At least one outbound communication must be logged' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE,
      guards: [
        { type: 'contact_made_and_qualification_complete', description: 'Contact made and qualification completed in same interaction' },
      ],
      autoTransition: false,
    },
    {
      toStage: LEAD_STAGES.CLOSED_NOT_A_FIT,
      guards: [{ type: 'closure_record_required', description: 'Closure reason must be provided' }],
      autoTransition: false,
    },
  ],

  [LEAD_STAGES.CONTACT_ATTEMPTED]: [
    {
      toStage: LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE,
      guards: [
        { type: 'qualification_complete', description: 'Qualification assessment must be complete' },
      ],
      autoTransition: false,
    },
    {
      toStage: LEAD_STAGES.CLOSED_NO_RESPONSE,
      guards: [
        { type: 'cadence_exhausted', description: 'All contact attempts exhausted without response' },
        { type: 'closure_record_required', description: 'Closure reason must be provided' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CLOSED_NOT_A_FIT,
      guards: [{ type: 'closure_record_required', description: 'Closure reason must be provided' }],
      autoTransition: false,
    },
  ],

  [LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE]: [
    {
      toStage: LEAD_STAGES.CONSULTATION_BOOKED,
      guards: [
        { type: 'consultation_booked', description: 'Consultation must be scheduled' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CLOSED_NOT_A_FIT,
      guards: [
        { type: 'not_qualified', description: 'Lead must be marked as not qualified' },
        { type: 'closure_record_required', description: 'Closure reason must be provided' },
      ],
      autoTransition: false,
    },
  ],

  [LEAD_STAGES.CONSULTATION_BOOKED]: [
    {
      toStage: LEAD_STAGES.CONSULTATION_COMPLETED,
      guards: [
        { type: 'consultation_completed', description: 'Consultation attendance must be marked as completed' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CLOSED_CLIENT_DECLINED,
      guards: [{ type: 'closure_record_required', description: 'Closure reason must be provided' }],
      autoTransition: false,
    },
  ],

  [LEAD_STAGES.CONSULTATION_COMPLETED]: [
    {
      toStage: LEAD_STAGES.RETAINER_SENT,
      guards: [
        { type: 'consultation_outcome_send_retainer', description: 'Consultation outcome must be "Send Retainer"' },
        { type: 'retainer_sent', description: 'Retainer package must be sent to client' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CLOSED_CLIENT_DECLINED,
      guards: [
        { type: 'consultation_outcome_client_declined', description: 'Consultation outcome must be "Client Declined"' },
        { type: 'closure_record_required', description: 'Closure reason must be provided' },
      ],
      autoTransition: false,
    },
    {
      toStage: LEAD_STAGES.CLOSED_NOT_A_FIT,
      guards: [
        { type: 'consultation_outcome_not_a_fit', description: 'Consultation outcome must be "Not a Fit"' },
        { type: 'closure_record_required', description: 'Closure reason must be provided' },
      ],
      autoTransition: false,
    },
  ],

  [LEAD_STAGES.RETAINER_SENT]: [
    {
      toStage: LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING,
      guards: [
        { type: 'retainer_signed', description: 'Retainer must be signed by client' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.RETAINED_ACTIVE_MATTER,
      guards: [
        { type: 'retainer_signed_and_paid', description: 'Retainer must be signed and payment received' },
        { type: 'all_conversion_gates_pass', description: 'All legal/compliance gates must be satisfied' },
      ],
      autoTransition: true,
    },
    {
      toStage: LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED,
      guards: [
        { type: 'cadence_exhausted', description: 'All retainer follow-up attempts exhausted' },
        { type: 'closure_record_required', description: 'Closure reason must be provided' },
      ],
      autoTransition: true,
    },
  ],

  [LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING]: [
    {
      toStage: LEAD_STAGES.RETAINED_ACTIVE_MATTER,
      guards: [
        { type: 'payment_received', description: 'Payment must be received (or waived)' },
        { type: 'all_conversion_gates_pass', description: 'All legal/compliance gates must be satisfied' },
      ],
      autoTransition: true,
    },
  ],

  // RETAINED_ACTIVE_MATTER can advance to CONVERTED via conversion executor
  [LEAD_STAGES.RETAINED_ACTIVE_MATTER]: [
    {
      toStage: LEAD_STAGES.CONVERTED,
      guards: [
        { type: 'all_conversion_gates_pass', description: 'All legal/compliance conversion gates must be satisfied' },
      ],
      autoTransition: false, // Only via conversion executor, never auto
    },
  ],

  // Terminal stages — no forward transitions (reopen only via reopen engine)
  [LEAD_STAGES.CONVERTED]: [],
  [LEAD_STAGES.CLOSED_NO_RESPONSE]: [],
  [LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED]: [],
  [LEAD_STAGES.CLOSED_CLIENT_DECLINED]: [],
  [LEAD_STAGES.CLOSED_NOT_A_FIT]: [],
}

// ─── Communication Channel Config ────────────────────────────────────────────

export interface ChannelConfig {
  channel: 'call' | 'email' | 'sms' | 'portal_chat' | 'system_reminder'
  countsAsContactAttempt: boolean
  /** Directions that count as contact attempts */
  attemptDirections: ('outbound' | 'inbound')[]
}

export const CONTACT_ATTEMPT_CHANNELS: ChannelConfig[] = [
  { channel: 'call', countsAsContactAttempt: true, attemptDirections: ['outbound'] },
  { channel: 'email', countsAsContactAttempt: true, attemptDirections: ['outbound'] },
  { channel: 'sms', countsAsContactAttempt: true, attemptDirections: ['outbound'] },
  { channel: 'portal_chat', countsAsContactAttempt: false, attemptDirections: [] },
  { channel: 'system_reminder', countsAsContactAttempt: false, attemptDirections: [] },
]

/**
 * Determine whether a communication event counts as a contact attempt.
 */
export function isContactAttempt(channel: string, direction: string): boolean {
  const config = CONTACT_ATTEMPT_CHANNELS.find((c) => c.channel === channel)
  if (!config || !config.countsAsContactAttempt) return false
  return config.attemptDirections.includes(direction as 'outbound' | 'inbound')
}

// ─── Closure Definitions ─────────────────────────────────────────────────────

export interface ClosureDef {
  stage: LeadStage
  label: string
  defaultReasonCode: string
  requiresLawyerApproval: boolean
}

export const CLOSURE_STAGE_DEFINITIONS: Record<string, ClosureDef> = {
  [LEAD_STAGES.CLOSED_NO_RESPONSE]: {
    stage: LEAD_STAGES.CLOSED_NO_RESPONSE,
    label: 'Closed – No Response',
    defaultReasonCode: 'no_response',
    requiresLawyerApproval: false,
  },
  [LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED]: {
    stage: LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED,
    label: 'Closed – Retainer Not Signed',
    defaultReasonCode: 'retainer_not_signed',
    requiresLawyerApproval: false,
  },
  [LEAD_STAGES.CLOSED_CLIENT_DECLINED]: {
    stage: LEAD_STAGES.CLOSED_CLIENT_DECLINED,
    label: 'Closed – Client Declined',
    defaultReasonCode: 'client_declined',
    requiresLawyerApproval: false,
  },
  [LEAD_STAGES.CLOSED_NOT_A_FIT]: {
    stage: LEAD_STAGES.CLOSED_NOT_A_FIT,
    label: 'Closed – Not a Fit',
    defaultReasonCode: 'not_a_fit',
    requiresLawyerApproval: false,
  },
}

// ─── Default Workspace Config Values ─────────────────────────────────────────

export const DEFAULT_WORKSPACE_CONFIG = {
  contact_attempt_cadence_days: [1, 2, 3, 5],
  retainer_followup_cadence_days: [2, 3, 5, 7],
  payment_followup_cadence_days: [1, 3, 5],
  no_show_cadence_days: [1, 2, 5],
  enabled_channels: ['call', 'email', 'sms'],
  final_closure_messages_mode: 'auto' as const,
  consultation_reminder_hours: [24, 2],
  auto_closure_after_days: 15,
  active_matter_conversion_gates: {
    conflict_cleared: true,
    retainer_signed: true,
    payment_received: true,
    intake_complete: false,
    id_verification: false,
    required_documents: false,
    readiness_complete: true,
    trust_deposit_received: false,
  },
} as const
