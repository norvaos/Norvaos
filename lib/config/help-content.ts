/**
 * Central help content dictionary for the HelperTip component.
 * All field-level help text is maintained here for consistency.
 * Use Canadian English spelling throughout.
 */
export const HELP_CONTENT = {
  // ─── Matter Fields ───
  'matter.estimated_value': 'The total estimated cost for this matter including legal fees, government fees, and disbursements. When a fee template is applied, this is auto-calculated. To edit the default amounts, go to Settings → Fee Templates and modify the template for this matter type.',
  'matter.fee_template': 'Fee templates define the standard pricing for each case type. The default template is auto-selected when you choose a matter type. To create or edit templates, go to Settings → Fee Templates.',
  'matter.billing_type': 'Controls how this matter is billed. Flat fee charges a single amount; hourly tracks time entries against a rate.',
  'matter.practice_area': 'The practice area determines which matter types, stage pipelines, and deadline catalogues are available.',
  'matter.matter_type': 'The matter type defines the workflow stages, deadline types, and custom fields for this file.',
  'matter.priority': 'Sets the urgency level. High and urgent matters are flagged in the dashboard widgets.',
  'matter.risk_level': 'Risk assessment for this matter. Critical and high risk files require resolution before closure.',
  'matter.visibility': 'Controls who can see this matter. "Team" restricts access to assigned team members only.',
  'matter.responsible_lawyer': 'The lawyer with primary carriage of this matter. Receives all deadline alerts and billing notifications.',
  'matter.status': 'Current lifecycle state. Active matters can be worked on; closed matters are read-only.',
  'matter.readiness_score': 'This score represents the overall completion of mandatory IRCC data fields for this matter type.',
  'matter.applicant_location': 'If the applicant is outside Canada, legal services are zero-rated (0% tax) under Section 23, Part V, Schedule VI of the Excise Tax Act. Government fees (IRCC) are always tax-exempt.',
  'matter.client_province': 'Tax is calculated based on where your client is located, not your firm\'s location. This follows CRA place-of-supply rules for professional services.',

  // ─── Trust & Financial ───
  'trust.deposit': 'Funds held in trust on behalf of the client. Must match the bank wire or cheque amount exactly. Subject to Law Society By-Law 9 requirements.',
  'trust.disbursement': 'Funds paid out of the client trust account. Requires approval and a documented reason.',
  'trust.balance': 'Net trust balance for this matter. Must be zero before the matter can be closed.',
  'billing.hourly_rate': 'The rate per hour charged for time entries on this matter. Can be overridden per team member.',
  'billing.retainer': 'An advance payment held on account. Drawn down as invoices are generated.',
  'billing.trust_account': 'Regulatory-compliant ledger. All transactions are immutably logged for audit purposes.',

  // ─── Immigration / IRCC ───
  'ircc.uci_number': '8 or 10-digit Unique Client Identifier assigned by IRCC. Format: 00-0000-0000.',
  'ircc.application_number': 'The IRCC application or file number. Found on correspondence from IRCC.',
  'ircc.person_scope': 'Identifies whether this matter covers the principal applicant, dependants, or the full family unit.',

  // ─── Contact Fields ───
  'contact.conflict_check': 'Indicates whether a conflict of interest search has been completed for this contact.',
  'contact.engagement_score': 'A calculated score reflecting how actively this contact interacts with the firm.',
  'contact.type': 'Whether this contact is an individual person or an organisation (company, government body, etc.).',

  // ─── Onboarding / Signup ───
  'onboarding.firm_name': 'This name will appear on your invoices, retainers, and client portal. You can edit this in Settings later.',
  'onboarding.membership_no': 'Optional. Enter your Law Society or College ID (e.g. LSO, LSBC, CICC) or licence number (e.g. RCICxxxxx). Providing this now allows NorvaOS to auto-populate your IRCC representation forms (Use of Representative, IMM 5476) immediately.',
  'onboarding.email_professional': 'Use your firm email. This account will have administrative "Owner" privileges for your firm\'s data.',
  'onboarding.first_name': 'Your first name as it appears on your Law Society membership.',
  'onboarding.last_name': 'Your surname as it appears on your Law Society membership.',
  'onboarding.password': 'Minimum 8 characters. Use a mix of letters, numbers, and symbols for security.',
  'onboarding.email_verification': 'We require email verification to ensure the security of your legal data and to comply with regulatory digital identity standards.',

  // ─── Dashboard Widgets ───
  'dashboard.todays_appointments': 'Shows all appointments scheduled for today across your matters. Click any appointment to open the matter detail.',
  'dashboard.upcoming_deadlines': 'Deadlines in the next 14 days, including both IRCC-mandated dates (e.g. UCI responses, PRRA submissions) and firm-specific milestones. Red items are overdue. Sorted by urgency.',
  'dashboard.active_files_by_stage': 'Breaks down your active matters by their current pipeline stage. Helps identify bottlenecks.',
  'dashboard.risk_overview': 'Matters flagged as high or critical risk. These require attention before they can be closed.',

  // ─── Settings ───
  'settings.practice_area_colour': 'The accent colour used throughout the UI when filtering by this practice area.',
  'settings.matter_stage_sla': 'The number of days a matter should remain in this stage before triggering an alert.',
  'settings.deadline_type': 'A reusable deadline template. Attach to matter types for automatic deadline creation.',
  'settings.expiry_rules': 'Standard Expiry Rules (60, 30, 14, 7 days) are automatically active for all new firms. Custom rule editing will be available in the next update.',

  // ─── Deadlines ───
  'matter.deadlines': 'All deadlines are automatically monitored. You will receive email and in-app reminders at 30, 14, and 7 days before the due date.',
} as const

export type HelpContentKey = keyof typeof HELP_CONTENT
