/**
 * Portal types — shared between portal API routes and components.
 */

// ── Analytics event types (locked taxonomy — 20 events) ────────────────────────

export type PortalEventType =
  | 'portal_opened'
  | 'device_context'
  | 'section_expanded'
  | 'section_collapsed'
  | 'document_upload_started'
  | 'document_upload_completed'
  | 'document_upload_failed'
  | 'questionnaire_step_completed'
  | 'questionnaire_completed'
  | 'questionnaire_edit_requested'
  | 'payment_mark_sent_clicked'
  | 'payment_credit_card_clicked'
  | 'payment_instructions_copied'
  | 'message_section_opened'
  | 'message_sent'
  | 'next_action_displayed'
  | 'next_action_go_clicked'
  | 'portal_help_contact_clicked'
  | 'support_email_clicked'
  | 'support_phone_clicked'
  | 'shared_document_viewed'
  | 'task_status_changed'
  | 'client_document_uploaded'
  | 'portal_form_opened'
  | 'portal_form_completed'
  | 'message_team_clicked'
  | 'team_card_email_clicked'
  | 'team_card_phone_clicked'

// ── Payment configuration ───────────────────────────────────────────────────────

export interface PortalPaymentConfig {
  e_transfer_email?: string
  e_transfer_instructions?: string
  credit_card_url?: string
  /** Label for the credit card button, e.g. "Stripe", "PayPal" */
  credit_card_label?: string
  payment_instructions?: string
}

// ── Staff contact ───────────────────────────────────────────────────────────────

export interface PortalStaffContact {
  name?: string
  email?: string
  phone?: string
  /** e.g. "For documents, portal support, and payment confirmation" */
  role_description?: string
}

// ── Summary API response ────────────────────────────────────────────────────────

export type NextActionColor = 'red' | 'amber' | 'blue' | 'green'

export interface PortalNextAction {
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  type:
    | 'reupload_document'
    | 'payment_overdue'
    | 'missing_document'
    | 'incomplete_questionnaire'
    | 'overdue_task'
    | 'unread_messages'
    | 'upcoming_event'
    | 'awaiting_review'
  color: NextActionColor
  scrollTarget: string | null
  context: {
    documentName?: string
    reason?: string
    amount?: number
    taskTitle?: string
    eventTitle?: string
    eventDate?: string
    questionnaireProgress?: number
  }
}

export interface PortalSectionCounts {
  documents: {
    total: number
    uploaded: number
    accepted: number
    needed: number
    reuploadNeeded: number
  }
  questions: {
    exists: boolean
    completed: boolean
    progress: number
    incompleteSections: number
    /** Total number of IRCC forms configured (0 if legacy/no forms) */
    totalForms?: number
    /** Number of forms with status='completed' */
    completedForms?: number
    /** Names of incomplete forms (e.g., "IMM 5257 — Visitor Visa") */
    incompleteFormNames?: string[]
  }
  payment: {
    totalDue: number
    totalPaid: number
    overdueCount: number
    invoiceCount: number
    hasRequiredOverdue: boolean
  }
  tasks: {
    total: number
    todo: number
    overdue: number
    completed: number
  }
  messages: {
    total: number
    unread: number
    latestDate: string | null
  }
  calendar: {
    upcomingCount: number
    nextEvent: { title: string; date: string } | null
  }
  sharedDocuments: {
    total: number
    viewed: number
    unviewed: number
  }
}

export interface PortalSummaryResponse {
  nextAction: PortalNextAction
  awaitingReview: boolean
  reviewContext?: {
    lastSubmittedAt: string | null
    lastSubmittedAction: string | null
  } | null
  sections: PortalSectionCounts
  lastUpdated: string
  matter: {
    title: string
    matterNumber: string
    matterTypeName: string
    status: string
  }
}

// ── Shared Documents ────────────────────────────────────────────────────────────

export interface PortalSharedDocument {
  id: string
  file_name: string
  category: string | null
  description: string | null
  file_type: string | null
  file_size: number | null
  shared_at: string
  client_viewed_at: string | null
}

// ── Billing API response ────────────────────────────────────────────────────────

export interface PortalInvoice {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  totalAmount: number
  amountPaid: number
  status: string
  isOverdue: boolean
  requiredBeforeWork: boolean
  /** Whether client already marked e-transfer as sent */
  markedAsSent: boolean
  /** ISO timestamp of when the e-transfer notification was recorded */
  markedAsSentAt?: string | null
}

export interface PortalRetainerFeeItem {
  description: string
  amount: number
}

export interface PortalRetainerLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PortalRetainerSummary {
  billingType: string
  lineItems: PortalRetainerLineItem[]
  governmentFees: PortalRetainerFeeItem[]
  disbursements: PortalRetainerFeeItem[]
  hstApplicable: boolean
  subtotalCents: number
  taxAmountCents: number
  totalAmountCents: number
  paymentAmount: number
  balanceCents: number
  paymentStatus: string
  paymentTerms: string | null
  signedAt: string | null
}

export interface PortalBillingResponse {
  invoices: PortalInvoice[]
  summary: {
    totalDue: number
    totalPaid: number
    totalOutstanding: number
    overdueAmount: number
  }
  paymentConfig: PortalPaymentConfig
  currency: string
  retainerSummary: PortalRetainerSummary | null
}
