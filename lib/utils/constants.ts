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
  { value: 'low', label: 'Routine', color: '#6b7280' },
  { value: 'medium', label: 'Moderate', color: '#3b82f6' },
  { value: 'high', label: 'Elevated', color: '#f59e0b' },
  { value: 'urgent', label: 'Critical', color: '#ef4444' },
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
  { value: 'cold', label: 'Standard', color: '#6b7280' },
  { value: 'warm', label: 'Elevated', color: '#f59e0b' },
  { value: 'hot', label: 'Critical', color: '#ef4444' },
] as const

export const TASK_STATUSES = [
  { value: 'not_started', label: 'Not Started', color: '#c3c6d4' },
  { value: 'working_on_it', label: 'Working on it', color: '#fdab3d' },
  { value: 'stuck', label: 'Stuck', color: '#e2445c' },
  { value: 'done', label: 'Done', color: '#00c875' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
] as const

export const TASK_TYPES = [
  { value: 'call', label: 'Call', icon: 'Phone' },
  { value: 'document_collection', label: 'Document Collection', icon: 'FileStack' },
  { value: 'form_filling', label: 'Form Filling', icon: 'ClipboardList' },
  { value: 'review', label: 'Review', icon: 'Search' },
  { value: 'follow_up', label: 'Follow-Up', icon: 'RotateCcw' },
  { value: 'meeting', label: 'Meeting', icon: 'Users' },
  { value: 'other', label: 'Other', icon: 'MoreHorizontal' },
] as const

export const TASK_CATEGORIES = [
  { value: 'client_facing', label: 'Client-Facing', color: '#3b82f6' },
  { value: 'internal', label: 'Internal', color: '#6b7280' },
  { value: 'administrative', label: 'Administrative', color: '#8b5cf6' },
] as const

export const TASK_VISIBILITIES = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'assigned_only', label: 'Assigned Only' },
  { value: 'team', label: 'Team' },
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

// Immigration Program Levels (high-level residency grouping for matter_immigration.program_category)
export const IMMIGRATION_PROGRAM_LEVELS = [
  { value: 'temp_resident', label: 'Temporary Resident' },
  { value: 'perm_resident', label: 'Permanent Resident' },
  { value: 'citizenship', label: 'Citizenship' },
  { value: 'other', label: 'Other' },
] as const

export const STUDY_LEVELS = [
  { value: 'language', label: 'Language Program' },
  { value: 'secondary', label: 'Secondary School' },
  { value: 'diploma', label: 'Diploma / Certificate' },
  { value: 'bachelors', label: "Bachelor's Degree" },
  { value: 'masters', label: "Master's Degree" },
  { value: 'doctorate', label: 'Doctorate / PhD' },
  { value: 'postdoc', label: 'Post-Doctoral' },
] as const

export const SPONSOR_RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'common_law', label: 'Common-Law Partner' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'other', label: 'Other Relative' },
] as const

export const SPONSOR_STATUSES = [
  { value: 'citizen', label: 'Canadian Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident' },
  { value: 'other', label: 'Other' },
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

// ============================================================================
// Universal Enforcement Engine Constants
// ============================================================================

export const PERSON_ROLES = [
  { value: 'principal_applicant', label: 'Principal Applicant' },
  { value: 'spouse', label: 'Spouse / Common-Law Partner' },
  { value: 'dependent', label: 'Dependent Child' },
  { value: 'co_sponsor', label: 'Co-Sponsor' },
  { value: 'other', label: 'Other' },
] as const

export const IMMIGRATION_STATUSES = [
  { value: 'citizen', label: 'Canadian Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident' },
  { value: 'work_permit', label: 'Work Permit Holder' },
  { value: 'study_permit', label: 'Study Permit Holder' },
  { value: 'visitor', label: 'Visitor' },
  { value: 'refugee_claimant', label: 'Refugee Claimant' },
  { value: 'no_status', label: 'No Status / Undocumented' },
  { value: 'implied_status', label: 'Implied Status' },
  { value: 'bridging_open_wp', label: 'Bridging Open Work Permit' },
  { value: 'expired', label: 'Expired Status' },
  { value: 'outside_canada_pending', label: 'Outside Canada — Application Pending' },
  { value: 'outside_canada_awaiting', label: 'Outside Canada — Awaiting Decision' },
  { value: 'outside_canada_no_application', label: 'Outside Canada — No Application' },
  { value: 'unknown', label: 'Unknown' },
] as const

export const MARITAL_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'common_law', label: 'Common-Law' },
  { value: 'separated', label: 'Separated' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
] as const

export const PROCESSING_STREAMS = [
  { value: 'inland', label: 'Inland' },
  { value: 'outland', label: 'Outland' },
  { value: 'hybrid', label: 'Hybrid' },
] as const

export const PROGRAM_CATEGORIES = [
  { value: 'spousal', label: 'Spousal / Common-Law Sponsorship' },
  { value: 'express_entry', label: 'Express Entry' },
  { value: 'pnp', label: 'Provincial Nominee Program' },
  { value: 'refugee', label: 'Refugee Claim' },
  { value: 'work_permit', label: 'Work Permit' },
  { value: 'study_permit', label: 'Study Permit' },
  { value: 'visitor_visa', label: 'Visitor Visa' },
  { value: 'citizenship', label: 'Citizenship' },
  { value: 'humanitarian', label: 'Humanitarian & Compassionate' },
  { value: 'lmia', label: 'LMIA' },
  { value: 'judicial_review', label: 'Judicial Review' },
  { value: 'other', label: 'Other' },
] as const

export const RISK_LEVELS = [
  { value: 'low', label: 'Low', color: '#22c55e', min: 0, max: 25 },
  { value: 'medium', label: 'Medium', color: '#f59e0b', min: 26, max: 50 },
  { value: 'high', label: 'High', color: '#f97316', min: 51, max: 75 },
  { value: 'critical', label: 'Critical', color: '#ef4444', min: 76, max: 100 },
] as const

export const INTAKE_STATUSES = [
  { value: 'not_applicable', label: 'N/A', color: '#94a3b8' },
  { value: 'incomplete', label: 'Incomplete', color: '#94a3b8' },
  { value: 'complete', label: 'Complete', color: '#3b82f6' },
  { value: 'validated', label: 'Validated', color: '#22c55e' },
  { value: 'locked', label: 'Locked', color: '#6366f1' },
] as const

export const IMMIGRATION_INTAKE_STATUSES = [
  { value: 'not_issued', label: 'Intake Not Issued', color: '#94a3b8' },
  { value: 'issued', label: 'Intake Issued', color: '#64748b' },
  { value: 'client_in_progress', label: 'Client In Progress', color: '#f59e0b' },
  { value: 'review_required', label: 'Review Required', color: '#3b82f6' },
  { value: 'deficiency_outstanding', label: 'Deficiency Outstanding', color: '#ef4444' },
  { value: 'intake_complete', label: 'Intake Complete', color: '#22c55e' },
  { value: 'drafting_enabled', label: 'Drafting Enabled', color: '#8b5cf6' },
  { value: 'lawyer_review', label: 'Lawyer Review', color: '#6366f1' },
  { value: 'ready_for_filing', label: 'Ready for Filing', color: '#10b981' },
  { value: 'filed', label: 'Filed', color: '#059669' },
] as const

export const LAWYER_REVIEW_STATUSES = [
  { value: 'not_required', label: 'Not Required', color: '#94a3b8' },
  { value: 'pending', label: 'Pending Review', color: '#f59e0b' },
  { value: 'approved', label: 'Approved', color: '#22c55e' },
  { value: 'changes_requested', label: 'Changes Requested', color: '#ef4444' },
] as const

export const INTAKE_DELEGATION_MODES = [
  { value: 'pa_only', label: 'Principal Applicant Only' },
  { value: 'spouse_only', label: 'Spouse / Partner Only' },
  { value: 'each_own', label: 'Each Completes Own Section' },
] as const

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer Not to Say' },
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

export const DOCUMENT_REJECTION_REASONS = [
  { value: 'blurry', label: 'Blurry / Illegible' },
  { value: 'expired', label: 'Expired Document' },
  { value: 'wrong_document', label: 'Wrong Document' },
  { value: 'incomplete', label: 'Incomplete / Missing Pages' },
  { value: 'wrong_format', label: 'Wrong File Format' },
  { value: 'other', label: 'Other' },
] as const

// ============================================================================
// Document Slot Template Constants
// ============================================================================

export const DOCUMENT_SLOT_CATEGORIES = [
  { value: 'identity', label: 'Identity Documents' },
  { value: 'education', label: 'Education' },
  { value: 'employment', label: 'Employment' },
  { value: 'financial', label: 'Financial' },
  { value: 'language', label: 'Language Testing' },
  { value: 'background', label: 'Background / Police' },
  { value: 'medical', label: 'Medical' },
  { value: 'relationship', label: 'Relationship Evidence' },
  { value: 'claim', label: 'Claim / Legal' },
  { value: 'property', label: 'Property Documents' },
  { value: 'corporate', label: 'Corporate / Business' },
  { value: 'tax', label: 'Tax Documents' },
  { value: 'other', label: 'Other' },
  { value: 'general', label: 'General' },
] as const

export const PERSON_ROLE_SCOPES = [
  { value: '', label: 'Matter-level (no person)' },
  { value: 'principal_applicant', label: 'Principal Applicant' },
  { value: 'spouse', label: 'Spouse / Common-Law Partner' },
  { value: 'dependent', label: 'Dependent Child' },
  { value: 'any', label: 'Every person on the matter' },
] as const

export const ACCEPTED_FILE_TYPES = [
  { value: 'application/pdf', label: 'PDF' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'application/msword', label: 'DOC' },
  { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX' },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX' },
] as const

// ── Immigration Service Presets (for Retainer Builder quick-add) ──
/** @deprecated Retainer builder now reads from DB (retainer_presets table). Used only by seed-defaults endpoint. */

export const IMMIGRATION_SERVICE_PRESETS = [
  // ── Sponsorship ──
  { description: 'Spousal / Common-Law Sponsorship', unitPrice: 3500 },
  { description: 'Parent & Grandparent Sponsorship', unitPrice: 4000 },
  { description: 'Dependent Child Sponsorship', unitPrice: 2500 },
  { description: 'Super Visa Application', unitPrice: 1500 },
  // ── Permanent Residence ──
  { description: 'Express Entry Application', unitPrice: 3000 },
  { description: 'PNP Application', unitPrice: 3000 },
  { description: 'Atlantic Immigration Program', unitPrice: 3000 },
  { description: 'Rural & Northern Immigration Pilot', unitPrice: 2500 },
  { description: 'Agri-Food Immigration Pilot', unitPrice: 2500 },
  { description: 'Quebec Skilled Worker (CSQ)', unitPrice: 3500 },
  { description: 'Start-Up Visa Program', unitPrice: 5000 },
  { description: 'Self-Employed Persons Program', unitPrice: 4500 },
  { description: 'Caregiver Pathway (Home Child Care / Home Support)', unitPrice: 3000 },
  // ── Temporary Residence ──
  { description: 'Work Permit Application', unitPrice: 2000 },
  { description: 'Open Work Permit', unitPrice: 1500 },
  { description: 'Post-Graduation Work Permit (PGWP)', unitPrice: 1200 },
  { description: 'Bridging Open Work Permit (BOWP)', unitPrice: 1200 },
  { description: 'Spousal Open Work Permit', unitPrice: 1500 },
  { description: 'LMIA Application', unitPrice: 3500 },
  { description: 'LMIA Exemption (Employer-Specific)', unitPrice: 2500 },
  { description: 'Intra-Company Transfer (ICT)', unitPrice: 3000 },
  { description: 'CUSMA / NAFTA Work Permit', unitPrice: 2000 },
  { description: 'Study Permit Application', unitPrice: 1500 },
  { description: 'Study Permit Extension', unitPrice: 1000 },
  { description: 'Visitor Visa Application', unitPrice: 800 },
  { description: 'Visitor Visa Extension', unitPrice: 600 },
  { description: 'Visitor Record', unitPrice: 800 },
  { description: 'Temporary Resident Permit (TRP)', unitPrice: 2500 },
  { description: 'Electronic Travel Authorization (eTA)', unitPrice: 300 },
  // ── Citizenship ──
  { description: 'Citizenship Application', unitPrice: 1200 },
  { description: 'Citizenship — Minor Application', unitPrice: 1000 },
  { description: 'Proof of Citizenship', unitPrice: 800 },
  { description: 'Citizenship Resumption', unitPrice: 1500 },
  // ── Humanitarian & Refugee ──
  { description: 'H&C Application', unitPrice: 4500 },
  { description: 'Refugee Claim', unitPrice: 4000 },
  { description: 'Pre-Removal Risk Assessment (PRRA)', unitPrice: 3500 },
  { description: 'Refugee Appeal Division (RAD)', unitPrice: 3500 },
  // ── Enforcement & Compliance ──
  { description: 'Admissibility Hearing', unitPrice: 4000 },
  { description: 'Detention Review', unitPrice: 3000 },
  { description: 'Removal Order Appeal (IAD)', unitPrice: 5000 },
  { description: 'Sponsorship Appeal (IAD)', unitPrice: 4500 },
  { description: 'Criminal Inadmissibility Application', unitPrice: 3500 },
  { description: 'Criminal Rehabilitation Application', unitPrice: 2500 },
  { description: 'Authorization to Return to Canada (ARC)', unitPrice: 2000 },
  // ── Judicial Review & Federal Court ──
  { description: 'Judicial Review', unitPrice: 5000 },
  { description: 'Federal Court — Leave Application', unitPrice: 5000 },
  { description: 'Federal Court — Full Hearing', unitPrice: 8000 },
  { description: 'Stay of Removal Motion', unitPrice: 3500 },
  // ── Status Changes & Restoration ──
  { description: 'Status Restoration', unitPrice: 1500 },
  { description: 'Change of Conditions', unitPrice: 1000 },
  { description: 'Implied Status Extension', unitPrice: 800 },
  { description: 'PR Card Renewal', unitPrice: 800 },
  { description: 'PR Travel Document', unitPrice: 1000 },
  // ── Other Services ──
  { description: 'Consultation Fee', unitPrice: 350 },
  { description: 'Document Review & Assessment', unitPrice: 500 },
  { description: 'Employer Compliance Review', unitPrice: 2000 },
  { description: 'Business Immigration Consultation', unitPrice: 750 },
  { description: 'Appeal Consultation', unitPrice: 500 },
] as const

/** @deprecated Retainer builder now reads from DB (retainer_presets table). Used only by seed-defaults endpoint. */
export const GOVERNMENT_FEE_PRESETS = [
  // ── Permanent Residence ──
  { description: 'PR Application Fee (Principal)', amount: 1365 },
  { description: 'PR Application Fee (Spouse / Partner)', amount: 1365 },
  { description: 'PR Application Fee (Dependent Child)', amount: 260 },
  { description: 'Right of Permanent Residence Fee (RPRF)', amount: 575 },
  // ── Sponsorship ──
  { description: 'Sponsorship Fee', amount: 75 },
  { description: 'Super Visa Fee', amount: 100 },
  // ── Temporary Residence ──
  { description: 'Work Permit Fee', amount: 255 },
  { description: 'Open Work Permit Holder Fee', amount: 100 },
  { description: 'LMIA Employer Compliance Fee', amount: 1000 },
  { description: 'Study Permit Fee', amount: 150 },
  { description: 'Visitor Visa Fee', amount: 100 },
  { description: 'Visitor Visa Extension Fee', amount: 100 },
  { description: 'TRP Fee', amount: 200 },
  { description: 'eTA Fee', amount: 7 },
  // ── Citizenship ──
  { description: 'Citizenship Fee (Adult)', amount: 630 },
  { description: 'Citizenship Fee (Minor)', amount: 100 },
  { description: 'Proof of Citizenship Fee', amount: 75 },
  { description: 'Citizenship Resumption Fee', amount: 630 },
  // ── Biometrics ──
  { description: 'Biometrics Fee (Individual)', amount: 85 },
  { description: 'Biometrics Fee (Family — max)', amount: 170 },
  // ── Status & Restoration ──
  { description: 'Status Restoration Fee', amount: 229 },
  { description: 'PR Card Renewal Fee', amount: 50 },
  { description: 'PR Travel Document Fee', amount: 50 },
  // ── Appeals & Reviews ──
  { description: 'Federal Court Filing Fee', amount: 50 },
  { description: 'IAD Appeal Filing Fee', amount: 0 },
  // ── Other Government Fees ──
  { description: 'Criminal Rehabilitation Fee', amount: 1000 },
  { description: 'ARC Fee', amount: 400 },
  { description: 'Employer Compliance Fee (LMIA)', amount: 1000 },
] as const

/** @deprecated Retainer builder now reads from DB (retainer_presets table). Used only by seed-defaults endpoint. */
export const DISBURSEMENT_PRESETS = [
  { description: 'Courier / Postage (Domestic)', amount: 30 },
  { description: 'Courier / Postage (International)', amount: 75 },
  { description: 'Translation Services', amount: 150 },
  { description: 'Notarisation / Commissioner of Oaths', amount: 50 },
  { description: 'Certified Copies', amount: 30 },
  { description: 'Process Server', amount: 100 },
  { description: 'Filing Fee (Court)', amount: 200 },
  { description: 'Photocopying / Printing', amount: 25 },
  { description: 'Long Distance / Fax', amount: 15 },
  { description: 'Travel Expenses', amount: 200 },
  { description: 'Medical Exam Coordination', amount: 75 },
  { description: 'Police Clearance Certificate', amount: 50 },
  { description: 'Document Retrieval / Apostille', amount: 100 },
  { description: 'Interpreter Services', amount: 200 },
  { description: 'Expert Report / Opinion', amount: 500 },
  { description: 'Binding / Report Preparation', amount: 40 },
] as const

export const PAYMENT_MILESTONES = [
  'Upon receipt / signing',
  'Upon receipt of documents from client',
  'Before submission of application',
  'Upon submission of application',
  'Upon approval / positive decision',
  'Upon completion',
] as const

// ── Consultation Command Centre ──────────────────────────────────────

/**
 * Person scope for retainer fee templates and matters.
 * Phase-one billing abstraction — NOT the final domain model for all practice areas.
 */
export const PERSON_SCOPES = [
  { value: 'single', label: 'Single Applicant' },
  { value: 'joint', label: 'Joint / Family' },
] as const

/**
 * Consultation outcomes — used by the inline Consultation Outcome Panel.
 * Each outcome maps to a distinct set of downstream actions (see plan).
 */
export const CONSULTATION_OUTCOMES = [
  {
    value: 'send_retainer',
    label: 'Retained — Pending Retainer',
    icon: 'Trophy',
    color: '#22c55e',
    description: 'Lead intends to retain. Prepare retainer package.',
  },
  {
    value: 'follow_up_later',
    label: 'Thinking — Follow-up Required',
    icon: 'Clock',
    color: '#f59e0b',
    description: 'Lead needs more time to decide.',
  },
  {
    value: 'client_declined',
    label: 'Declined',
    icon: 'XCircle',
    color: '#ef4444',
    description: 'Lead attended consultation and declined to retain.',
  },
  {
    value: 'not_a_fit',
    label: 'Not Suitable',
    icon: 'Ban',
    color: '#dc2626',
    description: 'Not a fit for the firm.',
  },
  {
    value: 'referred_out',
    label: 'Referred Out',
    icon: 'ExternalLink',
    color: '#8b5cf6',
    description: 'Referring to another firm or lawyer.',
  },
  {
    value: 'no_show',
    label: 'No Show',
    icon: 'UserX',
    color: '#6b7280',
    description: 'Lead did not attend the consultation.',
  },
  {
    value: 'book_follow_up',
    label: 'Book Follow-up Consultation',
    icon: 'CalendarPlus',
    color: '#3b82f6',
    description: 'Schedule a follow-up meeting.',
  },
] as const

export type ConsultationOutcomeValue = (typeof CONSULTATION_OUTCOMES)[number]['value']

export const DECLINE_REASONS = [
  'Cost / Budget',
  'Chose Another Firm',
  'No Longer Needs Service',
  'Timeline Issue',
  'Changed Mind',
  'Other',
] as const

export const NOT_FIT_REASONS = [
  'Outside Practice Area',
  'Conflict of Interest',
  'Capacity Constraints',
  'Ethical Concerns',
  'Low Merit Case',
  'Other',
] as const

export const REFERRAL_REASONS = [
  'Out of Scope',
  'Conflict of Interest',
  'Better Fit Elsewhere',
  'Capacity Constraints',
  'Other',
] as const

export const FOLLOW_UP_TYPES = [
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In-Person' },
  { value: 'video', label: 'Video' },
] as const

// ── Controlled Workflow Constants ─────────────────────────────────────

export const MEETING_OUTCOME_TYPES = [
  { value: 'retainer_sent', label: 'Retainer Sent', color: '#3b82f6' },
  { value: 'retainer_signed', label: 'Retainer Signed', color: '#22c55e' },
  { value: 'follow_up_required', label: 'Follow-Up Required', color: '#f59e0b' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
  { value: 'consultation_complete', label: 'Consultation Complete', color: '#8b5cf6' },
  { value: 'additional_docs_needed', label: 'Additional Docs Needed', color: '#f97316' },
  { value: 'referred_out', label: 'Referred Out', color: '#6b7280' },
  { value: 'no_show', label: 'No Show', color: '#ef4444' },
] as const

export const CHECK_IN_STATUSES = [
  { value: 'started', label: 'Started', color: '#3b82f6' },
  { value: 'identity_verified', label: 'Identity Verified', color: '#f59e0b' },
  { value: 'completed', label: 'Completed', color: '#22c55e' },
  { value: 'abandoned', label: 'Abandoned', color: '#6b7280' },
] as const

export const WORKFLOW_ACTION_SOURCES = [
  { value: 'kiosk', label: 'Kiosk' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'command_centre', label: 'Command Centre' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'api', label: 'API' },
] as const

export const FRONT_DESK_ACTIONS = [
  { value: 'mark_contacted', label: 'Mark as Contacted' },
  { value: 'log_call', label: 'Log Call' },
  { value: 'send_follow_up', label: 'Send Follow-Up' },
  { value: 'mark_no_answer', label: 'Mark No Answer' },
  { value: 'schedule_consultation', label: 'Schedule Consultation' },
] as const

// ── Call Logging ──────────────────────────────────────────────────────

export const CALL_DIRECTIONS = [
  { value: 'inbound', label: 'Inbound', icon: 'PhoneIncoming' },
  { value: 'outbound', label: 'Outbound', icon: 'PhoneOutgoing' },
] as const

export const CALL_OUTCOMES = [
  { value: 'connected', label: 'Connected', color: '#22c55e' },
  { value: 'no_answer', label: 'No Answer', color: '#f59e0b' },
  { value: 'voicemail', label: 'Left Voicemail', color: '#3b82f6' },
  { value: 'busy', label: 'Busy', color: '#ef4444' },
  { value: 'wrong_number', label: 'Wrong Number', color: '#6b7280' },
  { value: 'follow_up_needed', label: 'Follow-up Needed', color: '#8b5cf6' },
] as const

// ── Full Country List (ISO 3166-1) ──────────────────────────────────

export const FULL_COUNTRY_LIST = [
  { value: 'CA', label: 'Canada' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'PH', label: 'Philippines' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'BD', label: 'Bangladesh' },
  { value: 'IR', label: 'Iran' },
  { value: 'AF', label: 'Afghanistan' },
  { value: 'AL', label: 'Albania' },
  { value: 'DZ', label: 'Algeria' },
  { value: 'AD', label: 'Andorra' },
  { value: 'AO', label: 'Angola' },
  { value: 'AG', label: 'Antigua and Barbuda' },
  { value: 'AR', label: 'Argentina' },
  { value: 'AM', label: 'Armenia' },
  { value: 'AU', label: 'Australia' },
  { value: 'AT', label: 'Austria' },
  { value: 'AZ', label: 'Azerbaijan' },
  { value: 'BS', label: 'Bahamas' },
  { value: 'BH', label: 'Bahrain' },
  { value: 'BB', label: 'Barbados' },
  { value: 'BY', label: 'Belarus' },
  { value: 'BE', label: 'Belgium' },
  { value: 'BZ', label: 'Belize' },
  { value: 'BJ', label: 'Benin' },
  { value: 'BT', label: 'Bhutan' },
  { value: 'BO', label: 'Bolivia' },
  { value: 'BA', label: 'Bosnia and Herzegovina' },
  { value: 'BW', label: 'Botswana' },
  { value: 'BR', label: 'Brazil' },
  { value: 'BN', label: 'Brunei' },
  { value: 'BG', label: 'Bulgaria' },
  { value: 'BF', label: 'Burkina Faso' },
  { value: 'BI', label: 'Burundi' },
  { value: 'CV', label: 'Cabo Verde' },
  { value: 'KH', label: 'Cambodia' },
  { value: 'CM', label: 'Cameroon' },
  { value: 'CF', label: 'Central African Republic' },
  { value: 'TD', label: 'Chad' },
  { value: 'CL', label: 'Chile' },
  { value: 'CO', label: 'Colombia' },
  { value: 'KM', label: 'Comoros' },
  { value: 'CG', label: 'Congo' },
  { value: 'CD', label: 'Congo (DRC)' },
  { value: 'CR', label: 'Costa Rica' },
  { value: 'CI', label: "Côte d'Ivoire" },
  { value: 'HR', label: 'Croatia' },
  { value: 'CU', label: 'Cuba' },
  { value: 'CY', label: 'Cyprus' },
  { value: 'CZ', label: 'Czech Republic' },
  { value: 'DK', label: 'Denmark' },
  { value: 'DJ', label: 'Djibouti' },
  { value: 'DM', label: 'Dominica' },
  { value: 'DO', label: 'Dominican Republic' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'EG', label: 'Egypt' },
  { value: 'SV', label: 'El Salvador' },
  { value: 'GQ', label: 'Equatorial Guinea' },
  { value: 'ER', label: 'Eritrea' },
  { value: 'EE', label: 'Estonia' },
  { value: 'SZ', label: 'Eswatini' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'FJ', label: 'Fiji' },
  { value: 'FI', label: 'Finland' },
  { value: 'FR', label: 'France' },
  { value: 'GA', label: 'Gabon' },
  { value: 'GM', label: 'Gambia' },
  { value: 'GE', label: 'Georgia' },
  { value: 'DE', label: 'Germany' },
  { value: 'GH', label: 'Ghana' },
  { value: 'GR', label: 'Greece' },
  { value: 'GD', label: 'Grenada' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'GN', label: 'Guinea' },
  { value: 'GW', label: 'Guinea-Bissau' },
  { value: 'GY', label: 'Guyana' },
  { value: 'HT', label: 'Haiti' },
  { value: 'HN', label: 'Honduras' },
  { value: 'HU', label: 'Hungary' },
  { value: 'IS', label: 'Iceland' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'IE', label: 'Ireland' },
  { value: 'IL', label: 'Israel' },
  { value: 'IT', label: 'Italy' },
  { value: 'JM', label: 'Jamaica' },
  { value: 'JP', label: 'Japan' },
  { value: 'JO', label: 'Jordan' },
  { value: 'KZ', label: 'Kazakhstan' },
  { value: 'KE', label: 'Kenya' },
  { value: 'KI', label: 'Kiribati' },
  { value: 'KP', label: 'Korea (North)' },
  { value: 'KR', label: 'Korea (South)' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'KG', label: 'Kyrgyzstan' },
  { value: 'LA', label: 'Laos' },
  { value: 'LV', label: 'Latvia' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'LS', label: 'Lesotho' },
  { value: 'LR', label: 'Liberia' },
  { value: 'LY', label: 'Libya' },
  { value: 'LI', label: 'Liechtenstein' },
  { value: 'LT', label: 'Lithuania' },
  { value: 'LU', label: 'Luxembourg' },
  { value: 'MG', label: 'Madagascar' },
  { value: 'MW', label: 'Malawi' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'MV', label: 'Maldives' },
  { value: 'ML', label: 'Mali' },
  { value: 'MT', label: 'Malta' },
  { value: 'MH', label: 'Marshall Islands' },
  { value: 'MR', label: 'Mauritania' },
  { value: 'MU', label: 'Mauritius' },
  { value: 'MX', label: 'Mexico' },
  { value: 'FM', label: 'Micronesia' },
  { value: 'MD', label: 'Moldova' },
  { value: 'MC', label: 'Monaco' },
  { value: 'MN', label: 'Mongolia' },
  { value: 'ME', label: 'Montenegro' },
  { value: 'MA', label: 'Morocco' },
  { value: 'MZ', label: 'Mozambique' },
  { value: 'MM', label: 'Myanmar' },
  { value: 'NA', label: 'Namibia' },
  { value: 'NR', label: 'Nauru' },
  { value: 'NP', label: 'Nepal' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'NI', label: 'Nicaragua' },
  { value: 'NE', label: 'Niger' },
  { value: 'MK', label: 'North Macedonia' },
  { value: 'NO', label: 'Norway' },
  { value: 'OM', label: 'Oman' },
  { value: 'PW', label: 'Palau' },
  { value: 'PS', label: 'Palestine' },
  { value: 'PA', label: 'Panama' },
  { value: 'PG', label: 'Papua New Guinea' },
  { value: 'PY', label: 'Paraguay' },
  { value: 'PE', label: 'Peru' },
  { value: 'PL', label: 'Poland' },
  { value: 'PT', label: 'Portugal' },
  { value: 'QA', label: 'Qatar' },
  { value: 'RO', label: 'Romania' },
  { value: 'RU', label: 'Russia' },
  { value: 'RW', label: 'Rwanda' },
  { value: 'KN', label: 'Saint Kitts and Nevis' },
  { value: 'LC', label: 'Saint Lucia' },
  { value: 'VC', label: 'Saint Vincent and the Grenadines' },
  { value: 'WS', label: 'Samoa' },
  { value: 'SM', label: 'San Marino' },
  { value: 'ST', label: 'São Tomé and Príncipe' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'SN', label: 'Senegal' },
  { value: 'RS', label: 'Serbia' },
  { value: 'SC', label: 'Seychelles' },
  { value: 'SL', label: 'Sierra Leone' },
  { value: 'SG', label: 'Singapore' },
  { value: 'SK', label: 'Slovakia' },
  { value: 'SI', label: 'Slovenia' },
  { value: 'SB', label: 'Solomon Islands' },
  { value: 'SO', label: 'Somalia' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'SS', label: 'South Sudan' },
  { value: 'ES', label: 'Spain' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'SD', label: 'Sudan' },
  { value: 'SR', label: 'Suriname' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'SY', label: 'Syria' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'TJ', label: 'Tajikistan' },
  { value: 'TZ', label: 'Tanzania' },
  { value: 'TH', label: 'Thailand' },
  { value: 'TL', label: 'Timor-Leste' },
  { value: 'TG', label: 'Togo' },
  { value: 'TO', label: 'Tonga' },
  { value: 'TT', label: 'Trinidad and Tobago' },
  { value: 'TN', label: 'Tunisia' },
  { value: 'TR', label: 'Turkey' },
  { value: 'TM', label: 'Turkmenistan' },
  { value: 'TV', label: 'Tuvalu' },
  { value: 'UG', label: 'Uganda' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'UZ', label: 'Uzbekistan' },
  { value: 'VU', label: 'Vanuatu' },
  { value: 'VA', label: 'Vatican City' },
  { value: 'VE', label: 'Venezuela' },
  { value: 'VN', label: 'Vietnam' },
  { value: 'YE', label: 'Yemen' },
  { value: 'ZM', label: 'Zambia' },
  { value: 'ZW', label: 'Zimbabwe' },
] as const

// ── Work Permit Types ────────────────────────────────────────────────

export const WORK_PERMIT_TYPES = [
  { value: 'open_spousal', label: 'Open Work Permit (Spousal)' },
  { value: 'open_pgwp', label: 'Open Work Permit (PGWP)' },
  { value: 'open_bridging', label: 'Open Work Permit (Bridging)' },
  { value: 'open_vulnerable', label: 'Open Work Permit (Vulnerable Worker)' },
  { value: 'employer_specific', label: 'Employer-Specific Work Permit' },
  { value: 'lmia_based', label: 'LMIA-Based Work Permit' },
  { value: 'lmia_exempt_cusma', label: 'LMIA-Exempt (CUSMA / NAFTA)' },
  { value: 'lmia_exempt_ict', label: 'LMIA-Exempt (Intra-Company Transfer)' },
  { value: 'lmia_exempt_intl', label: 'LMIA-Exempt (International Agreement)' },
  { value: 'coop', label: 'Co-op Work Permit' },
  { value: 'significant_benefit', label: 'Significant Benefit Work Permit' },
  { value: 'sawp', label: 'Seasonal Agricultural Worker Program' },
  { value: 'caregiver', label: 'Caregiver Work Permit' },
  { value: 'other', label: 'Other' },
] as const

// ── Common Occupations ───────────────────────────────────────────────

export const COMMON_OCCUPATIONS = [
  'Software Developer',
  'Web Developer',
  'Data Analyst',
  'Accountant',
  'Financial Analyst',
  'Registered Nurse',
  'Physician',
  'Dentist',
  'Pharmacist',
  'Physiotherapist',
  'Lawyer',
  'Paralegal',
  'Teacher',
  'Professor',
  'Engineer (Civil)',
  'Engineer (Mechanical)',
  'Engineer (Electrical)',
  'Engineer (Software)',
  'Architect',
  'Project Manager',
  'Marketing Manager',
  'Human Resources Manager',
  'Administrative Assistant',
  'Customer Service Representative',
  'Sales Representative',
  'Chef / Cook',
  'Truck Driver',
  'Construction Worker',
  'Electrician',
  'Plumber',
  'Welder',
  'Carpenter',
  'Retail Salesperson',
  'Food Service Supervisor',
  'Security Guard',
  'Graphic Designer',
  'Social Worker',
  'Journalist',
  'Photographer',
  'General Labourer',
] as const


// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export const DOCUMENT_TEMPLATE_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#94a3b8' },
  { value: 'published', label: 'Published', color: '#22c55e' },
  { value: 'archived', label: 'Archived', color: '#6b7280' },
  { value: 'superseded', label: 'Superseded', color: '#a78bfa' },
] as const

export const DOCUMENT_INSTANCE_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#94a3b8' },
  { value: 'pending_review', label: 'Pending Review', color: '#f59e0b' },
  { value: 'approved', label: 'Approved', color: '#3b82f6' },
  { value: 'sent', label: 'Sent for Signature', color: '#8b5cf6' },
  { value: 'partially_signed', label: 'Partially Signed', color: '#a78bfa' },
  { value: 'signed', label: 'Signed', color: '#22c55e' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
  { value: 'voided', label: 'Voided', color: '#ef4444' },
  { value: 'superseded', label: 'Superseded', color: '#6b7280' },
] as const

export const DOCUMENT_SIGNATURE_REQUEST_STATUSES = [
  { value: 'pending', label: 'Pending', color: '#94a3b8' },
  { value: 'sent', label: 'Sent', color: '#3b82f6' },
  { value: 'opened', label: 'Opened', color: '#8b5cf6' },
  { value: 'partially_signed', label: 'Partially Signed', color: '#a78bfa' },
  { value: 'completed', label: 'Completed', color: '#22c55e' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
  { value: 'expired', label: 'Expired', color: '#6b7280' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
] as const

export const DOCUMENT_SIGNER_STATUSES = [
  { value: 'pending', label: 'Pending', color: '#94a3b8' },
  { value: 'sent', label: 'Sent', color: '#3b82f6' },
  { value: 'viewed', label: 'Viewed', color: '#8b5cf6' },
  { value: 'signed', label: 'Signed', color: '#22c55e' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
  { value: 'expired', label: 'Expired', color: '#6b7280' },
] as const

export const DOCUMENT_TEMPLATE_CATEGORIES = [
  { value: 'engagement', label: 'Engagement Letters' },
  { value: 'disengagement', label: 'Disengagement Letters' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'general', label: 'General' },
] as const

export const DOCUMENT_FIELD_SOURCES = [
  { value: 'matter', label: 'Matter' },
  { value: 'contact', label: 'Contact' },
  { value: 'billing', label: 'Billing' },
  { value: 'tenant', label: 'Firm / Tenant' },
  { value: 'user', label: 'User / Lawyer' },
  { value: 'custom', label: 'Custom / Manual' },
] as const

export const DOCUMENT_FIELD_TRANSFORMS = [
  { value: 'none', label: 'None' },
  { value: 'date_long', label: 'Date (March 8, 2026)' },
  { value: 'date_short', label: 'Date (2026-03-08)' },
  { value: 'currency', label: 'Currency ($1,234.56)' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'titlecase', label: 'Title Case' },
] as const

export const SIGNATURE_PROVIDERS = [
  { value: 'manual', label: 'Manual Tracking' },
  { value: 'docusign', label: 'DocuSign' },
  { value: 'hellosign', label: 'Dropbox Sign' },
] as const

export const SIGNER_ROLES = [
  { value: 'client', label: 'Client' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'witness', label: 'Witness' },
  { value: 'firm_representative', label: 'Firm Representative' },
  { value: 'guarantor', label: 'Guarantor' },
] as const

export const DOCUMENT_WORKFLOW_TRIGGERS = [
  { value: 'matter_created', label: 'Matter Created' },
  { value: 'stage_changed', label: 'Stage Changed' },
  { value: 'lead_converted', label: 'Lead Converted' },
  { value: 'manual', label: 'Manual Only' },
] as const

export const DOCUMENT_ARTIFACT_TYPES = [
  { value: 'generated_draft', label: 'Generated Draft' },
  { value: 'approved_copy', label: 'Approved Copy' },
  { value: 'sent_copy', label: 'Sent Copy' },
  { value: 'signed_copy', label: 'Signed Copy' },
  { value: 'countersigned_copy', label: 'Countersigned Copy' },
] as const

export const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does Not Equal' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
  { value: 'in_list', label: 'Is One Of' },
  { value: 'truthy', label: 'Is True' },
  { value: 'falsy', label: 'Is False' },
] as const
