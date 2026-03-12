// ============================================================================
// Intake Questionnaire Presets — Visitor Visa & Extension
// ============================================================================
// Pre-built question sets for immigration intake questionnaires.
// Uses the IntakeField format so they can be stored as intake_forms.
// Each preset includes English labels with French translations in description.
// ============================================================================

import type { IntakeField, FormSection } from '@/lib/types/intake-field'

export interface QuestionnairePreset {
  key: string
  label: string
  description: string
  sections: FormSection[]
  fields: IntakeField[]
}

// ─── Helper ──────────────────────────────────────────────────────────────────

let fieldCounter = 0
function fid(): string {
  return `q_${++fieldCounter}`
}

// ─── Visitor Visa Sections ───────────────────────────────────────────────────

const VISITOR_VISA_SECTIONS: FormSection[] = [
  { id: 'personal', title: 'Personal Information', description: 'Basic identity details as shown on your passport.', sort_order: 1 },
  { id: 'contact', title: 'Contact Information', description: 'How we can reach you.', sort_order: 2 },
  { id: 'travel', title: 'Travel Details', description: 'Your planned visit to Canada.', sort_order: 3 },
  { id: 'employment', title: 'Employment & Education', description: 'Your current occupation and work details.', sort_order: 4 },
  { id: 'financial', title: 'Financial Information', description: 'Details about your financial situation.', sort_order: 5 },
  { id: 'family', title: 'Family Information', description: 'Details about your immediate family.', sort_order: 6 },
  { id: 'host', title: 'Host / Invitation in Canada', description: 'If someone in Canada invited you.', sort_order: 7 },
  { id: 'background', title: 'Background Questions', description: 'Important background declarations.', sort_order: 8 },
]

// Reset counter before each preset
function resetCounter() { fieldCounter = 0 }

function visitorVisaFields(): IntakeField[] {
  resetCounter()
  return [
    // ── Personal Information ─────────────────────────────────────
    { id: fid(), field_type: 'text', label: 'Full Legal Name (as on passport)', placeholder: 'e.g. John Michael Smith', is_required: true, sort_order: 1, section_id: 'personal', mapping: 'first_name' },
    { id: fid(), field_type: 'date', label: 'Date of Birth', is_required: true, sort_order: 2, section_id: 'personal' },
    { id: fid(), field_type: 'select', label: 'Gender', is_required: true, sort_order: 3, section_id: 'personal', options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Another gender', value: 'other' },
    ]},
    { id: fid(), field_type: 'text', label: 'Country of Citizenship / Nationality', placeholder: 'e.g. India', is_required: true, sort_order: 4, section_id: 'personal' },
    { id: fid(), field_type: 'text', label: 'Country of Birth', placeholder: 'e.g. India', is_required: true, sort_order: 5, section_id: 'personal' },
    { id: fid(), field_type: 'text', label: 'City of Birth', placeholder: 'e.g. Mumbai', is_required: true, sort_order: 6, section_id: 'personal' },
    { id: fid(), field_type: 'select', label: 'Marital Status', is_required: true, sort_order: 7, section_id: 'personal', options: [
      { label: 'Single', value: 'single' },
      { label: 'Married', value: 'married' },
      { label: 'Common-Law', value: 'common_law' },
      { label: 'Divorced', value: 'divorced' },
      { label: 'Separated', value: 'separated' },
      { label: 'Widowed', value: 'widowed' },
    ]},
    { id: fid(), field_type: 'text', label: 'Passport Number', placeholder: 'e.g. A12345678', is_required: true, sort_order: 8, section_id: 'personal' },
    { id: fid(), field_type: 'date', label: 'Passport Issue Date', is_required: true, sort_order: 9, section_id: 'personal' },
    { id: fid(), field_type: 'date', label: 'Passport Expiry Date', is_required: true, sort_order: 10, section_id: 'personal' },
    { id: fid(), field_type: 'text', label: 'National ID Number (if applicable)', placeholder: 'Leave blank if not applicable', is_required: false, sort_order: 11, section_id: 'personal' },

    // ── Contact Information ──────────────────────────────────────
    { id: fid(), field_type: 'email', label: 'Email Address', placeholder: 'your@email.com', is_required: true, sort_order: 12, section_id: 'contact', mapping: 'email_primary' },
    { id: fid(), field_type: 'phone', label: 'Phone Number (with country code)', placeholder: '+1 514 555 0123', is_required: true, sort_order: 13, section_id: 'contact', mapping: 'phone_primary' },
    { id: fid(), field_type: 'textarea', label: 'Current Residential Address', placeholder: 'Street address, city, province/state, postal code, country', description: 'Full address where you currently live.', is_required: true, sort_order: 14, section_id: 'contact' },
    { id: fid(), field_type: 'text', label: 'Country of Current Residence', placeholder: 'e.g. India', is_required: true, sort_order: 15, section_id: 'contact' },

    // ── Travel Details ───────────────────────────────────────────
    { id: fid(), field_type: 'select', label: 'Purpose of Visit to Canada', is_required: true, sort_order: 16, section_id: 'travel', options: [
      { label: 'Tourism / Vacation', value: 'tourism' },
      { label: 'Visiting Family', value: 'family_visit' },
      { label: 'Visiting Friends', value: 'friends_visit' },
      { label: 'Business Meeting / Conference', value: 'business' },
      { label: 'Medical Treatment', value: 'medical' },
      { label: 'Attending an Event', value: 'event' },
      { label: 'Transit through Canada', value: 'transit' },
      { label: 'Other', value: 'other' },
    ], allow_other: true },
    { id: fid(), field_type: 'textarea', label: 'Describe the Purpose of Your Visit', placeholder: 'Please explain in detail why you want to visit Canada, what you plan to do, and where you plan to go.', is_required: true, sort_order: 17, section_id: 'travel' },
    { id: fid(), field_type: 'date', label: 'Intended Date of Arrival in Canada', is_required: true, sort_order: 18, section_id: 'travel' },
    { id: fid(), field_type: 'date', label: 'Intended Date of Departure from Canada', is_required: true, sort_order: 19, section_id: 'travel' },
    { id: fid(), field_type: 'text', label: 'Address Where You Will Stay in Canada', placeholder: 'Hotel name and address, or host address', is_required: true, sort_order: 20, section_id: 'travel' },
    { id: fid(), field_type: 'boolean', label: 'Have you visited Canada before?', is_required: true, sort_order: 21, section_id: 'travel' },
    { id: fid(), field_type: 'textarea', label: 'Previous Visits to Canada (dates and purpose)', placeholder: 'e.g. June 2022 - Tourism, 2 weeks', is_required: false, sort_order: 22, section_id: 'travel', condition: { field_id: 'q_21', operator: 'is_truthy' } },
    { id: fid(), field_type: 'textarea', label: 'Countries You Have Travelled to in the Last 5 Years', placeholder: 'List countries and approximate dates', is_required: false, sort_order: 23, section_id: 'travel' },

    // ── Employment & Education ───────────────────────────────────
    { id: fid(), field_type: 'select', label: 'Current Employment Status', is_required: true, sort_order: 24, section_id: 'employment', options: [
      { label: 'Employed (Full-time)', value: 'employed_ft' },
      { label: 'Employed (Part-time)', value: 'employed_pt' },
      { label: 'Self-Employed / Business Owner', value: 'self_employed' },
      { label: 'Student', value: 'student' },
      { label: 'Retired', value: 'retired' },
      { label: 'Unemployed', value: 'unemployed' },
      { label: 'Homemaker', value: 'homemaker' },
    ]},
    { id: fid(), field_type: 'text', label: 'Employer / Company Name', placeholder: 'e.g. Acme Corporation', is_required: false, sort_order: 25, section_id: 'employment' },
    { id: fid(), field_type: 'text', label: 'Job Title / Position', placeholder: 'e.g. Software Engineer', is_required: false, sort_order: 26, section_id: 'employment' },
    { id: fid(), field_type: 'text', label: 'Employer Address', placeholder: 'City, Country', is_required: false, sort_order: 27, section_id: 'employment' },
    { id: fid(), field_type: 'date', label: 'Employment Start Date', is_required: false, sort_order: 28, section_id: 'employment' },
    { id: fid(), field_type: 'text', label: 'Annual Salary / Income', placeholder: 'e.g. 60,000 USD', is_required: false, sort_order: 29, section_id: 'employment' },
    { id: fid(), field_type: 'text', label: 'School / University Name (if student)', placeholder: 'Leave blank if not applicable', is_required: false, sort_order: 30, section_id: 'employment' },
    { id: fid(), field_type: 'text', label: 'Program of Study (if student)', placeholder: 'e.g. Bachelor of Computer Science', is_required: false, sort_order: 31, section_id: 'employment' },

    // ── Financial Information ────────────────────────────────────
    { id: fid(), field_type: 'select', label: 'Who Is Funding This Trip?', is_required: true, sort_order: 32, section_id: 'financial', options: [
      { label: 'Self (own funds)', value: 'self' },
      { label: 'Spouse / Partner', value: 'spouse' },
      { label: 'Parent / Family Member', value: 'family' },
      { label: 'Host in Canada', value: 'host' },
      { label: 'Employer', value: 'employer' },
      { label: 'Other', value: 'other' },
    ], allow_other: true },
    { id: fid(), field_type: 'text', label: 'Approximate Savings / Bank Balance', placeholder: 'e.g. 20,000 USD', description: 'This helps us understand your financial readiness.', is_required: false, sort_order: 33, section_id: 'financial' },
    { id: fid(), field_type: 'boolean', label: 'Do you own any property (house, land, etc.)?', is_required: true, sort_order: 34, section_id: 'financial' },
    { id: fid(), field_type: 'textarea', label: 'Property Details (if applicable)', placeholder: 'Type of property, location, approximate value', is_required: false, sort_order: 35, section_id: 'financial', condition: { field_id: 'q_34', operator: 'is_truthy' } },

    // ── Family Information ───────────────────────────────────────
    { id: fid(), field_type: 'text', label: 'Spouse / Partner Full Name', placeholder: 'Leave blank if not applicable', is_required: false, sort_order: 36, section_id: 'family' },
    { id: fid(), field_type: 'date', label: 'Spouse / Partner Date of Birth', is_required: false, sort_order: 37, section_id: 'family' },
    { id: fid(), field_type: 'text', label: 'Spouse / Partner Nationality', is_required: false, sort_order: 38, section_id: 'family' },
    { id: fid(), field_type: 'boolean', label: 'Is your spouse / partner travelling with you?', is_required: false, sort_order: 39, section_id: 'family' },
    { id: fid(), field_type: 'number', label: 'Number of Dependent Children', placeholder: '0', is_required: false, sort_order: 40, section_id: 'family' },
    { id: fid(), field_type: 'textarea', label: 'Children Details (name, DOB, travelling with you?)', placeholder: 'e.g. Jane Smith, 2015-03-20, Yes', is_required: false, sort_order: 41, section_id: 'family' },
    { id: fid(), field_type: 'boolean', label: 'Do you have any family members currently in Canada?', is_required: true, sort_order: 42, section_id: 'family' },
    { id: fid(), field_type: 'textarea', label: 'Family Members in Canada (name, relationship, immigration status)', placeholder: 'e.g. John Smith, Brother, Permanent Resident', is_required: false, sort_order: 43, section_id: 'family', condition: { field_id: 'q_42', operator: 'is_truthy' } },

    // ── Host / Invitation ────────────────────────────────────────
    { id: fid(), field_type: 'boolean', label: 'Do you have a host or someone inviting you to Canada?', is_required: true, sort_order: 44, section_id: 'host' },
    { id: fid(), field_type: 'text', label: 'Host Full Name', is_required: false, sort_order: 45, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' } },
    { id: fid(), field_type: 'text', label: 'Relationship to Host', placeholder: 'e.g. Brother, Friend, Business Partner', is_required: false, sort_order: 46, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' } },
    { id: fid(), field_type: 'text', label: 'Host Address in Canada', is_required: false, sort_order: 47, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' } },
    { id: fid(), field_type: 'select', label: 'Host Immigration Status in Canada', is_required: false, sort_order: 48, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' }, options: [
      { label: 'Canadian Citizen', value: 'citizen' },
      { label: 'Permanent Resident', value: 'pr' },
      { label: 'Temporary Resident (Work/Study Permit)', value: 'temp' },
      { label: 'Other', value: 'other' },
    ], allow_other: true },
    { id: fid(), field_type: 'phone', label: 'Host Phone Number', is_required: false, sort_order: 49, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' } },
    { id: fid(), field_type: 'email', label: 'Host Email Address', is_required: false, sort_order: 50, section_id: 'host', condition: { field_id: 'q_44', operator: 'is_truthy' } },

    // ── Background Questions ─────────────────────────────────────
    { id: fid(), field_type: 'boolean', label: 'Have you ever been refused a visa or permit to any country?', is_required: true, sort_order: 51, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Visa Refusal Details (country, date, reason if known)', is_required: false, sort_order: 52, section_id: 'background', condition: { field_id: 'q_51', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have you ever been denied entry to or deported from any country?', is_required: true, sort_order: 53, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Denial / Deportation Details', is_required: false, sort_order: 54, section_id: 'background', condition: { field_id: 'q_53', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have you ever been convicted of a criminal offence in any country?', is_required: true, sort_order: 55, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Criminal Conviction Details', is_required: false, sort_order: 56, section_id: 'background', condition: { field_id: 'q_55', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Do you have any serious medical conditions?', is_required: true, sort_order: 57, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Medical Condition Details', is_required: false, sort_order: 58, section_id: 'background', condition: { field_id: 'q_57', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have you ever served in the military, militia, or civil defence?', is_required: true, sort_order: 59, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Military Service Details (country, branch, dates)', is_required: false, sort_order: 60, section_id: 'background', condition: { field_id: 'q_59', operator: 'is_truthy' } },
    { id: fid(), field_type: 'textarea', label: 'Is there anything else you would like us to know?', placeholder: 'Any additional information relevant to your application.', is_required: false, sort_order: 61, section_id: 'background' },
  ]
}

// ─── Extension / Renewal Sections ────────────────────────────────────────────

const EXTENSION_SECTIONS: FormSection[] = [
  { id: 'personal', title: 'Personal Information', description: 'Confirm your identity details.', sort_order: 1 },
  { id: 'contact', title: 'Contact Information', description: 'Your current contact details in Canada.', sort_order: 2 },
  { id: 'current_status', title: 'Current Immigration Status', description: 'Details about your current status in Canada.', sort_order: 3 },
  { id: 'extension', title: 'Extension Details', description: 'Why you need to extend your stay.', sort_order: 4 },
  { id: 'financial', title: 'Financial Information', description: 'How you will support yourself during the extension.', sort_order: 5 },
  { id: 'background', title: 'Background Questions', description: 'Important declarations.', sort_order: 6 },
]

function extensionFields(): IntakeField[] {
  resetCounter()
  return [
    // ── Personal Information ─────────────────────────────────────
    { id: fid(), field_type: 'text', label: 'Full Legal Name (as on passport)', placeholder: 'e.g. John Michael Smith', is_required: true, sort_order: 1, section_id: 'personal', mapping: 'first_name' },
    { id: fid(), field_type: 'date', label: 'Date of Birth', is_required: true, sort_order: 2, section_id: 'personal' },
    { id: fid(), field_type: 'text', label: 'Country of Citizenship', is_required: true, sort_order: 3, section_id: 'personal' },
    { id: fid(), field_type: 'text', label: 'Passport Number', is_required: true, sort_order: 4, section_id: 'personal' },
    { id: fid(), field_type: 'date', label: 'Passport Expiry Date', is_required: true, sort_order: 5, section_id: 'personal' },
    { id: fid(), field_type: 'select', label: 'Marital Status', is_required: true, sort_order: 6, section_id: 'personal', options: [
      { label: 'Single', value: 'single' },
      { label: 'Married', value: 'married' },
      { label: 'Common-Law', value: 'common_law' },
      { label: 'Divorced', value: 'divorced' },
      { label: 'Separated', value: 'separated' },
      { label: 'Widowed', value: 'widowed' },
    ]},

    // ── Contact Information ──────────────────────────────────────
    { id: fid(), field_type: 'email', label: 'Email Address', is_required: true, sort_order: 7, section_id: 'contact', mapping: 'email_primary' },
    { id: fid(), field_type: 'phone', label: 'Phone Number', placeholder: '+1 514 555 0123', is_required: true, sort_order: 8, section_id: 'contact', mapping: 'phone_primary' },
    { id: fid(), field_type: 'textarea', label: 'Current Address in Canada', placeholder: 'Street, City, Province, Postal Code', is_required: true, sort_order: 9, section_id: 'contact' },

    // ── Current Immigration Status ───────────────────────────────
    { id: fid(), field_type: 'select', label: 'Current Status in Canada', is_required: true, sort_order: 10, section_id: 'current_status', options: [
      { label: 'Visitor (TRV / Visitor Visa)', value: 'visitor' },
      { label: 'Visitor Record', value: 'visitor_record' },
      { label: 'Implied Status (applied before expiry)', value: 'implied' },
      { label: 'Super Visa', value: 'super_visa' },
      { label: 'Other', value: 'other' },
    ], allow_other: true },
    { id: fid(), field_type: 'date', label: 'Date You Entered Canada', is_required: true, sort_order: 11, section_id: 'current_status' },
    { id: fid(), field_type: 'date', label: 'Current Status Expiry Date', description: 'Check your passport stamp or visitor record for this date.', is_required: true, sort_order: 12, section_id: 'current_status' },
    { id: fid(), field_type: 'text', label: 'UCI Number (if known)', placeholder: 'e.g. 1234-5678', is_required: false, sort_order: 13, section_id: 'current_status' },
    { id: fid(), field_type: 'text', label: 'Application / File Number (if applicable)', is_required: false, sort_order: 14, section_id: 'current_status' },
    { id: fid(), field_type: 'boolean', label: 'Have you applied for any other immigration application currently pending?', is_required: true, sort_order: 15, section_id: 'current_status' },
    { id: fid(), field_type: 'textarea', label: 'Pending Application Details', is_required: false, sort_order: 16, section_id: 'current_status', condition: { field_id: 'q_15', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have you worked or studied in Canada during this visit without authorization?', is_required: true, sort_order: 17, section_id: 'current_status' },

    // ── Extension Details ────────────────────────────────────────
    { id: fid(), field_type: 'textarea', label: 'Why Do You Need to Extend Your Stay?', placeholder: 'Please explain in detail the reason you need more time in Canada.', is_required: true, sort_order: 18, section_id: 'extension' },
    { id: fid(), field_type: 'date', label: 'Requested New Departure Date', description: 'When do you plan to leave Canada?', is_required: true, sort_order: 19, section_id: 'extension' },
    { id: fid(), field_type: 'boolean', label: 'Do you have a return flight booked?', is_required: true, sort_order: 20, section_id: 'extension' },
    { id: fid(), field_type: 'date', label: 'Return Flight Date (if booked)', is_required: false, sort_order: 21, section_id: 'extension', condition: { field_id: 'q_20', operator: 'is_truthy' } },
    { id: fid(), field_type: 'textarea', label: 'Where Will You Stay During the Extension?', placeholder: 'Address and arrangement details (hotel, family, etc.)', is_required: true, sort_order: 22, section_id: 'extension' },

    // ── Financial Information ────────────────────────────────────
    { id: fid(), field_type: 'select', label: 'How Will You Support Yourself During the Extension?', is_required: true, sort_order: 23, section_id: 'financial', options: [
      { label: 'Personal savings', value: 'savings' },
      { label: 'Support from family in Canada', value: 'family_canada' },
      { label: 'Support from family abroad', value: 'family_abroad' },
      { label: 'Other', value: 'other' },
    ], allow_other: true },
    { id: fid(), field_type: 'text', label: 'Approximate Funds Available', placeholder: 'e.g. $5,000 CAD', is_required: false, sort_order: 24, section_id: 'financial' },
    { id: fid(), field_type: 'boolean', label: 'Do you have Canadian medical insurance for the extension period?', is_required: true, sort_order: 25, section_id: 'financial' },

    // ── Background Questions ─────────────────────────────────────
    { id: fid(), field_type: 'boolean', label: 'Have you ever been refused a visa, permit, or entry to any country?', is_required: true, sort_order: 26, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Refusal Details', is_required: false, sort_order: 27, section_id: 'background', condition: { field_id: 'q_26', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have you been convicted of a criminal offence?', is_required: true, sort_order: 28, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'Criminal Conviction Details', is_required: false, sort_order: 29, section_id: 'background', condition: { field_id: 'q_28', operator: 'is_truthy' } },
    { id: fid(), field_type: 'boolean', label: 'Have your circumstances changed since your last application (job, marital status, etc.)?', is_required: true, sort_order: 30, section_id: 'background' },
    { id: fid(), field_type: 'textarea', label: 'What Has Changed?', is_required: false, sort_order: 31, section_id: 'background', condition: { field_id: 'q_30', operator: 'is_truthy' } },
    { id: fid(), field_type: 'textarea', label: 'Is there anything else you would like us to know?', is_required: false, sort_order: 32, section_id: 'background' },
  ]
}

// ─── Exported Presets ────────────────────────────────────────────────────────

export const VISITOR_VISA_QUESTIONNAIRE: QuestionnairePreset = {
  key: 'visitor_visa',
  label: 'Visitor Visa Questionnaire',
  description: 'Comprehensive intake questions for Temporary Resident Visa (TRV) applications.',
  sections: VISITOR_VISA_SECTIONS,
  fields: visitorVisaFields(),
}

export const EXTENSION_QUESTIONNAIRE: QuestionnairePreset = {
  key: 'extension',
  label: 'Extension / Renewal Questionnaire',
  description: 'Intake questions for visitor status extension and renewal applications.',
  sections: EXTENSION_SECTIONS,
  fields: extensionFields(),
}

export const QUESTIONNAIRE_PRESETS: QuestionnairePreset[] = [
  VISITOR_VISA_QUESTIONNAIRE,
  EXTENSION_QUESTIONNAIRE,
]
