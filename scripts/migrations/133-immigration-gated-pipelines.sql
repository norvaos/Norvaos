-- ============================================================
-- 133: Immigration Gated Matter Pipelines
-- ============================================================
-- Adds the exact matter types requested:
--   • Visitor Visa  -  Inside Canada   (extension / TRP)
--   • Visitor Visa  -  Outside Canada  (TRV from abroad)
--   • Work Permit                    (gating rules + % added)
--   • Post-Graduate Work Permit (PGWP)  -  NEW
--   • Express Entry                  (renamed + gating rules)
--   • Spousal Sponsorship  -  Inside Canada  (Inland PR)
--   • Spousal Sponsorship  -  Outside Canada (Outland PR)
--
-- Also:
--   • Adds completion_pct column to matter_stages
--   • Adds gating_rules column if not already present
--   • Updates existing Work Permit + Permanent Residence stages
--     with gating rules and completion percentages
--   • Updates lead pipeline_stages with win_probability + colours
--
-- Safe to re-run  -  uses ON CONFLICT DO UPDATE for stages so
-- gating_rules and completion_pct are refreshed each run.
-- ============================================================

BEGIN;

-- ── 0. Schema guards ─────────────────────────────────────────
ALTER TABLE matter_stages
  ADD COLUMN IF NOT EXISTS gating_rules   JSONB,
  ADD COLUMN IF NOT EXISTS completion_pct INTEGER NOT NULL DEFAULT 0
    CHECK (completion_pct BETWEEN 0 AND 100);

-- ── 1. Main seeding block ─────────────────────────────────────
DO $$
DECLARE
  v_tenant_id   UUID;
  v_imm_pa_id   UUID;
  v_mt_id       UUID;
  v_pip_id      UUID;
  v_pip_id2     UUID;
BEGIN

  -- Resolve first tenant
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '[133] No tenant found  -  skipping.';
    RETURN;
  END IF;

  -- Resolve Immigration practice area
  SELECT id INTO v_imm_pa_id
    FROM practice_areas
   WHERE tenant_id = v_tenant_id AND name = 'Immigration';
  IF v_imm_pa_id IS NULL THEN
    RAISE NOTICE '[133] No Immigration practice area  -  skipping.';
    RETURN;
  END IF;

  RAISE NOTICE '[133] Seeding for tenant %', v_tenant_id;

  -- ══════════════════════════════════════════════════════════
  -- A. VISITOR VISA  -  INSIDE CANADA
  --    Applicant already in Canada; extending status / TRP
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Visitor Visa  -  Inside Canada',
     'Extension of visitor status or Temporary Resident Permit for applicants already in Canada.',
     '#0ea5e9', 'plane-landing', TRUE, 10)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Visitor Visa  -  Inside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'Visitor Visa Inside Canada  -  Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'Visitor Visa Inside Canada  -  Standard';

    -- Stages: gating_rules gate entry TO that stage; completion_pct = % when reached
    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#0ea5e9', 2, FALSE, FALSE, 7,
       '[{"type":"require_intake_complete"}]'::jsonb, 15),

      (v_tenant_id, v_pip_id, 'Application Preparation',
       '#6366f1', 3, FALSE, FALSE, 5,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 40),

      (v_tenant_id, v_pip_id, 'Application Filed',
       '#f59e0b', 4, FALSE, FALSE, 1,
       '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]'::jsonb, 65),

      (v_tenant_id, v_pip_id, 'Awaiting Decision',
       '#a855f7', 5, FALSE, FALSE, NULL,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 80),

      (v_tenant_id, v_pip_id, 'Approved  -  Status Extended',
       '#22c55e', 6, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 7, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    -- Document slots
    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Passport (bio page + all stamps)', 'passport_bio_stamps', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Current Status Document (TRV / study/work permit)', 'current_status_document', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Proof of Funds (bank statements 3 months)', 'proof_of_funds_bank_3_months', 'financial', 'any', TRUE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Invitation Letter (if applicable)', 'invitation_letter', 'travel', 'any', FALSE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'Proof of Ties to Home Country', 'proof_of_ties_home_country', 'other', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Employment Letter / Leave Approval', 'employment_letter_leave_approval', 'employment', 'any', FALSE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (if required)', 'medical_exam_results', 'medical', 'any', FALSE, '{"application/pdf"}', 8)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- B. VISITOR VISA  -  OUTSIDE CANADA
  --    TRV application from abroad
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Visitor Visa  -  Outside Canada',
     'Temporary Resident Visa (TRV) application for applicants residing outside Canada.',
     '#3b82f6', 'plane', TRUE, 11)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Visitor Visa  -  Outside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'Visitor Visa Outside Canada  -  Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'Visitor Visa Outside Canada  -  Standard';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#3b82f6', 2, FALSE, FALSE, 7,
       '[{"type":"require_intake_complete"}]'::jsonb, 15),

      (v_tenant_id, v_pip_id, 'Application Preparation',
       '#6366f1', 3, FALSE, FALSE, 5,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 35),

      (v_tenant_id, v_pip_id, 'Application Filed',
       '#f59e0b', 4, FALSE, FALSE, 1,
       '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]'::jsonb, 55),

      (v_tenant_id, v_pip_id, 'Biometrics',
       '#06b6d4', 5, FALSE, FALSE, 30,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 70),

      (v_tenant_id, v_pip_id, 'Awaiting Decision',
       '#a855f7', 6, FALSE, FALSE, NULL,
       '[]'::jsonb, 85),

      (v_tenant_id, v_pip_id, 'Approved  -  Visa Issued',
       '#22c55e', 7, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 8, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Passport (bio page + all stamps)', 'passport_bio_stamps', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Proof of Funds', 'proof_of_funds', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Bank Statements (3 months)', 'bank_statements_3_months', 'financial', 'any', TRUE, '{"application/pdf"}', 4),
      (v_tenant_id, v_mt_id, 'Invitation Letter (if applicable)', 'invitation_letter', 'travel', 'any', FALSE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'Travel Itinerary', 'travel_itinerary', 'travel', 'any', FALSE, '{"application/pdf"}', 6),
      (v_tenant_id, v_mt_id, 'Employment Letter / Leave Approval', 'employment_letter_leave_approval', 'employment', 'any', FALSE, '{"application/pdf"}', 7),
      (v_tenant_id, v_mt_id, 'Travel History (prior visas / stamps)', 'travel_history_prior_visas', 'travel', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8),
      (v_tenant_id, v_mt_id, 'Proof of Ties to Home Country', 'proof_of_ties_home_country', 'other', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 9)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- C. POST-GRADUATE WORK PERMIT (PGWP)
  --    Open work permit for Canadian graduates
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Post-Graduate Work Permit (PGWP)',
     'Open work permit issued to graduates of eligible Canadian designated learning institutions (DLIs).',
     '#8b5cf6', 'graduation-cap', TRUE, 30)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Post-Graduate Work Permit (PGWP)';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'PGWP Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'PGWP Standard';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#8b5cf6', 2, FALSE, FALSE, 5,
       '[{"type":"require_intake_complete"}]'::jsonb, 20),

      (v_tenant_id, v_pip_id, 'Graduation & DLI Verification',
       '#a78bfa', 3, FALSE, FALSE, 7,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 40),

      (v_tenant_id, v_pip_id, 'Application Preparation',
       '#6366f1', 4, FALSE, FALSE, 5,
       '[{"type":"require_checklist_complete"}]'::jsonb, 55),

      (v_tenant_id, v_pip_id, 'Application Filed',
       '#f59e0b', 5, FALSE, FALSE, 1,
       '[{"type":"require_no_open_deficiencies"}]'::jsonb, 70),

      (v_tenant_id, v_pip_id, 'Awaiting Decision',
       '#a855f7', 6, FALSE, FALSE, NULL,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 85),

      (v_tenant_id, v_pip_id, 'PGWP Issued',
       '#22c55e', 7, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 8, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Passport (bio page + Canadian entry stamps)', 'passport_bio_entry_stamps', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Official Transcripts (all years)', 'official_transcripts_all_years', 'education', 'any', TRUE, '{"application/pdf"}', 3),
      (v_tenant_id, v_mt_id, 'Degree / Diploma Certificate', 'degree_diploma_certificate', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'Confirmation of Enrolment / Letter of Completion', 'letter_of_completion', 'education', 'any', TRUE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'Current Study Permit', 'current_study_permit', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Proof of Graduation (convocation / parchment)', 'proof_of_graduation', 'education', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Proof of Funds (optional)', 'proof_of_funds', 'financial', 'any', FALSE, '{"application/pdf"}', 8)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- D. EXPRESS ENTRY
  --    Rename/create alongside existing "Permanent Residence"
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Express Entry',
     'Federal skilled worker, CEC, and Federal Skilled Trades permanent residence via Express Entry.',
     '#f59e0b', 'star', TRUE, 40)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Express Entry';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'Express Entry  -  Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'Express Entry  -  Standard';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#f59e0b', 2, FALSE, FALSE, 7,
       '[{"type":"require_intake_complete"}]'::jsonb, 10),

      (v_tenant_id, v_pip_id, 'ECA & Language Testing',
       '#fb923c', 3, FALSE, FALSE, 60,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 20),

      (v_tenant_id, v_pip_id, 'Profile Creation & Pool Submission',
       '#06b6d4', 4, FALSE, FALSE, 7,
       '[{"type":"require_checklist_complete"}]'::jsonb, 35),

      (v_tenant_id, v_pip_id, 'ITA Received  -  Application Preparation',
       '#22c55e', 5, FALSE, FALSE, 60,
       '[]'::jsonb, 50),

      (v_tenant_id, v_pip_id, 'Application Filed (IRCC Portal)',
       '#10b981', 6, FALSE, FALSE, 1,
       '[{"type":"require_checklist_complete"},{"type":"require_document_slots_complete"},{"type":"require_no_open_deficiencies"}]'::jsonb, 65),

      (v_tenant_id, v_pip_id, 'Biometrics & Medical',
       '#6366f1', 7, FALSE, FALSE, 30,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 78),

      (v_tenant_id, v_pip_id, 'Awaiting Decision',
       '#a855f7', 8, FALSE, FALSE, NULL,
       '[]'::jsonb, 88),

      (v_tenant_id, v_pip_id, 'Approved  -  COPR Issued',
       '#22c55e', 9, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 10, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Passport (all pages)', 'passport_all_pages', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Birth Certificate', 'birth_certificate', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'IELTS / CELPIP / TEF Results', 'language_test_results', 'language', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'ECA Report (WES / IQAS / ICES)', 'eca_report', 'education', 'any', TRUE, '{"application/pdf"}', 5),
      (v_tenant_id, v_mt_id, 'University / College Transcripts', 'university_transcripts', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Degree / Diploma Certificates', 'degree_certificates', 'education', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Employment Reference Letters', 'employment_reference_letters', 'employment', 'any', TRUE, '{"application/pdf"}', 8),
      (v_tenant_id, v_mt_id, 'Pay Stubs (6 months)', 'pay_stubs_6_months', 'employment', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 9),
      (v_tenant_id, v_mt_id, 'Proof of Settlement Funds', 'proof_of_settlement_funds', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 10),
      (v_tenant_id, v_mt_id, 'Bank Statements (6 months)', 'bank_statements_6_months', 'financial', 'any', TRUE, '{"application/pdf"}', 11),
      (v_tenant_id, v_mt_id, 'Police Clearance Certificate(s)', 'police_clearance_certificates', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 12),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (IME)', 'medical_exam_results_ime', 'medical', 'any', TRUE, '{"application/pdf"}', 13),
      (v_tenant_id, v_mt_id, 'Provincial Nomination Certificate (if applicable)', 'provincial_nomination_certificate', 'other', 'any', FALSE, '{"application/pdf"}', 14)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- E. SPOUSAL SPONSORSHIP  -  INSIDE CANADA (INLAND)
  --    Both sponsor & applicant in Canada; includes OWP
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Spousal Sponsorship  -  Inside Canada',
     'Inland spousal / common-law PR sponsorship. Applicant receives an Open Work Permit while awaiting decision.',
     '#ec4899', 'heart', TRUE, 60)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Spousal Sponsorship  -  Inside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'Spousal Sponsorship Inland  -  Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'Spousal Sponsorship Inland  -  Standard';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#ec4899', 2, FALSE, FALSE, 7,
       '[{"type":"require_intake_complete"}]'::jsonb, 10),

      (v_tenant_id, v_pip_id, 'Relationship Evidence Gathering',
       '#f472b6', 3, FALSE, FALSE, 14,
       '[]'::jsonb, 20),

      (v_tenant_id, v_pip_id, 'Application Preparation',
       '#6366f1', 4, FALSE, FALSE, 14,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 35),

      (v_tenant_id, v_pip_id, 'Application Filed (Inland)',
       '#f59e0b', 5, FALSE, FALSE, 1,
       '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]'::jsonb, 50),

      (v_tenant_id, v_pip_id, 'AOR Received',
       '#22c55e', 6, FALSE, FALSE, NULL,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 60),

      (v_tenant_id, v_pip_id, 'Open Work Permit Issued',
       '#10b981', 7, FALSE, FALSE, NULL,
       '[]'::jsonb, 68),

      (v_tenant_id, v_pip_id, 'Biometrics & Medical',
       '#6366f1', 8, FALSE, FALSE, 30,
       '[]'::jsonb, 78),

      (v_tenant_id, v_pip_id, 'Awaiting PR Decision',
       '#a855f7', 9, FALSE, FALSE, NULL,
       '[]'::jsonb, 88),

      (v_tenant_id, v_pip_id, 'Approved  -  COPR Issued',
       '#22c55e', 10, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 11, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Sponsor Passport', 'sponsor_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Applicant Passport', 'applicant_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Sponsor PR Card / Citizenship Certificate', 'sponsor_pr_card', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs (both)', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'Marriage Certificate / Proof of Union', 'marriage_certificate_proof_union', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Proof of Cohabitation in Canada', 'proof_cohabitation_canada', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Relationship Photos (timeline  -  digital)', 'relationship_photos_timeline', 'relationship', 'any', TRUE, '{"image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Joint Financial Documents', 'joint_financial_documents', 'relationship', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8),
      (v_tenant_id, v_mt_id, 'Communication History (messages / calls)', 'communication_history', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 9),
      (v_tenant_id, v_mt_id, 'Statutory Declarations (third parties)', 'statutory_declarations_third_parties', 'relationship', 'any', TRUE, '{"application/pdf"}', 10),
      (v_tenant_id, v_mt_id, 'Sponsor Tax Returns / NOA (3 years)', 'sponsor_tax_returns_noa', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 11),
      (v_tenant_id, v_mt_id, 'Sponsor Employment Letter', 'sponsor_employment_letter', 'financial', 'any', TRUE, '{"application/pdf"}', 12),
      (v_tenant_id, v_mt_id, 'Police Clearance  -  Sponsor', 'police_clearance_sponsor', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 13),
      (v_tenant_id, v_mt_id, 'Police Clearance  -  Applicant', 'police_clearance_applicant', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 14),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (IME)', 'medical_exam_results_ime', 'medical', 'any', TRUE, '{"application/pdf"}', 15),
      (v_tenant_id, v_mt_id, 'Applicant Current Status in Canada', 'applicant_current_status_canada', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 16)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- F. SPOUSAL SPONSORSHIP  -  OUTSIDE CANADA (OUTLAND)
  --    Applicant resides abroad during processing
  -- ══════════════════════════════════════════════════════════
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
  VALUES
    (v_tenant_id, v_imm_pa_id,
     'Spousal Sponsorship  -  Outside Canada',
     'Outland spousal / common-law PR sponsorship. Applicant resides outside Canada while application is processed.',
     '#f43f5e', 'heart-handshake', TRUE, 61)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = v_tenant_id AND practice_area_id = v_imm_pa_id
     AND name = 'Spousal Sponsorship  -  Outside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES
      (v_tenant_id, v_mt_id, 'Spousal Sponsorship Outland  -  Standard', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = v_tenant_id AND matter_type_id = v_mt_id
       AND name = 'Spousal Sponsorship Outland  -  Standard';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (v_tenant_id, v_pip_id, 'Initial Consultation',
       '#64748b', 1, FALSE, FALSE, 2,
       '[]'::jsonb, 5),

      (v_tenant_id, v_pip_id, 'Retainer & Document Collection',
       '#f43f5e', 2, FALSE, FALSE, 7,
       '[{"type":"require_intake_complete"}]'::jsonb, 10),

      (v_tenant_id, v_pip_id, 'Relationship Evidence Gathering',
       '#fb7185', 3, FALSE, FALSE, 14,
       '[]'::jsonb, 20),

      (v_tenant_id, v_pip_id, 'Application Preparation',
       '#6366f1', 4, FALSE, FALSE, 14,
       '[{"type":"require_document_slots_complete"}]'::jsonb, 35),

      (v_tenant_id, v_pip_id, 'Application Filed (Outland)',
       '#f59e0b', 5, FALSE, FALSE, 1,
       '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]'::jsonb, 50),

      (v_tenant_id, v_pip_id, 'AOR Received',
       '#22c55e', 6, FALSE, FALSE, NULL,
       '[{"type":"require_submission_confirmation"}]'::jsonb, 60),

      (v_tenant_id, v_pip_id, 'Biometrics & Medical (Abroad)',
       '#6366f1', 7, FALSE, FALSE, 30,
       '[]'::jsonb, 74),

      (v_tenant_id, v_pip_id, 'Awaiting Decision',
       '#a855f7', 8, FALSE, FALSE, NULL,
       '[]'::jsonb, 86),

      (v_tenant_id, v_pip_id, 'Approved  -  Visa / COPR Issued',
       '#22c55e', 9, TRUE, FALSE, NULL,
       '[]'::jsonb, 100),

      (v_tenant_id, v_pip_id, 'Refused',
       '#ef4444', 10, TRUE, TRUE, NULL,
       '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      gating_rules   = EXCLUDED.gating_rules,
      completion_pct = EXCLUDED.completion_pct,
      color          = EXCLUDED.color,
      sla_days       = EXCLUDED.sla_days;

    INSERT INTO document_slot_templates
      (tenant_id, matter_type_id, slot_name, slot_slug, category, person_role_scope, is_required, accepted_file_types, sort_order)
    VALUES
      (v_tenant_id, v_mt_id, 'Sponsor Passport', 'sponsor_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 1),
      (v_tenant_id, v_mt_id, 'Applicant Passport', 'applicant_passport', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 2),
      (v_tenant_id, v_mt_id, 'Sponsor PR Card / Citizenship Certificate', 'sponsor_pr_card', 'identity', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 3),
      (v_tenant_id, v_mt_id, 'Digital Photos  -  IRCC Specs (both)', 'digital_photos_ircc_specs', 'identity', 'any', TRUE, '{"image/jpeg","image/png"}', 4),
      (v_tenant_id, v_mt_id, 'Marriage Certificate / Proof of Union', 'marriage_certificate_proof_union', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 5),
      (v_tenant_id, v_mt_id, 'Relationship Photos (timeline  -  digital)', 'relationship_photos_timeline', 'relationship', 'any', TRUE, '{"image/jpeg","image/png"}', 6),
      (v_tenant_id, v_mt_id, 'Communication History (messages / calls)', 'communication_history', 'relationship', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 7),
      (v_tenant_id, v_mt_id, 'Joint Financial Documents', 'joint_financial_documents', 'relationship', 'any', FALSE, '{"application/pdf","image/jpeg","image/png"}', 8),
      (v_tenant_id, v_mt_id, 'Statutory Declarations (third parties)', 'statutory_declarations_third_parties', 'relationship', 'any', TRUE, '{"application/pdf"}', 9),
      (v_tenant_id, v_mt_id, 'Sponsor Tax Returns / NOA (3 years)', 'sponsor_tax_returns_noa', 'financial', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 10),
      (v_tenant_id, v_mt_id, 'Sponsor Employment Letter', 'sponsor_employment_letter', 'financial', 'any', TRUE, '{"application/pdf"}', 11),
      (v_tenant_id, v_mt_id, 'Police Clearance  -  Sponsor', 'police_clearance_sponsor', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 12),
      (v_tenant_id, v_mt_id, 'Police Clearance  -  Applicant', 'police_clearance_applicant', 'background', 'any', TRUE, '{"application/pdf","image/jpeg","image/png"}', 13),
      (v_tenant_id, v_mt_id, 'Medical Exam Results (IME)', 'medical_exam_results_ime', 'medical', 'any', TRUE, '{"application/pdf"}', 14)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- G. BACKFILL  -  Work Permit (existing from migration 030)
  --    Add gating_rules + completion_pct to existing stages
  -- ══════════════════════════════════════════════════════════
  UPDATE matter_stages ms
     SET gating_rules   = rules.gating_rules::jsonb,
         completion_pct = rules.pct
    FROM (VALUES
      ('Initial Consultation',            '[]',                                                                                                                  5),
      ('Retainer & Document Collection',  '[{"type":"require_intake_complete"}]',                                                                               15),
      ('LMIA Processing',                 '[{"type":"require_document_slots_complete"}]',                                                                       30),
      ('Work Permit Application Prep',    '[{"type":"require_checklist_complete"}]',                                                                            55),
      ('Application Filed',               '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]',                                   70),
      ('Biometrics & Medical',            '[{"type":"require_submission_confirmation"}]',                                                                       80),
      ('Awaiting Decision',               '[]',                                                                                                                 90),
      ('Approved',                        '[]',                                                                                                                100),
      ('Refused',                         '[]',                                                                                                                100)
    ) AS rules(stage_name, gating_rules, pct)
   WHERE ms.name = rules.stage_name
     AND ms.pipeline_id IN (
       SELECT msp.id FROM matter_stage_pipelines msp
         JOIN matter_types mt ON msp.matter_type_id = mt.id
        WHERE mt.tenant_id = v_tenant_id
          AND mt.practice_area_id = v_imm_pa_id
          AND mt.name = 'Work Permit'
     );

  -- ══════════════════════════════════════════════════════════
  -- H. BACKFILL  -  Permanent Residence / Express Entry (030)
  -- ══════════════════════════════════════════════════════════
  UPDATE matter_stages ms
     SET gating_rules   = rules.gating_rules::jsonb,
         completion_pct = rules.pct
    FROM (VALUES
      ('Initial Consultation',              '[]',                                                                                                               5),
      ('Retainer & Document Collection',    '[{"type":"require_intake_complete"}]',                                                                            10),
      ('ECA & Language Testing',            '[{"type":"require_document_slots_complete"}]',                                                                   20),
      ('Profile Creation & Submission',     '[{"type":"require_checklist_complete"}]',                                                                        35),
      ('ITA Received & Application Prep',   '[]',                                                                                                             50),
      ('Application Filed',                 '[{"type":"require_checklist_complete"},{"type":"require_document_slots_complete"},{"type":"require_no_open_deficiencies"}]', 65),
      ('Biometrics & Medical',              '[{"type":"require_submission_confirmation"}]',                                                                   78),
      ('Awaiting Decision',                 '[]',                                                                                                             88),
      ('Approved / COPR',                   '[]',                                                                                                            100),
      ('Refused',                           '[]',                                                                                                            100)
    ) AS rules(stage_name, gating_rules, pct)
   WHERE ms.name = rules.stage_name
     AND ms.pipeline_id IN (
       SELECT msp.id FROM matter_stage_pipelines msp
         JOIN matter_types mt ON msp.matter_type_id = mt.id
        WHERE mt.tenant_id = v_tenant_id
          AND mt.practice_area_id = v_imm_pa_id
          AND mt.name = 'Permanent Residence'
     );

  -- ══════════════════════════════════════════════════════════
  -- I. BACKFILL  -  Spousal Sponsorship (generic, from 030)
  -- ══════════════════════════════════════════════════════════
  UPDATE matter_stages ms
     SET gating_rules   = rules.gating_rules::jsonb,
         completion_pct = rules.pct
    FROM (VALUES
      ('Initial Consultation',              '[]',                                                                                                               5),
      ('Retainer & Document Collection',    '[{"type":"require_intake_complete"}]',                                                                            10),
      ('Relationship Evidence Gathering',   '[]',                                                                                                             22),
      ('Application Preparation',           '[{"type":"require_document_slots_complete"}]',                                                                   38),
      ('Application Filed',                 '[{"type":"require_checklist_complete"},{"type":"require_no_open_deficiencies"}]',                               54),
      ('AOR Received',                      '[{"type":"require_submission_confirmation"}]',                                                                   63),
      ('Biometrics & Medical',              '[]',                                                                                                             76),
      ('Awaiting Decision',                 '[]',                                                                                                             88),
      ('Approved / COPR',                   '[]',                                                                                                            100),
      ('Refused',                           '[]',                                                                                                            100)
    ) AS rules(stage_name, gating_rules, pct)
   WHERE ms.name = rules.stage_name
     AND ms.pipeline_id IN (
       SELECT msp.id FROM matter_stage_pipelines msp
         JOIN matter_types mt ON msp.matter_type_id = mt.id
        WHERE mt.tenant_id = v_tenant_id
          AND mt.practice_area_id = v_imm_pa_id
          AND mt.name = 'Spousal Sponsorship'
     );

  RAISE NOTICE '[133] Matter type + pipeline seeding complete.';
END $$;

-- ── 2. Lead pipeline stages  -  win_probability + colours ──────
-- Updates ALL lead pipeline_stages for the immigration pipeline
-- by matching common stage names. Uses ILIKE for resilience.
DO $$
DECLARE
  v_tenant_id UUID;
  v_imm_pa_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_imm_pa_id FROM practice_areas
   WHERE tenant_id = v_tenant_id AND name = 'Immigration';
  IF v_imm_pa_id IS NULL THEN RETURN; END IF;

  -- Update win_probability and colour for all lead pipeline stages
  -- tied to the immigration practice area's pipeline(s)
  UPDATE pipeline_stages ps
     SET win_probability = stage_data.wp,
         color           = stage_data.clr
    FROM (VALUES
      -- Stage name pattern            win%   colour
      ('%new lead%',                    5,    '#94a3b8'),
      ('%new%',                         5,    '#94a3b8'),
      ('%initial contact%',            10,    '#60a5fa'),
      ('%contacted%',                  10,    '#60a5fa'),
      ('%consultation scheduled%',     20,    '#34d399'),
      ('%consultation booked%',        20,    '#34d399'),
      ('%consultation complete%',      35,    '#06b6d4'),
      ('%consulted%',                  35,    '#06b6d4'),
      ('%proposal%',                   50,    '#f59e0b'),
      ('%retainer offered%',           50,    '#f59e0b'),
      ('%retainer signed%',            85,    '#10b981'),
      ('%engaged%',                    85,    '#10b981'),
      ('%converted%',                 100,    '#22c55e'),
      ('%won%',                       100,    '#22c55e'),
      ('%not proceeding%',              0,    '#94a3b8'),
      ('%declined%',                    0,    '#94a3b8'),
      ('%lost%',                        0,    '#ef4444'),
      ('%refused%',                     0,    '#ef4444'),
      ('%closed%',                      0,    '#ef4444')
    ) AS stage_data(name_pattern, wp, clr)
   WHERE ps.name ILIKE stage_data.name_pattern
     AND ps.pipeline_id IN (
       SELECT id FROM pipelines
        WHERE tenant_id = v_tenant_id
          AND (practice_area = v_imm_pa_id
               OR practice_area IS NULL)
     );

  RAISE NOTICE '[133] Lead pipeline stage win_probability + colours updated.';
END $$;

COMMIT;
