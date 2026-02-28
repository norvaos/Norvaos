export const APP_NAME = 'NorvaOS'

export const CONTACT_SOURCES = [
  'Referral',
  'Website',
  'Google',
  'Social Media',
  'Walk-in',
  'Phone Inquiry',
  'Legal Directory',
  'Bar Association',
  'Advertising',
  'Event',
  'Other',
] as const

export const MATTER_STATUSES = [
  { value: 'intake', label: 'Intake', color: '#3b82f6' },
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'on_hold', label: 'On Hold', color: '#f59e0b' },
  { value: 'closed_won', label: 'Closed (Won)', color: '#22c55e' },
  { value: 'closed_lost', label: 'Closed (Lost)', color: '#ef4444' },
  { value: 'archived', label: 'Archived', color: '#6b7280' },
] as const

export const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#6b7280' },
  { value: 'medium', label: 'Medium', color: '#3b82f6' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
] as const

export const BILLING_TYPES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'flat_fee', label: 'Flat Fee' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'hybrid', label: 'Hybrid' },
] as const

export const CONTACT_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'organization', label: 'Organisation' },
] as const

export const LEAD_TEMPERATURES = [
  { value: 'cold', label: 'Cold', color: '#3b82f6' },
  { value: 'warm', label: 'Warm', color: '#f59e0b' },
  { value: 'hot', label: 'Hot', color: '#ef4444' },
] as const

export const TASK_STATUSES = [
  { value: 'not_started', label: 'Not Started', color: '#c3c6d4' },
  { value: 'working_on_it', label: 'Working on it', color: '#fdab3d' },
  { value: 'stuck', label: 'Stuck', color: '#e2445c' },
  { value: 'done', label: 'Done', color: '#00c875' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
] as const

export const MATTER_CONTACT_ROLES = [
  { value: 'client', label: 'Client' },
  { value: 'opposing_party', label: 'Opposing Party' },
  { value: 'opposing_counsel', label: 'Opposing Counsel' },
  { value: 'witness', label: 'Witness' },
  { value: 'expert', label: 'Expert' },
  { value: 'guarantor', label: 'Guarantor' },
  { value: 'co_applicant', label: 'Co-Applicant' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'employer', label: 'Employer' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'purchaser', label: 'Purchaser' },
  { value: 'beneficiary', label: 'Beneficiary' },
  { value: 'agent', label: 'Agent' },
  { value: 'adjudicator', label: 'Adjudicator' },
  { value: 'mediator', label: 'Mediator' },
  { value: 'interpreter', label: 'Interpreter' },
  { value: 'other', label: 'Other' },
] as const

export const RELATIONSHIP_TYPES = [
  { value: 'spouse', label: 'Spouse', reverse: 'spouse' },
  { value: 'parent', label: 'Parent', reverse: 'child' },
  { value: 'child', label: 'Child', reverse: 'parent' },
  { value: 'sibling', label: 'Sibling', reverse: 'sibling' },
  { value: 'employer', label: 'Employer', reverse: 'employee' },
  { value: 'employee', label: 'Employee', reverse: 'employer' },
  { value: 'business_partner', label: 'Business Partner', reverse: 'business_partner' },
  { value: 'referral_source', label: 'Referral Source', reverse: 'referred_by' },
  { value: 'referred_by', label: 'Referred By', reverse: 'referral_source' },
  { value: 'guardian', label: 'Guardian', reverse: 'ward' },
  { value: 'ward', label: 'Ward', reverse: 'guardian' },
] as const

// ============================================================================
// Immigration Practice Operating System Constants
// ============================================================================

export const VISA_STATUSES = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'work_permit', label: 'Work Permit' },
  { value: 'study_permit', label: 'Study Permit' },
  { value: 'pr', label: 'Permanent Resident' },
  { value: 'citizen', label: 'Canadian Citizen' },
  { value: 'no_status', label: 'No Status' },
  { value: 'refugee_claimant', label: 'Refugee Claimant' },
  { value: 'bridging_open_wp', label: 'Bridging Open Work Permit' },
  { value: 'implied_status', label: 'Implied Status' },
] as const

export const CHECKLIST_STATUSES = [
  { value: 'missing', label: 'Missing', color: '#e2445c' },
  { value: 'requested', label: 'Requested', color: '#fdab3d' },
  { value: 'received', label: 'Received', color: '#3b82f6' },
  { value: 'approved', label: 'Approved', color: '#00c875' },
  { value: 'not_applicable', label: 'N/A', color: '#6b7280' },
] as const

export const CHECKLIST_CATEGORIES = [
  { value: 'identity', label: 'Identity Documents' },
  { value: 'education', label: 'Education' },
  { value: 'employment', label: 'Employment' },
  { value: 'financial', label: 'Financial' },
  { value: 'language', label: 'Language Testing' },
  { value: 'background', label: 'Background / Police' },
  { value: 'medical', label: 'Medical' },
  { value: 'relationship', label: 'Relationship Evidence' },
  { value: 'claim', label: 'Claim / Legal' },
  { value: 'other', label: 'Other' },
  { value: 'general', label: 'General' },
] as const

export const DEADLINE_TYPES = [
  { value: 'visa_expiry', label: 'Visa Expiry', color: '#e2445c' },
  { value: 'biometrics', label: 'Biometrics Deadline', color: '#f59e0b' },
  { value: 'medical', label: 'Medical Exam', color: '#6366f1' },
  { value: 'ircc_submission', label: 'IRCC Submission', color: '#3b82f6' },
  { value: 'filing', label: 'Filing Deadline', color: '#ef4444' },
  { value: 'hearing', label: 'Hearing Date', color: '#8b5cf6' },
  { value: 'custom', label: 'Custom Deadline', color: '#6b7280' },
] as const

export const DEADLINE_STATUSES = [
  { value: 'upcoming', label: 'Upcoming', color: '#3b82f6' },
  { value: 'at_risk', label: 'At Risk', color: '#fdab3d' },
  { value: 'overdue', label: 'Overdue', color: '#e2445c' },
  { value: 'completed', label: 'Completed', color: '#00c875' },
  { value: 'dismissed', label: 'Dismissed', color: '#6b7280' },
] as const

export const LANGUAGE_TEST_TYPES = [
  { value: 'ielts_general', label: 'IELTS General' },
  { value: 'ielts_academic', label: 'IELTS Academic' },
  { value: 'celpip', label: 'CELPIP' },
  { value: 'tef', label: 'TEF Canada' },
  { value: 'tcf', label: 'TCF Canada' },
] as const

export const ECA_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const

// CRS (Comprehensive Ranking System) Constants
export const CRS_EDUCATION_LEVELS = [
  { value: 'less_than_secondary', label: 'Less than secondary school' },
  { value: 'secondary', label: 'Secondary diploma (high school)' },
  { value: 'one_year_post_secondary', label: 'One-year post-secondary' },
  { value: 'two_year_post_secondary', label: 'Two-year post-secondary' },
  { value: 'bachelors_3year', label: "Bachelor's degree (or 3+ year program)" },
  { value: 'two_or_more_credentials', label: 'Two or more post-secondary credentials (one 3+ yr)' },
  { value: 'masters', label: "Master's degree" },
  { value: 'phd', label: 'Doctoral degree (PhD)' },
] as const

export const CRS_NOC_TEER_CATEGORIES = [
  { value: 'none', label: 'No job offer' },
  { value: 'teer_0_1', label: 'TEER 0 or 1 (Management / Professional)' },
  { value: 'teer_2_3', label: 'TEER 2 or 3 (Technical / Skilled trades)' },
  { value: 'teer_4_5', label: 'TEER 4 or 5 (Intermediate / Labour)' },
] as const

export const CRS_CANADIAN_EDUCATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '1_2_years', label: '1-2 year credential' },
  { value: '3_plus_years', label: '3+ year credential' },
] as const

export const CRS_WORK_EXPERIENCE_OPTIONS = [
  { value: 0, label: 'None or less than 1 year' },
  { value: 1, label: '1 year' },
  { value: 2, label: '2 years' },
  { value: 3, label: '3 years' },
  { value: 4, label: '4 years' },
  { value: 5, label: '5 or more years' },
] as const

export const AUTOMATION_TRIGGER_TYPES = [
  { value: 'stage_change', label: 'Stage Change' },
  { value: 'checklist_item_approved', label: 'Checklist Item Approved' },
  { value: 'deadline_approaching', label: 'Deadline Approaching' },
  { value: 'deadline_critical', label: 'Deadline Critical Risk' },
  { value: 'matter_created', label: 'Matter Created' },
] as const

export const AUTOMATION_ACTION_TYPES = [
  { value: 'create_task', label: 'Create Task' },
  { value: 'create_deadline', label: 'Create Deadline' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'send_client_email', label: 'Send Client Email' },
  { value: 'log_activity', label: 'Log Activity' },
] as const

// ── Invoicing ────────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#94a3b8' },
  { value: 'sent', label: 'Sent', color: '#3b82f6' },
  { value: 'viewed', label: 'Viewed', color: '#8b5cf6' },
  { value: 'paid', label: 'Paid', color: '#22c55e' },
  { value: 'overdue', label: 'Overdue', color: '#ef4444' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
  { value: 'void', label: 'Void', color: '#6b7280' },
] as const

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'trust_account', label: 'Trust Account' },
  { value: 'other', label: 'Other' },
] as const

// ── Booking / Appointments ──────────────────────────────────────────────────

export const APPOINTMENT_STATUSES = [
  { value: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
  { value: 'completed', label: 'Completed', color: '#22c55e' },
  { value: 'no_show', label: 'No Show', color: '#ef4444' },
] as const

export const BOOKING_DURATIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
] as const
