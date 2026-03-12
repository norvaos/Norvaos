-- ============================================================
-- 030: Seed Immigration Matter Type Pipelines, Stages &
--      Document Slot Templates
-- ============================================================
-- Migration 009 created immigration matter_types but did NOT
-- create pipelines/stages for them (only Real Estate got those).
-- This migration fills the gap so the unified Matter Types
-- settings page shows pipelines + document templates.
-- All inserts are ON CONFLICT DO NOTHING — safe to re-run.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_tenant_id     UUID;
  v_imm_pa_id     UUID;
  v_mt_id         UUID;
  v_pip_id        UUID;
  v_slug          TEXT;
BEGIN
  -- Resolve the first tenant
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '[030] No tenant found — skipping.';
    RETURN;
  END IF;

  -- Get Immigration practice area
  SELECT id INTO v_imm_pa_id FROM practice_areas
   WHERE tenant_id = v_tenant_id AND name = 'Immigration';
  IF v_imm_pa_id IS NULL THEN
    RAISE NOTICE '[030] No Immigration practice area found — skipping.';
    RETURN;
  END IF;

  RAISE NOTICE '[030] Seeding immigration pipelines for tenant %', v_tenant_id;

  -- ══════════════════════════════════════════════════════════
  -- SPOUSAL SPONSORSHIP
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Spousal Sponsorship';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Spousal Sponsorship Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Spousal Sponsorship Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Relationship Evidence Gathering','#f59e0b', 3, FALSE, FALSE, 14),
      (v_tenant_id, v_pip_id, 'Application Preparation',       '#06b6d4', 4,  FALSE, FALSE, 14),
      (v_tenant_id, v_pip_id, 'Application Filed',             '#10b981', 5,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'AOR Received',                  '#22c55e', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Biometrics & Medical',          '#6366f1', 7,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 8,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved / COPR',               '#00c875', 9,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 10, TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    -- Document slot templates for Spousal Sponsorship
    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Sponsor Passport', 'sponsor_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Applicant Passport', 'applicant_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Marriage Certificate', 'marriage_certificate', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Sponsor PR Card / Citizenship', 'sponsor_pr_card_citizenship', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Relationship Photos (timeline)', 'relationship_photos_timeline', 'relationship', 'any', TRUE, '{"image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Chat / Communication History', 'chat_communication_history', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Joint Financial Documents', 'joint_financial_documents', 'relationship', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8),
      (v_tenant_id, v_mt_id, 'Statutory Declarations from Third Parties', 'statutory_declarations_from_third_parties', 'relationship', 'any', TRUE, '{"application/pdf"}', 9),
      (v_tenant_id, v_mt_id, 'Sponsor Tax Returns / NOA (3 years)', 'sponsor_tax_returns_noa_3_years', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 10),
      (v_tenant_id, v_mt_id, 'Sponsor Employment Letter', 'sponsor_employment_letter', 'financial', 'any', TRUE, '{"application/pdf"}', 11),
      (v_tenant_id, v_mt_id, 'Police Clearance — Sponsor', 'police_clearance_sponsor', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 12),
      (v_tenant_id, v_mt_id, 'Police Clearance — Applicant', 'police_clearance_applicant', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 13),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (IME)', 'medical_exam_results_ime', 'medical', 'any', TRUE, '{"application/pdf"}', 14)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- WORK PERMIT
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Work Permit';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Work Permit Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Work Permit Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'LMIA Processing',               '#f59e0b', 3,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Work Permit Application Prep',  '#06b6d4', 4,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Filed',             '#10b981', 5,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Biometrics & Medical',          '#6366f1', 6,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 7,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved',                      '#00c875', 8,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 9,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Passport (all pages)', 'passport_all_pages', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Job Offer Letter', 'job_offer_letter', 'employment', 'any', TRUE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'LMIA Approval Letter', 'lmia_approval_letter', 'employment', 'any', FALSE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Employment Contract', 'employment_contract', 'employment', 'any', TRUE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'Employer Business Documents', 'employer_business_documents', 'employment', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Resume / CV', 'resume_cv', 'employment', 'any', TRUE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Education Credentials', 'education_credentials', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 8),
      (v_tenant_id, v_mt_id, 'Police Clearance Certificate(s)', 'police_clearance_certificates', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 9),
      (v_tenant_id, v_mt_id, 'Medical Exam Results', 'medical_exam_results', 'medical', 'any', FALSE, '{"application/pdf"}', 10),
      (v_tenant_id, v_mt_id, 'Proof of Funds', 'proof_of_funds', 'financial', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 11)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- STUDY PERMIT
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Study Permit';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Study Permit Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Study Permit Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Preparation',       '#06b6d4', 3,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Filed',             '#10b981', 4,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Biometrics',                    '#6366f1', 5,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved',                      '#00c875', 7,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 8,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Passport (all pages)', 'passport_all_pages', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Letter of Acceptance (DLI)', 'letter_of_acceptance_dli', 'education', 'any', TRUE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'Transcripts & Diplomas', 'transcripts_diplomas', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'Proof of Funds (tuition + living)', 'proof_of_funds_tuition_living', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Bank Statements (6 months)', 'bank_statements_6_months', 'financial', 'any', TRUE, '{"application/pdf"}', 6),
      (v_tenant_id, v_mt_id, 'GIC Certificate', 'gic_certificate', 'financial', 'any', FALSE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Study Plan / Statement of Purpose', 'study_plan_statement_of_purpose', 'other', 'any', TRUE, '{"application/pdf"}', 8),
      (v_tenant_id, v_mt_id, 'Language Test Results', 'language_test_results', 'education', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 9),
      (v_tenant_id, v_mt_id, 'Police Clearance Certificate(s)', 'police_clearance_certificates', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 10),
      (v_tenant_id, v_mt_id, 'Medical Exam Results', 'medical_exam_results', 'medical', 'any', FALSE, '{"application/pdf"}', 11)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- PERMANENT RESIDENCE (Express Entry)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Permanent Residence';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Express Entry Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Express Entry Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',            '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',  '#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'ECA & Language Testing',          '#f59e0b', 3,  FALSE, FALSE, 60),
      (v_tenant_id, v_pip_id, 'Profile Creation & Submission',   '#06b6d4', 4,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'ITA Received & Application Prep', '#22c55e', 5,  FALSE, FALSE, 60),
      (v_tenant_id, v_pip_id, 'Application Filed',               '#10b981', 6,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Biometrics & Medical',            '#6366f1', 7,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',               '#a855f7', 8,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved / COPR',                 '#00c875', 9,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                         '#e2445c', 10, TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Passport (all pages)', 'passport_all_pages', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Birth Certificate', 'birth_certificate', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'IELTS / CELPIP Results', 'ielts_celpip_results', 'language', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'ECA Report (WES/IQAS)', 'eca_report_wes_iqas', 'education', 'any', TRUE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'University Transcripts', 'university_transcripts', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Degree Certificates', 'degree_certificates', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Employment Reference Letters', 'employment_reference_letters', 'employment', 'any', TRUE, '{"application/pdf"}', 8),
      (v_tenant_id, v_mt_id, 'Pay Stubs (6 months)', 'pay_stubs_6_months', 'employment', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 9),
      (v_tenant_id, v_mt_id, 'Tax Returns (2 years)', 'tax_returns_2_years', 'financial', 'any', FALSE, '{"application/pdf"}', 10),
      (v_tenant_id, v_mt_id, 'Bank Statements (6 months)', 'bank_statements_6_months', 'financial', 'any', TRUE, '{"application/pdf"}', 11),
      (v_tenant_id, v_mt_id, 'Proof of Settlement Funds', 'proof_of_settlement_funds', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 12),
      (v_tenant_id, v_mt_id, 'Police Clearance Certificate(s)', 'police_clearance_certificates', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 13),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (IME)', 'medical_exam_results_ime', 'medical', 'any', TRUE, '{"application/pdf"}', 14),
      (v_tenant_id, v_mt_id, 'Provincial Nomination Certificate', 'provincial_nomination_certificate', 'other', 'any', FALSE, '{"application/pdf"}', 15)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- REFUGEE CLAIM
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Refugee Claim';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Refugee Claim Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Refugee Claim Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'BOC Form & Narrative',          '#f59e0b', 3,  FALSE, FALSE, 15),
      (v_tenant_id, v_pip_id, 'Hearing Preparation',           '#06b6d4', 4,  FALSE, FALSE, 14),
      (v_tenant_id, v_pip_id, 'Hearing',                       '#10b981', 5,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Accepted',                      '#00c875', 7,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Rejected',                      '#e2445c', 8,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Passport / Travel Documents', 'passport_travel_documents', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Basis of Claim (BOC) Form', 'basis_of_claim_boc_form', 'legal', 'any', TRUE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'Personal Narrative / Declaration', 'personal_narrative_declaration', 'legal', 'any', TRUE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Country Condition Evidence', 'country_condition_evidence', 'legal', 'any', TRUE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'Medical / Psychological Reports', 'medical_psychological_reports', 'medical', 'any', FALSE, '{"application/pdf"}', 6),
      (v_tenant_id, v_mt_id, 'Police Reports / Threats Evidence', 'police_reports_threats_evidence', 'background', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Identity Documents (any available)', 'identity_documents_any_available', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 8)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- VISITOR VISA
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Visitor Visa';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Visitor Visa Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Visitor Visa Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Preparation',       '#06b6d4', 3,  FALSE, FALSE, 5),
      (v_tenant_id, v_pip_id, 'Application Filed',             '#10b981', 4,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Biometrics',                    '#6366f1', 5,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved',                      '#00c875', 7,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 8,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Passport (bio page + stamps)', 'passport_bio_page_stamps', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Invitation Letter', 'invitation_letter', 'travel', 'any', FALSE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'Travel Itinerary', 'travel_itinerary', 'travel', 'any', FALSE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Proof of Funds', 'proof_of_funds', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Bank Statements (3 months)', 'bank_statements_3_months', 'financial', 'any', TRUE, '{"application/pdf"}', 6),
      (v_tenant_id, v_mt_id, 'Employment Letter / Leave Approval', 'employment_letter_leave_approval', 'employment', 'any', FALSE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Travel History', 'travel_history', 'travel', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- CITIZENSHIP
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'Citizenship';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'Citizenship Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'Citizenship Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Document Collection','#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Preparation',       '#06b6d4', 3,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Application Filed',             '#10b981', 4,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Citizenship Test & Interview',  '#f59e0b', 5,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Oath Ceremony',                 '#00c875', 7,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 8,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'PR Card (front and back)', 'pr_card_front_and_back', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Passport (all pages)', 'passport_all_pages', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Digital Photos — IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Tax Returns / NOA (5 years)', 'tax_returns_noa_5_years', 'financial', 'any', TRUE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Physical Presence Calculator', 'physical_presence_calculator', 'other', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Travel History (5 years)', 'travel_history_5_years', 'travel', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Language Test Results (CLB 4+)', 'language_test_results_clb_4', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Police Clearance Certificate(s)', 'police_clearance_certificates', 'background', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- LMIA
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id AND name = 'LMIA';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (v_tenant_id, v_mt_id, 'LMIA Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id AND name = 'LMIA Standard';

    INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days) VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',          '#3b82f6', 1,  FALSE, FALSE, 2),
      (v_tenant_id, v_pip_id, 'Retainer & Employer Documents', '#8b5cf6', 2,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'Job Posting & Recruitment',     '#f59e0b', 3,  FALSE, FALSE, 30),
      (v_tenant_id, v_pip_id, 'Transition Plan Preparation',   '#06b6d4', 4,  FALSE, FALSE, 7),
      (v_tenant_id, v_pip_id, 'LMIA Application Filed',        '#10b981', 5,  FALSE, FALSE, 1),
      (v_tenant_id, v_pip_id, 'Awaiting Decision',             '#a855f7', 6,  FALSE, FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Approved',                      '#00c875', 7,  TRUE,  FALSE, NULL),
      (v_tenant_id, v_pip_id, 'Refused',                       '#e2445c', 8,  TRUE,  TRUE,  NULL)
    ON CONFLICT (pipeline_id, name) DO NOTHING;

    INSERT INTO document_slot_templates (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order) VALUES
      (v_tenant_id, v_mt_id, 'Employer Business Licence', 'employer_business_licence', 'employer', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'CRA Business Number Confirmation', 'cra_business_number_confirmation', 'employer', 'any', TRUE, '{"application/pdf"}', 2),
      (v_tenant_id, v_mt_id, 'T4 Summary (2 years)', 't4_summary_2_years', 'employer', 'any', TRUE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'Job Description', 'job_description', 'employment', 'any', TRUE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Recruitment Ads (screenshots)', 'recruitment_ads_screenshots', 'employment', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Recruitment Results Log', 'recruitment_results_log', 'employment', 'any', TRUE, '{"application/pdf"}', 6),
      (v_tenant_id, v_mt_id, 'Employment Contract / Offer Letter', 'employment_contract_offer_letter', 'employment', 'any', TRUE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Transition Plan', 'transition_plan', 'employment', 'any', TRUE, '{"application/pdf"}', 8),
      (v_tenant_id, v_mt_id, 'Worker Resume / CV', 'worker_resume_cv', 'employment', 'any', TRUE, '{"application/pdf"}', 9),
      (v_tenant_id, v_mt_id, 'Prevailing Wage Evidence', 'prevailing_wage_evidence', 'employment', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE '[030] Immigration pipeline + document seed complete.';
END $$;

COMMIT;
