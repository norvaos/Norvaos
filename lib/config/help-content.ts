/**
 * Central help content dictionary for the HelperTip component.
 * All field-level help text is maintained here for consistency.
 * Use Canadian English spelling throughout.
 * Written at a Grade 10 reading level - clear, simple, no jargon.
 */
export const HELP_CONTENT = {
  // ─── Matter Fields ───
  'matter.estimated_value': 'The total expected cost for this case, including your legal fees and any government fees. If you use a fee template, this fills in automatically. You can change it in Settings → Fee Templates.',
  'matter.fee_template': 'Fee templates set the standard price for each case type. One is auto-selected when you pick a matter type. Create or edit them in Settings → Fee Templates.',
  'matter.billing_type': 'How you charge for this case. "Flat fee" means one fixed price. "Hourly" means you track your time and bill by the hour.',
  'matter.practice_area': 'The area of law this case falls under (e.g. Immigration, Family Law). This controls which case types and workflows are available.',
  'matter.matter_type': 'The specific type of case (e.g. Spousal Sponsorship, Divorce). This sets up the workflow steps, deadlines, and forms.',
  'matter.priority': 'How urgent this case is. High and urgent cases are highlighted on your dashboard so you see them first.',
  'matter.risk_level': 'How risky this case is. Critical or high-risk cases need to be resolved before you can close the file.',
  'matter.visibility': 'Who can see this case. "Team" means only people assigned to this case can view it.',
  'matter.responsible_lawyer': 'The lead lawyer on this case. They get all deadline reminders and billing updates.',
  'matter.status': 'Where this case is in its life cycle. Active cases can be worked on. Closed cases are locked and read-only.',
  'matter.readiness_score': 'A 0-100 score showing how complete this file is. It checks documents, metadata, and client activity. 100 means ready to submit.',
  'matter.applicant_location': 'If your client is outside Canada, legal fees may be tax-exempt. Government filing fees are always tax-free.',
  'matter.client_province': 'Tax is based on where your client lives, not where your office is. This sets the correct tax rate automatically.',

  // ─── Trust & Financial ───
  'trust.deposit': 'Money held in trust for the client. The amount must match the bank transfer or cheque exactly.',
  'trust.disbursement': 'Money paid out from the client\'s trust account. You need approval and a reason for each payment.',
  'trust.balance': 'The current trust balance for this case. It must be zero before you can close the file.',
  'billing.hourly_rate': 'The rate charged per hour for work on this case. You can set a different rate for each team member.',
  'billing.retainer': 'An upfront payment from the client, held on account. It gets used up as you send invoices.',
  'billing.trust_account': 'A secure record of all trust transactions. Every entry is permanently logged and cannot be changed.',

  // ─── Immigration / IRCC ───
  'ircc.uci_number': 'Your client\'s Unique Client Identifier from IRCC. It\'s 8 or 10 digits long (format: 00-0000-0000).',
  'ircc.application_number': 'The application or file number from IRCC. You\'ll find this on letters from IRCC.',
  'ircc.person_scope': 'Whether this case covers just the main applicant, their dependants, or the whole family.',

  // ─── Contact Fields ───
  'contact.conflict_check': 'Shows whether you\'ve checked for conflicts of interest with this contact.',
  'contact.engagement_score': 'A score showing how active this contact is with your firm (e.g. portal logins, document uploads).',
  'contact.type': 'Whether this is a person or a company/organisation.',

  // ─── Onboarding / Signup ───
  'onboarding.firm_name': 'Your firm\'s name. This appears on invoices, agreements, and your client portal. You can change it later in Settings.',
  'onboarding.membership_no': 'Optional. Your licence or membership number from your Law Society, College, or regulatory body (e.g. RCIC, LSO, LSBC). Adding this now lets the system auto-fill your representation forms.',
  'onboarding.email_professional': 'Use your firm email address. This account will have full admin access to your firm\'s data.',
  'onboarding.first_name': 'Your first name as it appears on your professional licence.',
  'onboarding.last_name': 'Your last name as it appears on your professional licence.',
  'onboarding.password': 'At least 8 characters. Use a mix of letters, numbers, and symbols to keep your account secure.',
  'onboarding.email_verification': 'We verify your email to protect your legal data and meet digital security standards.',

  // ─── Dashboard Widgets ───
  'dashboard.todays_appointments': 'All your appointments for today. Click any one to open the case it belongs to.',
  'dashboard.upcoming_deadlines': 'Deadlines coming up in the next 14 days. Red items are overdue. Sorted by urgency so the most critical appear first.',
  'dashboard.active_files_by_stage': 'A breakdown of your active cases by workflow stage. Helps you spot bottlenecks.',
  'dashboard.risk_overview': 'Cases flagged as high or critical risk. These need attention before they can be closed.',

  // ─── Settings ───
  'settings.practice_area_colour': 'The accent colour used throughout the app when you filter by this practice area.',
  'settings.matter_stage_sla': 'How many days a case should stay in this stage before you get an alert.',
  'settings.deadline_type': 'A reusable deadline template. Attach it to case types so deadlines are created automatically.',
  'settings.expiry_rules': 'Standard expiry reminders (60, 30, 14, and 7 days before) are turned on automatically for all firms.',

  // ─── Deadlines ───
  'matter.deadlines': 'All deadlines are tracked automatically. You\'ll get email and in-app reminders at 30, 14, and 7 days before each due date.',
} as const

export type HelpContentKey = keyof typeof HELP_CONTENT
