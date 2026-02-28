-- ============================================================================
-- Migration 008: Immigration Practice Operating System
-- ============================================================================
-- This migration adds immigration-specific case types, stage engines,
-- document checklists, deadline tracking, automation rules, and intake fields.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Immigration Case Types (templates for each visa/permit category)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immigration_case_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. "Express Entry PR"
  slug TEXT NOT NULL,                          -- e.g. "express_entry_pr"
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  default_billing_type TEXT NOT NULL DEFAULT 'flat_fee',
  default_estimated_value NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE immigration_case_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON immigration_case_types
  USING (tenant_id = get_current_tenant_id());

-- --------------------------------------------------------------------------
-- 2. Case Stage Definitions (ordered stages per case type)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_stage_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_type_id UUID NOT NULL REFERENCES immigration_case_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. "Initial Consultation"
  slug TEXT NOT NULL,                          -- e.g. "initial_consultation"
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6b7280',
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,  -- last stage (Filed, Approved, etc.)
  requires_checklist_complete BOOLEAN NOT NULL DEFAULT FALSE,
  auto_tasks JSONB NOT NULL DEFAULT '[]',      -- [{title, assigned_role, due_days_offset, priority}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_type_id, slug)
);

ALTER TABLE case_stage_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON case_stage_definitions
  USING (tenant_id = get_current_tenant_id());

-- --------------------------------------------------------------------------
-- 3. Document Checklist Templates (per case type)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_type_id UUID NOT NULL REFERENCES immigration_case_types(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,                  -- e.g. "Passport Copy"
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',     -- identity, education, employment, financial, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_type_id, document_name)
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON checklist_templates
  USING (tenant_id = get_current_tenant_id());

-- --------------------------------------------------------------------------
-- 4. Matter Immigration Data (extends matters table with immigration fields)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matter_immigration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE UNIQUE,
  case_type_id UUID REFERENCES immigration_case_types(id) ON DELETE SET NULL,

  -- Current stage tracking
  current_stage_id UUID REFERENCES case_stage_definitions(id) ON DELETE SET NULL,
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_history JSONB NOT NULL DEFAULT '[]',    -- [{stage_id, stage_name, entered_at, exited_at, user_id}]

  -- Immigration-specific client fields
  country_of_citizenship TEXT,
  country_of_residence TEXT,
  date_of_birth DATE,
  passport_number TEXT,
  passport_expiry DATE,
  current_visa_status TEXT,                     -- e.g. "Visitor", "Work Permit", "Study Permit", "PR", "Citizen", "No Status"
  current_visa_expiry DATE,
  uci_number TEXT,                              -- Unique Client Identifier (IRCC)
  application_number TEXT,                      -- IRCC Application Number

  -- Key immigration dates
  date_filed DATE,
  date_biometrics DATE,
  date_medical DATE,
  date_interview DATE,
  date_decision DATE,
  date_landing DATE,

  -- Intake fields
  prior_refusals BOOLEAN DEFAULT FALSE,
  prior_refusal_details TEXT,
  has_criminal_record BOOLEAN DEFAULT FALSE,
  criminal_record_details TEXT,
  has_medical_issues BOOLEAN DEFAULT FALSE,
  medical_issue_details TEXT,
  language_test_type TEXT,                      -- IELTS, CELPIP, TEF, TCF
  language_test_scores JSONB,                   -- {listening, reading, writing, speaking}
  education_credential TEXT,                    -- e.g. "Bachelor's Degree"
  eca_status TEXT,                              -- "not_started", "in_progress", "completed"
  crs_score INT,                                -- Comprehensive Ranking System score (Express Entry)
  work_experience_years INT,
  canadian_work_experience_years INT,
  spouse_included BOOLEAN DEFAULT FALSE,
  dependents_count INT DEFAULT 0,
  employer_name TEXT,
  lmia_number TEXT,
  job_offer_noc TEXT,                           -- NOC code for job offer
  provincial_nominee_program TEXT,              -- e.g. "OINP", "BCPNP", "SINP"

  -- Retainer / Fee tracking
  retainer_signed BOOLEAN DEFAULT FALSE,
  retainer_signed_at TIMESTAMPTZ,
  retainer_amount NUMERIC(12,2),
  government_fees NUMERIC(12,2),

  -- Notes
  internal_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE matter_immigration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON matter_immigration
  USING (tenant_id = get_current_tenant_id());

CREATE INDEX idx_matter_immigration_matter ON matter_immigration(matter_id);
CREATE INDEX idx_matter_immigration_case_type ON matter_immigration(case_type_id);
CREATE INDEX idx_matter_immigration_stage ON matter_immigration(current_stage_id);
CREATE INDEX idx_matter_immigration_visa_expiry ON matter_immigration(current_visa_expiry);

-- --------------------------------------------------------------------------
-- 5. Document Checklist Items (per matter - instantiated from templates)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matter_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  checklist_template_id UUID REFERENCES checklist_templates(id) ON DELETE SET NULL,
  document_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'missing',       -- missing, requested, received, approved, not_applicable
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,  -- linked uploaded document
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE matter_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON matter_checklist_items
  USING (tenant_id = get_current_tenant_id());

CREATE INDEX idx_checklist_items_matter ON matter_checklist_items(matter_id);
CREATE INDEX idx_checklist_items_status ON matter_checklist_items(status);

-- --------------------------------------------------------------------------
-- 6. Deadline / Risk Items (per matter)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matter_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL,                  -- visa_expiry, biometrics, medical, ircc_submission, filing, custom
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',      -- upcoming, at_risk, overdue, completed, dismissed
  priority TEXT NOT NULL DEFAULT 'medium',      -- low, medium, high, urgent
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  source_field TEXT,                            -- which field generated this (e.g. "current_visa_expiry")
  reminder_days INT[] DEFAULT '{30,14,7,3,1}', -- days before due_date to trigger reminder
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE matter_deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON matter_deadlines
  USING (tenant_id = get_current_tenant_id());

CREATE INDEX idx_deadlines_matter ON matter_deadlines(matter_id);
CREATE INDEX idx_deadlines_due_date ON matter_deadlines(due_date);
CREATE INDEX idx_deadlines_status ON matter_deadlines(status);

-- --------------------------------------------------------------------------
-- 7. Automation Rules (trigger → action)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  case_type_id UUID REFERENCES immigration_case_types(id) ON DELETE CASCADE,

  -- Trigger configuration
  trigger_type TEXT NOT NULL,                   -- stage_change, checklist_complete, deadline_approaching, matter_created
  trigger_config JSONB NOT NULL DEFAULT '{}',   -- {from_stage_id, to_stage_id, days_before, checklist_category, etc}

  -- Action configuration
  action_type TEXT NOT NULL,                    -- create_task, send_notification, update_field, log_activity
  action_config JSONB NOT NULL DEFAULT '{}',    -- {title, assigned_to_role, due_days_offset, priority, message, field, value, etc}

  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON automation_rules
  USING (tenant_id = get_current_tenant_id());

-- --------------------------------------------------------------------------
-- 8. Add case_type_id to matters table for quick filtering
-- --------------------------------------------------------------------------
ALTER TABLE matters ADD COLUMN IF NOT EXISTS case_type_id UUID REFERENCES immigration_case_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matters_case_type ON matters(case_type_id);

-- --------------------------------------------------------------------------
-- 9. Add immigration_data to contacts for intake
-- --------------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS immigration_data JSONB DEFAULT '{}';

-- --------------------------------------------------------------------------
-- 10. Seed default immigration case types for the tenant
-- --------------------------------------------------------------------------
-- We use a function so it can be called per-tenant
CREATE OR REPLACE FUNCTION seed_immigration_defaults(p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_express_entry_id UUID;
  v_spousal_id UUID;
  v_work_permit_id UUID;
  v_study_permit_id UUID;
  v_visitor_id UUID;
  v_refugee_id UUID;
  v_judicial_review_id UUID;
BEGIN
  -- Express Entry PR
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Express Entry PR', 'express_entry_pr', 'Federal Skilled Worker, Canadian Experience Class, Federal Skilled Trades via Express Entry', 1, 'flat_fee', 5000)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_express_entry_id;

  IF v_express_entry_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_express_entry_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_express_entry_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[{"title":"Send retainer agreement","assigned_role":"lawyer","due_days_offset":1,"priority":"high"},{"title":"Send document checklist to client","assigned_role":"clerk","due_days_offset":2,"priority":"medium"}]'),
      (p_tenant_id, v_express_entry_id, 'ECA & Language Testing', 'eca_language', 3, '#f59e0b', FALSE, '[{"title":"Verify ECA application submitted","assigned_role":"clerk","due_days_offset":7,"priority":"medium"},{"title":"Confirm language test booked","assigned_role":"clerk","due_days_offset":7,"priority":"medium"}]'),
      (p_tenant_id, v_express_entry_id, 'Profile Creation & Submission', 'profile_submission', 4, '#06b6d4', TRUE, '[{"title":"Create Express Entry profile","assigned_role":"lawyer","due_days_offset":5,"priority":"high"}]'),
      (p_tenant_id, v_express_entry_id, 'ITA Received & Application Prep', 'ita_received', 5, '#22c55e', FALSE, '[{"title":"Prepare full application package","assigned_role":"lawyer","due_days_offset":30,"priority":"urgent"},{"title":"Request police certificates","assigned_role":"clerk","due_days_offset":3,"priority":"high"},{"title":"Schedule medical exam","assigned_role":"clerk","due_days_offset":5,"priority":"high"}]'),
      (p_tenant_id, v_express_entry_id, 'Application Filed', 'filed', 6, '#10b981', TRUE, '[{"title":"Confirm submission receipt from IRCC","assigned_role":"clerk","due_days_offset":1,"priority":"medium"}]'),
      (p_tenant_id, v_express_entry_id, 'Biometrics & Medical', 'biometrics_medical', 7, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_express_entry_id, 'Awaiting Decision', 'awaiting_decision', 8, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_express_entry_id, 'Approved / COPR', 'approved', 9, '#00c875', TRUE, '[{"title":"Schedule landing appointment","assigned_role":"clerk","due_days_offset":14,"priority":"high"}]'),
      (p_tenant_id, v_express_entry_id, 'Refused', 'refused', 10, '#e2445c', TRUE, '[{"title":"Review refusal letter with client","assigned_role":"lawyer","due_days_offset":3,"priority":"urgent"}]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_express_entry_id, 'Passport (all pages)', 'identity', TRUE, 1),
      (p_tenant_id, v_express_entry_id, 'Birth Certificate', 'identity', TRUE, 2),
      (p_tenant_id, v_express_entry_id, 'National ID Card', 'identity', FALSE, 3),
      (p_tenant_id, v_express_entry_id, 'Marriage Certificate', 'identity', FALSE, 4),
      (p_tenant_id, v_express_entry_id, 'Divorce Certificate', 'identity', FALSE, 5),
      (p_tenant_id, v_express_entry_id, 'IELTS/CELPIP Results', 'language', TRUE, 10),
      (p_tenant_id, v_express_entry_id, 'ECA Report (WES/IQAS)', 'education', TRUE, 20),
      (p_tenant_id, v_express_entry_id, 'University Transcripts', 'education', TRUE, 21),
      (p_tenant_id, v_express_entry_id, 'Degree Certificates', 'education', TRUE, 22),
      (p_tenant_id, v_express_entry_id, 'Employment Reference Letters', 'employment', TRUE, 30),
      (p_tenant_id, v_express_entry_id, 'Pay Stubs (6 months)', 'employment', FALSE, 31),
      (p_tenant_id, v_express_entry_id, 'Tax Returns (2 years)', 'financial', FALSE, 40),
      (p_tenant_id, v_express_entry_id, 'Bank Statements (6 months)', 'financial', TRUE, 41),
      (p_tenant_id, v_express_entry_id, 'Proof of Settlement Funds', 'financial', TRUE, 42),
      (p_tenant_id, v_express_entry_id, 'Police Clearance Certificate(s)', 'background', TRUE, 50),
      (p_tenant_id, v_express_entry_id, 'Medical Exam Results (IME)', 'medical', TRUE, 60),
      (p_tenant_id, v_express_entry_id, 'Photos (IRCC specifications)', 'other', TRUE, 70),
      (p_tenant_id, v_express_entry_id, 'Provincial Nomination Certificate', 'other', FALSE, 71),
      (p_tenant_id, v_express_entry_id, 'Job Offer / LMIA', 'employment', FALSE, 32);
  END IF;

  -- Spousal Sponsorship
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Spousal Sponsorship', 'spousal_sponsorship', 'Inland or Outland spousal/common-law partner sponsorship', 2, 'flat_fee', 4000)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_spousal_id;

  IF v_spousal_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_spousal_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_spousal_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[{"title":"Send retainer agreement","assigned_role":"lawyer","due_days_offset":1,"priority":"high"}]'),
      (p_tenant_id, v_spousal_id, 'Relationship Evidence Gathering', 'relationship_evidence', 3, '#f59e0b', FALSE, '[{"title":"Guide client on relationship evidence requirements","assigned_role":"clerk","due_days_offset":3,"priority":"medium"}]'),
      (p_tenant_id, v_spousal_id, 'Application Preparation', 'application_prep', 4, '#06b6d4', TRUE, '[{"title":"Draft relationship declaration letter","assigned_role":"lawyer","due_days_offset":14,"priority":"high"}]'),
      (p_tenant_id, v_spousal_id, 'Application Filed', 'filed', 5, '#10b981', TRUE, '[]'),
      (p_tenant_id, v_spousal_id, 'AOR Received', 'aor_received', 6, '#22c55e', FALSE, '[]'),
      (p_tenant_id, v_spousal_id, 'Biometrics & Medical', 'biometrics_medical', 7, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_spousal_id, 'Awaiting Decision', 'awaiting_decision', 8, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_spousal_id, 'Approved / COPR', 'approved', 9, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_spousal_id, 'Refused', 'refused', 10, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_spousal_id, 'Sponsor Passport', 'identity', TRUE, 1),
      (p_tenant_id, v_spousal_id, 'Applicant Passport', 'identity', TRUE, 2),
      (p_tenant_id, v_spousal_id, 'Marriage Certificate', 'identity', TRUE, 3),
      (p_tenant_id, v_spousal_id, 'Sponsor PR Card / Citizenship', 'identity', TRUE, 4),
      (p_tenant_id, v_spousal_id, 'Relationship Photos (timeline)', 'relationship', TRUE, 10),
      (p_tenant_id, v_spousal_id, 'Chat/Communication History', 'relationship', TRUE, 11),
      (p_tenant_id, v_spousal_id, 'Joint Financial Documents', 'relationship', FALSE, 12),
      (p_tenant_id, v_spousal_id, 'Statutory Declarations from Third Parties', 'relationship', TRUE, 13),
      (p_tenant_id, v_spousal_id, 'Sponsor Tax Returns / NOA (3 years)', 'financial', TRUE, 20),
      (p_tenant_id, v_spousal_id, 'Sponsor Employment Letter', 'financial', TRUE, 21),
      (p_tenant_id, v_spousal_id, 'Police Clearance - Sponsor', 'background', TRUE, 30),
      (p_tenant_id, v_spousal_id, 'Police Clearance - Applicant', 'background', TRUE, 31),
      (p_tenant_id, v_spousal_id, 'Medical Exam Results (IME)', 'medical', TRUE, 40),
      (p_tenant_id, v_spousal_id, 'Photos (IRCC specifications)', 'other', TRUE, 50);
  END IF;

  -- Work Permit
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Work Permit', 'work_permit', 'LMIA-based, LMIA-exempt, open work permits, PGWP', 3, 'flat_fee', 3500)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_work_permit_id;

  IF v_work_permit_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_work_permit_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[]'),
      (p_tenant_id, v_work_permit_id, 'LMIA Processing', 'lmia_processing', 3, '#f59e0b', FALSE, '[{"title":"Prepare LMIA application","assigned_role":"lawyer","due_days_offset":7,"priority":"high"}]'),
      (p_tenant_id, v_work_permit_id, 'Work Permit Application Prep', 'wp_application_prep', 4, '#06b6d4', TRUE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Application Filed', 'filed', 5, '#10b981', TRUE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Biometrics & Medical', 'biometrics_medical', 6, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Awaiting Decision', 'awaiting_decision', 7, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Approved', 'approved', 8, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_work_permit_id, 'Refused', 'refused', 9, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_work_permit_id, 'Passport (all pages)', 'identity', TRUE, 1),
      (p_tenant_id, v_work_permit_id, 'Job Offer Letter', 'employment', TRUE, 10),
      (p_tenant_id, v_work_permit_id, 'LMIA Approval Letter', 'employment', FALSE, 11),
      (p_tenant_id, v_work_permit_id, 'Employment Contract', 'employment', TRUE, 12),
      (p_tenant_id, v_work_permit_id, 'Employer Business Documents', 'employment', FALSE, 13),
      (p_tenant_id, v_work_permit_id, 'Resume / CV', 'employment', TRUE, 14),
      (p_tenant_id, v_work_permit_id, 'Education Credentials', 'education', TRUE, 20),
      (p_tenant_id, v_work_permit_id, 'Police Clearance Certificate(s)', 'background', TRUE, 30),
      (p_tenant_id, v_work_permit_id, 'Medical Exam Results', 'medical', FALSE, 40),
      (p_tenant_id, v_work_permit_id, 'Photos (IRCC specifications)', 'other', TRUE, 50),
      (p_tenant_id, v_work_permit_id, 'Proof of Funds', 'financial', FALSE, 41);
  END IF;

  -- Study Permit
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Study Permit', 'study_permit', 'Study permit applications and extensions', 4, 'flat_fee', 2500)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_study_permit_id;

  IF v_study_permit_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_study_permit_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Application Preparation', 'application_prep', 3, '#06b6d4', TRUE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Application Filed', 'filed', 4, '#10b981', TRUE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Biometrics', 'biometrics', 5, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Awaiting Decision', 'awaiting_decision', 6, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Approved', 'approved', 7, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_study_permit_id, 'Refused', 'refused', 8, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_study_permit_id, 'Passport (all pages)', 'identity', TRUE, 1),
      (p_tenant_id, v_study_permit_id, 'Letter of Acceptance (DLI)', 'education', TRUE, 10),
      (p_tenant_id, v_study_permit_id, 'Academic Transcripts', 'education', TRUE, 11),
      (p_tenant_id, v_study_permit_id, 'Proof of Financial Support', 'financial', TRUE, 20),
      (p_tenant_id, v_study_permit_id, 'GIC Certificate', 'financial', FALSE, 21),
      (p_tenant_id, v_study_permit_id, 'Sponsor Financial Documents', 'financial', FALSE, 22),
      (p_tenant_id, v_study_permit_id, 'Study Plan / Statement of Purpose', 'other', TRUE, 30),
      (p_tenant_id, v_study_permit_id, 'Police Clearance Certificate(s)', 'background', TRUE, 40),
      (p_tenant_id, v_study_permit_id, 'Medical Exam Results', 'medical', FALSE, 50),
      (p_tenant_id, v_study_permit_id, 'Photos (IRCC specifications)', 'other', TRUE, 60);
  END IF;

  -- Visitor Visa / Extension
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Visitor Visa / Extension', 'visitor_extension', 'Temporary Resident Visa (TRV), Super Visa, visitor record extensions', 5, 'flat_fee', 1500)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_visitor_id;

  IF v_visitor_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_visitor_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_visitor_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[]'),
      (p_tenant_id, v_visitor_id, 'Application Preparation', 'application_prep', 3, '#06b6d4', TRUE, '[]'),
      (p_tenant_id, v_visitor_id, 'Application Filed', 'filed', 4, '#10b981', TRUE, '[]'),
      (p_tenant_id, v_visitor_id, 'Awaiting Decision', 'awaiting_decision', 5, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_visitor_id, 'Approved', 'approved', 6, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_visitor_id, 'Refused', 'refused', 7, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_visitor_id, 'Passport (all pages)', 'identity', TRUE, 1),
      (p_tenant_id, v_visitor_id, 'Invitation Letter', 'other', FALSE, 10),
      (p_tenant_id, v_visitor_id, 'Travel Itinerary', 'other', TRUE, 11),
      (p_tenant_id, v_visitor_id, 'Proof of Financial Support', 'financial', TRUE, 20),
      (p_tenant_id, v_visitor_id, 'Bank Statements (6 months)', 'financial', TRUE, 21),
      (p_tenant_id, v_visitor_id, 'Employment Letter', 'employment', FALSE, 30),
      (p_tenant_id, v_visitor_id, 'Property Ownership / Ties to Home Country', 'other', FALSE, 31),
      (p_tenant_id, v_visitor_id, 'Photos (IRCC specifications)', 'other', TRUE, 40);
  END IF;

  -- Refugee Claim
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Refugee Claim', 'refugee_claim', 'Refugee protection claims and PRRAs', 6, 'flat_fee', 6000)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_refugee_id;

  IF v_refugee_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_refugee_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_refugee_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[]'),
      (p_tenant_id, v_refugee_id, 'BOC Narrative Preparation', 'boc_narrative', 3, '#f59e0b', FALSE, '[{"title":"Draft Basis of Claim narrative","assigned_role":"lawyer","due_days_offset":14,"priority":"urgent"}]'),
      (p_tenant_id, v_refugee_id, 'Hearing Preparation', 'hearing_prep', 4, '#06b6d4', TRUE, '[{"title":"Prepare client for hearing","assigned_role":"lawyer","due_days_offset":7,"priority":"urgent"},{"title":"Prepare country condition evidence","assigned_role":"clerk","due_days_offset":14,"priority":"high"}]'),
      (p_tenant_id, v_refugee_id, 'Hearing', 'hearing', 5, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_refugee_id, 'Awaiting Decision', 'awaiting_decision', 6, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_refugee_id, 'Accepted', 'accepted', 7, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_refugee_id, 'Rejected', 'rejected', 8, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_refugee_id, 'Passport or Travel Document', 'identity', TRUE, 1),
      (p_tenant_id, v_refugee_id, 'Basis of Claim (BOC) Form', 'claim', TRUE, 10),
      (p_tenant_id, v_refugee_id, 'Personal Narrative / Declaration', 'claim', TRUE, 11),
      (p_tenant_id, v_refugee_id, 'Country Condition Evidence', 'claim', TRUE, 12),
      (p_tenant_id, v_refugee_id, 'Identity Documents (any)', 'identity', TRUE, 2),
      (p_tenant_id, v_refugee_id, 'Police/Incident Reports', 'background', FALSE, 20),
      (p_tenant_id, v_refugee_id, 'Medical / Psychological Reports', 'medical', FALSE, 30),
      (p_tenant_id, v_refugee_id, 'Photos', 'other', TRUE, 40);
  END IF;

  -- Judicial Review
  INSERT INTO immigration_case_types (tenant_id, name, slug, description, sort_order, default_billing_type, default_estimated_value)
  VALUES (p_tenant_id, 'Judicial Review', 'judicial_review', 'Federal Court judicial review of IRCC/IRB decisions', 7, 'flat_fee', 8000)
  ON CONFLICT (tenant_id, slug) DO NOTHING
  RETURNING id INTO v_judicial_review_id;

  IF v_judicial_review_id IS NOT NULL THEN
    INSERT INTO case_stage_definitions (tenant_id, case_type_id, name, slug, sort_order, color, requires_checklist_complete, auto_tasks) VALUES
      (p_tenant_id, v_judicial_review_id, 'Initial Consultation', 'initial_consultation', 1, '#3b82f6', FALSE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Retainer & Document Collection', 'retainer_documents', 2, '#8b5cf6', FALSE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Leave Application Filing', 'leave_application', 3, '#f59e0b', TRUE, '[{"title":"File leave application (15-day deadline)","assigned_role":"lawyer","due_days_offset":10,"priority":"urgent"}]'),
      (p_tenant_id, v_judicial_review_id, 'Awaiting Leave Decision', 'awaiting_leave', 4, '#a855f7', FALSE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Hearing Preparation', 'hearing_prep', 5, '#06b6d4', FALSE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Hearing', 'hearing', 6, '#6366f1', FALSE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Decision Rendered', 'decision', 7, '#00c875', TRUE, '[]'),
      (p_tenant_id, v_judicial_review_id, 'Dismissed / Withdrawn', 'dismissed', 8, '#e2445c', TRUE, '[]');

    INSERT INTO checklist_templates (tenant_id, case_type_id, document_name, category, is_required, sort_order) VALUES
      (p_tenant_id, v_judicial_review_id, 'Original Decision (refusal letter)', 'claim', TRUE, 1),
      (p_tenant_id, v_judicial_review_id, 'Certified Tribunal Record (CTR)', 'claim', TRUE, 2),
      (p_tenant_id, v_judicial_review_id, 'Applicant Affidavit', 'claim', TRUE, 3),
      (p_tenant_id, v_judicial_review_id, 'Memorandum of Argument', 'claim', TRUE, 4),
      (p_tenant_id, v_judicial_review_id, 'Supporting Case Law / Jurisprudence', 'claim', TRUE, 5),
      (p_tenant_id, v_judicial_review_id, 'Notice of Application', 'claim', TRUE, 6);
  END IF;

END;
$$ LANGUAGE plpgsql;

COMMIT;
