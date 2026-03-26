/**
 * One-time seed script: Create pipelines, stages, and document slot
 * templates for all immigration matter types.
 *
 * Usage:  npx tsx scripts/seed-immigration-pipelines.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Manually parse .env.local
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL']
const key = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

interface StageInput {
  name: string
  color: string
  sort_order: number
  is_terminal: boolean
  auto_close_matter: boolean
  sla_days: number | null
}

interface DocSlotInput {
  slot_name: string
  slot_slug: string
  category: string
  person_role_scope: string
  is_required: boolean
  accepted_file_types: string[]
  sort_order: number
}

// ── Immigration pipeline + stage definitions ────────────────────────
const IMMIGRATION_PIPELINES: Record<string, { pipelineName: string; stages: StageInput[]; docs: DocSlotInput[] }> = {
  'Spousal Sponsorship': {
    pipelineName: 'Spousal Sponsorship Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Relationship Evidence Gathering',  color: '#f59e0b', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 14 },
      { name: 'Application Preparation',          color: '#06b6d4', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 14 },
      { name: 'Application Filed',                color: '#10b981', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'AOR Received',                     color: '#22c55e', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Biometrics & Medical',              color: '#6366f1', sort_order: 7,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 8,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved / COPR',                   color: '#00c875', sort_order: 9,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 10, is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Sponsor Passport', slot_slug: 'sponsor_passport', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Applicant Passport', slot_slug: 'applicant_passport', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Marriage Certificate', slot_slug: 'marriage_certificate', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 3 },
      { slot_name: 'Sponsor PR Card / Citizenship', slot_slug: 'sponsor_pr_card_citizenship', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 4 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 5 },
      { slot_name: 'Relationship Photos (timeline)', slot_slug: 'relationship_photos_timeline', category: 'relationship', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 6 },
      { slot_name: 'Chat / Communication History', slot_slug: 'chat_communication_history', category: 'relationship', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 7 },
      { slot_name: 'Joint Financial Documents', slot_slug: 'joint_financial_documents', category: 'relationship', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 8 },
      { slot_name: 'Statutory Declarations from Third Parties', slot_slug: 'statutory_declarations_from_third_parties', category: 'relationship', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 9 },
      { slot_name: 'Sponsor Tax Returns / NOA (3 years)', slot_slug: 'sponsor_tax_returns_noa_3_years', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 10 },
      { slot_name: 'Sponsor Employment Letter', slot_slug: 'sponsor_employment_letter', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 11 },
      { slot_name: 'Police Clearance  -  Sponsor', slot_slug: 'police_clearance_sponsor', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 12 },
      { slot_name: 'Police Clearance  -  Applicant', slot_slug: 'police_clearance_applicant', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 13 },
      { slot_name: 'Medical Exam Results (IME)', slot_slug: 'medical_exam_results_ime', category: 'medical', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 14 },
    ],
  },

  'Work Permit': {
    pipelineName: 'Work Permit Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'LMIA Processing',                 color: '#f59e0b', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Work Permit Application Prep',     color: '#06b6d4', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Filed',                color: '#10b981', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Biometrics & Medical',              color: '#6366f1', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 7,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved',                          color: '#00c875', sort_order: 8,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 9,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Passport (all pages)', slot_slug: 'passport_all_pages', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Job Offer Letter', slot_slug: 'job_offer_letter', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 3 },
      { slot_name: 'LMIA Approval Letter', slot_slug: 'lmia_approval_letter', category: 'employment', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 4 },
      { slot_name: 'Employment Contract', slot_slug: 'employment_contract', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 5 },
      { slot_name: 'Resume / CV', slot_slug: 'resume_cv', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 6 },
      { slot_name: 'Education Credentials', slot_slug: 'education_credentials', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 7 },
      { slot_name: 'Police Clearance Certificate(s)', slot_slug: 'police_clearance_certificates', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 8 },
      { slot_name: 'Medical Exam Results', slot_slug: 'medical_exam_results', category: 'medical', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 9 },
      { slot_name: 'Proof of Funds', slot_slug: 'proof_of_funds', category: 'financial', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 10 },
    ],
  },

  'Study Permit': {
    pipelineName: 'Study Permit Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Preparation',          color: '#06b6d4', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Filed',                color: '#10b981', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Biometrics',                        color: '#6366f1', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved',                          color: '#00c875', sort_order: 7,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 8,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Passport (all pages)', slot_slug: 'passport_all_pages', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Letter of Acceptance (DLI)', slot_slug: 'letter_of_acceptance_dli', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 3 },
      { slot_name: 'Transcripts & Diplomas', slot_slug: 'transcripts_diplomas', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 4 },
      { slot_name: 'Proof of Funds (tuition + living)', slot_slug: 'proof_of_funds_tuition_living', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 5 },
      { slot_name: 'Bank Statements (6 months)', slot_slug: 'bank_statements_6_months', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 6 },
      { slot_name: 'Study Plan / Statement of Purpose', slot_slug: 'study_plan_statement_of_purpose', category: 'other', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 7 },
      { slot_name: 'Police Clearance Certificate(s)', slot_slug: 'police_clearance_certificates', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 8 },
      { slot_name: 'Medical Exam Results', slot_slug: 'medical_exam_results', category: 'medical', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 9 },
    ],
  },

  'Permanent Residence': {
    pipelineName: 'Express Entry Standard',
    stages: [
      { name: 'Initial Consultation',            color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',   color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'ECA & Language Testing',            color: '#f59e0b', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 60 },
      { name: 'Profile Creation & Submission',     color: '#06b6d4', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'ITA Received & Application Prep',   color: '#22c55e', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 60 },
      { name: 'Application Filed',                 color: '#10b981', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Biometrics & Medical',               color: '#6366f1', sort_order: 7,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Awaiting Decision',                  color: '#a855f7', sort_order: 8,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved / COPR',                    color: '#00c875', sort_order: 9,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                            color: '#e2445c', sort_order: 10, is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Passport (all pages)', slot_slug: 'passport_all_pages', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Birth Certificate', slot_slug: 'birth_certificate', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 3 },
      { slot_name: 'IELTS / CELPIP Results', slot_slug: 'ielts_celpip_results', category: 'language', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 4 },
      { slot_name: 'ECA Report (WES/IQAS)', slot_slug: 'eca_report_wes_iqas', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 5 },
      { slot_name: 'University Transcripts', slot_slug: 'university_transcripts', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 6 },
      { slot_name: 'Employment Reference Letters', slot_slug: 'employment_reference_letters', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 7 },
      { slot_name: 'Bank Statements (6 months)', slot_slug: 'bank_statements_6_months', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 8 },
      { slot_name: 'Proof of Settlement Funds', slot_slug: 'proof_of_settlement_funds', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 9 },
      { slot_name: 'Police Clearance Certificate(s)', slot_slug: 'police_clearance_certificates', category: 'background', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 10 },
      { slot_name: 'Medical Exam Results (IME)', slot_slug: 'medical_exam_results_ime', category: 'medical', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 11 },
    ],
  },

  'Refugee Claim': {
    pipelineName: 'Refugee Claim Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'BOC Form & Narrative',             color: '#f59e0b', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 15 },
      { name: 'Hearing Preparation',              color: '#06b6d4', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 14 },
      { name: 'Hearing',                           color: '#10b981', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Accepted',                          color: '#00c875', sort_order: 7,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Rejected',                          color: '#e2445c', sort_order: 8,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Passport / Travel Documents', slot_slug: 'passport_travel_documents', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Basis of Claim (BOC) Form', slot_slug: 'basis_of_claim_boc_form', category: 'legal', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 3 },
      { slot_name: 'Personal Narrative / Declaration', slot_slug: 'personal_narrative_declaration', category: 'legal', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 4 },
      { slot_name: 'Country Condition Evidence', slot_slug: 'country_condition_evidence', category: 'legal', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 5 },
      { slot_name: 'Medical / Psychological Reports', slot_slug: 'medical_psychological_reports', category: 'medical', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 6 },
      { slot_name: 'Police Reports / Threats Evidence', slot_slug: 'police_reports_threats_evidence', category: 'background', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 7 },
    ],
  },

  'Visitor Visa': {
    pipelineName: 'Visitor Visa Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Preparation',          color: '#06b6d4', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 5 },
      { name: 'Application Filed',                color: '#10b981', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Biometrics',                        color: '#6366f1', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved',                          color: '#00c875', sort_order: 7,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 8,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Passport (bio page + stamps)', slot_slug: 'passport_bio_page_stamps', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Invitation Letter', slot_slug: 'invitation_letter', category: 'travel', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 3 },
      { slot_name: 'Travel Itinerary', slot_slug: 'travel_itinerary', category: 'travel', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 4 },
      { slot_name: 'Proof of Funds', slot_slug: 'proof_of_funds', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 5 },
      { slot_name: 'Bank Statements (3 months)', slot_slug: 'bank_statements_3_months', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 6 },
      { slot_name: 'Employment Letter / Leave Approval', slot_slug: 'employment_letter_leave_approval', category: 'employment', person_role_scope: 'any', is_required: false, accepted_file_types: ['application/pdf'], sort_order: 7 },
    ],
  },

  'Citizenship': {
    pipelineName: 'Citizenship Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Document Collection',  color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Preparation',          color: '#06b6d4', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Application Filed',                color: '#10b981', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Citizenship Test & Interview',      color: '#f59e0b', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Oath Ceremony',                     color: '#00c875', sort_order: 7,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 8,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'PR Card (front and back)', slot_slug: 'pr_card_front_and_back', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'Passport (all pages)', slot_slug: 'passport_all_pages', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 2 },
      { slot_name: 'Digital Photos  -  IRCC Specs', slot_slug: 'digital_photos_ircc_specs', category: 'identity', person_role_scope: 'any', is_required: true, accepted_file_types: ['image/jpeg','image/png'], sort_order: 3 },
      { slot_name: 'Tax Returns / NOA (5 years)', slot_slug: 'tax_returns_noa_5_years', category: 'financial', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 4 },
      { slot_name: 'Physical Presence Calculator', slot_slug: 'physical_presence_calculator', category: 'other', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 5 },
      { slot_name: 'Travel History (5 years)', slot_slug: 'travel_history_5_years', category: 'travel', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 6 },
      { slot_name: 'Language Test Results (CLB 4+)', slot_slug: 'language_test_results_clb_4', category: 'education', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 7 },
    ],
  },

  'LMIA': {
    pipelineName: 'LMIA Standard',
    stages: [
      { name: 'Initial Consultation',           color: '#3b82f6', sort_order: 1,  is_terminal: false, auto_close_matter: false, sla_days: 2 },
      { name: 'Retainer & Employer Documents',    color: '#8b5cf6', sort_order: 2,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'Job Posting & Recruitment',         color: '#f59e0b', sort_order: 3,  is_terminal: false, auto_close_matter: false, sla_days: 30 },
      { name: 'Transition Plan Preparation',       color: '#06b6d4', sort_order: 4,  is_terminal: false, auto_close_matter: false, sla_days: 7 },
      { name: 'LMIA Application Filed',            color: '#10b981', sort_order: 5,  is_terminal: false, auto_close_matter: false, sla_days: 1 },
      { name: 'Awaiting Decision',                 color: '#a855f7', sort_order: 6,  is_terminal: false, auto_close_matter: false, sla_days: null },
      { name: 'Approved',                          color: '#00c875', sort_order: 7,  is_terminal: true,  auto_close_matter: false, sla_days: null },
      { name: 'Refused',                           color: '#e2445c', sort_order: 8,  is_terminal: true,  auto_close_matter: true,  sla_days: null },
    ],
    docs: [
      { slot_name: 'Employer Business Licence', slot_slug: 'employer_business_licence', category: 'employer', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 1 },
      { slot_name: 'CRA Business Number Confirmation', slot_slug: 'cra_business_number_confirmation', category: 'employer', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 2 },
      { slot_name: 'T4 Summary (2 years)', slot_slug: 't4_summary_2_years', category: 'employer', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 3 },
      { slot_name: 'Job Description', slot_slug: 'job_description', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 4 },
      { slot_name: 'Recruitment Ads (screenshots)', slot_slug: 'recruitment_ads_screenshots', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf','image/jpeg','image/png'], sort_order: 5 },
      { slot_name: 'Employment Contract / Offer Letter', slot_slug: 'employment_contract_offer_letter', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 6 },
      { slot_name: 'Transition Plan', slot_slug: 'transition_plan', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 7 },
      { slot_name: 'Worker Resume / CV', slot_slug: 'worker_resume_cv', category: 'employment', person_role_scope: 'any', is_required: true, accepted_file_types: ['application/pdf'], sort_order: 8 },
    ],
  },
}

async function main() {
  // 1. Get tenant
  const { data: tenant } = await supabase.from('tenants').select('id').order('created_at').limit(1).single()
  if (!tenant) { console.error('No tenant found'); process.exit(1) }
  const tenantId = tenant.id
  console.log(`Tenant: ${tenantId}`)

  // 2. Get Immigration practice area
  const { data: pa } = await supabase.from('practice_areas')
    .select('id').eq('tenant_id', tenantId).eq('name', 'Immigration').single()
  if (!pa) { console.error('No Immigration practice area'); process.exit(1) }
  const immPaId = pa.id
  console.log(`Immigration PA: ${immPaId}`)

  // 3. Get all immigration matter types
  const { data: matterTypes } = await supabase.from('matter_types')
    .select('id, name').eq('tenant_id', tenantId).eq('practice_area_id', immPaId).eq('is_active', true)
  if (!matterTypes?.length) { console.error('No immigration matter types'); process.exit(1) }
  console.log(`Found ${matterTypes.length} immigration matter types`)

  for (const mt of matterTypes) {
    const config = IMMIGRATION_PIPELINES[mt.name]
    if (!config) {
      console.log(`  ⏭ ${mt.name}  -  no pipeline config, skipping`)
      continue
    }

    console.log(`\n  📋 ${mt.name}`)

    // Check if pipeline already exists
    const { data: existingPip } = await supabase.from('matter_stage_pipelines')
      .select('id').eq('tenant_id', tenantId).eq('matter_type_id', mt.id).eq('name', config.pipelineName).maybeSingle()

    let pipId: string
    if (existingPip) {
      pipId = existingPip.id
      console.log(`     Pipeline already exists: ${config.pipelineName}`)
    } else {
      const { data: newPip, error } = await supabase.from('matter_stage_pipelines')
        .insert({ tenant_id: tenantId, matter_type_id: mt.id, name: config.pipelineName, is_default: true, is_active: true })
        .select('id').single()
      if (error || !newPip) { console.error(`     ❌ Pipeline error:`, error); continue }
      pipId = newPip.id
      console.log(`     ✅ Pipeline created: ${config.pipelineName}`)
    }

    // Insert stages (skip existing)
    for (const stage of config.stages) {
      const { data: existingStage } = await supabase.from('matter_stages')
        .select('id').eq('pipeline_id', pipId).eq('name', stage.name).maybeSingle()
      if (existingStage) continue

      const { error } = await supabase.from('matter_stages').insert({
        tenant_id: tenantId,
        pipeline_id: pipId,
        name: stage.name,
        color: stage.color,
        sort_order: stage.sort_order,
        is_terminal: stage.is_terminal,
        auto_close_matter: stage.auto_close_matter,
        sla_days: stage.sla_days,
      })
      if (error) console.error(`     ❌ Stage "${stage.name}":`, error.message)
    }
    console.log(`     ✅ ${config.stages.length} stages`)

    // Insert document slot templates (skip existing slugs)
    for (const doc of config.docs) {
      const { data: existingDoc } = await supabase.from('document_slot_templates')
        .select('id').eq('tenant_id', tenantId).eq('matter_type_id', mt.id).eq('slot_slug', doc.slot_slug).maybeSingle()
      if (existingDoc) continue

      const { error } = await supabase.from('document_slot_templates').insert({
        tenant_id: tenantId,
        matter_type_id: mt.id,
        slot_name: doc.slot_name,
        slot_slug: doc.slot_slug,
        category: doc.category,
        person_role_scope: doc.person_role_scope,
        is_required: doc.is_required,
        accepted_file_types: doc.accepted_file_types,
        sort_order: doc.sort_order,
      })
      if (error) console.error(`     ❌ Doc "${doc.slot_name}":`, error.message)
    }
    console.log(`     ✅ ${config.docs.length} document templates`)
  }

  console.log('\n✅ Done!')
}

main().catch(console.error)
