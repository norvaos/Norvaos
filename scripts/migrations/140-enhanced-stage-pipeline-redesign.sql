-- ============================================================
-- 140: Enhanced Stage Pipeline Redesign
-- ============================================================
-- Completely rebuilds all matter-type stage pipelines with:
--   • More stages per matter type (detailed, process-friendly)
--   • Unique progressive colours per stage within each matter type
--   • Descriptions for every stage (shown on hover in the UI)
--   • Accurate completion_pct per stage
--   • Applies to ALL tenants via seed_tenant_defaults()
--
-- Strategy:
--   1. NULL out matter_stage_state FK columns to allow pipeline deletion
--   2. Delete all matter_stage_pipelines (cascades to matter_stages)
--   3. Replace seed_tenant_defaults() with updated stage data
--   4. Call seed_tenant_defaults() for every existing tenant
-- ============================================================

BEGIN;

-- ── 0. Schema guard — ensure description column exists on matter_stages ──
ALTER TABLE matter_stages ADD COLUMN IF NOT EXISTS description TEXT;

-- ── 1. Clear FK references in matter_stage_state (all tenants) ──────────
-- Allows pipelines and stages to be deleted without FK violations.
-- Stage history is preserved in JSONB; only the live-pointer columns
-- are cleared. Existing matters keep their matter_id links untouched.
UPDATE matter_stage_state
   SET pipeline_id       = NULL,
       current_stage_id  = NULL,
       previous_stage_id = NULL;

-- Temporarily drop NOT NULL on pipeline_id / current_stage_id to allow NULLs
-- (they were defined NOT NULL in 009; we relax them here because the redesign
--  clears them and the application re-seeds them on next stage advance).
ALTER TABLE matter_stage_state
  ALTER COLUMN pipeline_id      DROP NOT NULL,
  ALTER COLUMN current_stage_id DROP NOT NULL;

-- ── 2. Delete all existing pipelines (cascades to matter_stages) ─────────
DELETE FROM matter_stage_pipelines;

-- ── 3. Create / replace seed_tenant_defaults(p_tenant_id UUID) ───────────
-- The function is idempotent:
--   • Practice areas  — INSERT … ON CONFLICT DO NOTHING
--   • Matter types    — INSERT … ON CONFLICT DO NOTHING  (IDs preserved)
--   • Pipelines+stages — fresh insert after deletion above
CREATE OR REPLACE FUNCTION seed_tenant_defaults(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_imm_pa_id  UUID;
  v_gen_pa_id  UUID;
  v_mt_id      UUID;
  v_pip_id     UUID;
BEGIN
  -- ────────────────────────────────────────────────────────────
  -- PRACTICE AREAS
  -- ────────────────────────────────────────────────────────────
  INSERT INTO practice_areas (tenant_id, name, color, is_enabled, sort_order)
  VALUES
    (p_tenant_id, 'Immigration', '#0ea5e9', TRUE, 1),
    (p_tenant_id, 'General',     '#64748b', TRUE, 99)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  SELECT id INTO v_imm_pa_id FROM practice_areas
   WHERE tenant_id = p_tenant_id AND name = 'Immigration';

  SELECT id INTO v_gen_pa_id FROM practice_areas
   WHERE tenant_id = p_tenant_id AND name = 'General';

  -- ────────────────────────────────────────────────────────────
  -- MATTER TYPES  (ON CONFLICT DO NOTHING — preserve IDs)
  -- ────────────────────────────────────────────────────────────
  IF v_imm_pa_id IS NOT NULL THEN
    INSERT INTO matter_types
      (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
    VALUES
      (p_tenant_id, v_imm_pa_id, 'Study Permit',
       'Study permit applications and extensions for students attending Canadian DLIs.',
       '#0ea5e9', 'graduation-cap', TRUE, 1),

      (p_tenant_id, v_imm_pa_id, 'Work Permit',
       'Work permit applications across all streams: LMIA-based, LMIA-exempt, IEC, and open permits.',
       '#8b5cf6', 'briefcase', TRUE, 2),

      (p_tenant_id, v_imm_pa_id, 'Express Entry',
       'Federal skilled worker, CEC, and FSTP permanent residence via the Express Entry pool.',
       '#f59e0b', 'star', TRUE, 3),

      (p_tenant_id, v_imm_pa_id, 'PR Application',
       'Provincial Nominee, Family Class, H&C, and other permanent residence streams.',
       '#6366f1', 'shield-check', TRUE, 4),

      (p_tenant_id, v_imm_pa_id, 'Visitor Visa — Inside Canada',
       'Extension of visitor status or Temporary Resident Permit for applicants already in Canada.',
       '#38bdf8', 'plane-landing', TRUE, 5),

      (p_tenant_id, v_imm_pa_id, 'Visitor Visa — Outside Canada',
       'Temporary Resident Visa (TRV) application for applicants residing outside Canada.',
       '#3b82f6', 'plane', TRUE, 6),

      (p_tenant_id, v_imm_pa_id, 'Post-Graduate Work Permit (PGWP)',
       'Open work permit for graduates of eligible Canadian designated learning institutions.',
       '#a855f7', 'award', TRUE, 7),

      (p_tenant_id, v_imm_pa_id, 'Spousal Sponsorship — Inside Canada',
       'Inland spousal/common-law PR sponsorship. Applicant receives an Open Work Permit while awaiting decision.',
       '#ec4899', 'heart', TRUE, 8),

      (p_tenant_id, v_imm_pa_id, 'Spousal Sponsorship — Outside Canada',
       'Outland spousal/common-law PR sponsorship. Applicant resides outside Canada during processing.',
       '#f43f5e', 'heart-handshake', TRUE, 9)
    ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;
  END IF;

  IF v_gen_pa_id IS NOT NULL THEN
    INSERT INTO matter_types
      (tenant_id, practice_area_id, name, description, color, icon, is_active, sort_order)
    VALUES
      (p_tenant_id, v_gen_pa_id, 'General Matter',
       'General legal matters not covered by a specific immigration or practice-area pipeline.',
       '#64748b', 'folder', TRUE, 1)
    ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- PIPELINES + STAGES
  -- ────────────────────────────────────────────────────────────

  -- ══════════════════════════════════════════════════════════
  -- STUDY PERMIT — 9 stages (sky blue family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Study Permit';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Study Permit', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Study Permit';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Eligibility Assessment',
       'Initial review of the client''s academic plans, study institution, and visa eligibility. Determine program duration, DLI status, and prior study permit history.',
       '#64748b', 1, FALSE, FALSE, 3, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'School & DLI Confirmation',
       'Verify the Designated Learning Institution (DLI) number and acceptance letter. Confirm program start date and duration for permit validity calculation.',
       '#0ea5e9', 2, FALSE, FALSE, 5, '[]'::jsonb, 15),

      (p_tenant_id, v_pip_id, 'Financial Evidence Gathered',
       'Collect proof of funds (bank statements, GIC, scholarship letters) sufficient to meet IRCC financial requirements for tuition and living expenses.',
       '#0ea5e9', 3, FALSE, FALSE, 14, '[]'::jsonb, 28),

      (p_tenant_id, v_pip_id, 'Application Package Preparation',
       'Complete IMM 1294 (or online equivalent), assemble supporting documents, and prepare the photograph and fee receipt.',
       '#0284c7', 4, FALSE, FALSE, 7, '[]'::jsonb, 42),

      (p_tenant_id, v_pip_id, 'Biometrics Enrolled',
       'Client attends biometrics appointment at a VAC or IRCC-authorised location. Biometrics receipt confirmed.',
       '#0284c7', 5, FALSE, FALSE, 3, '[]'::jsonb, 54),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews the completed application package, confirms all information is accurate, and signs statutory declarations.',
       '#075985', 6, FALSE, FALSE, 5, '[]'::jsonb, 64),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted through the IRCC online portal. Acknowledgement of receipt recorded. Permit type confirmed.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 75),

      (p_tenant_id, v_pip_id, 'IRCC Processing',
       'Application is under review by IRCC. Processing times vary by visa office and time of year. Client advised to monitor portal.',
       '#6d28d9', 8, FALSE, FALSE, 90, '[]'::jsonb, 90),

      (p_tenant_id, v_pip_id, 'Study Permit Issued',
       'Study permit approved and issued. Port of entry instructions provided to client. Matter closed.',
       '#10b981', 9, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- WORK PERMIT — 10 stages (violet family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Work Permit';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Work Permit', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Work Permit';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Eligibility Assessment',
       'Determine work permit stream: open, LMIA-based, LMIA-exempt (C11, R205, etc.), or IEC. Review employer compliance and client eligibility.',
       '#64748b', 1, FALSE, FALSE, 3, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Employer & LMIA Verification',
       'Verify job offer letter, LMIA confirmation number (if applicable), or LMIA-exempt code. Confirm NOC code and wage compliance.',
       '#8b5cf6', 2, FALSE, FALSE, 7, '[]'::jsonb, 15),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather passport copies, photographs, employment contract, educational credentials, language results, and prior permit history.',
       '#8b5cf6', 3, FALSE, FALSE, 14, '[]'::jsonb, 28),

      (p_tenant_id, v_pip_id, 'Application Package Preparation',
       'Complete IMM 1295 / online form. Prepare the full application bundle including employer support letter and proof of status.',
       '#7c3aed', 4, FALSE, FALSE, 7, '[]'::jsonb, 42),

      (p_tenant_id, v_pip_id, 'Biometrics Enrolled',
       'Client completes biometrics at a VAC or IRCC-authorised site.',
       '#7c3aed', 5, FALSE, FALSE, 3, '[]'::jsonb, 54),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews and approves the complete package. Declarations signed.',
       '#6d28d9', 6, FALSE, FALSE, 5, '[]'::jsonb, 64),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted online or at port of entry. Submission confirmation recorded.',
       '#5b21b6', 7, FALSE, FALSE, 1, '[]'::jsonb, 75),

      (p_tenant_id, v_pip_id, 'Reply to IRCC / Additional Docs',
       'IRCC has issued a procedural fairness letter or requested additional evidence. Preparing and submitting the response.',
       '#2563eb', 8, FALSE, FALSE, 14, '[]'::jsonb, 83),

      (p_tenant_id, v_pip_id, 'IRCC Processing',
       'Application under active review. Port of entry or CPC processing underway.',
       '#1e40af', 9, FALSE, FALSE, 90, '[]'::jsonb, 90),

      (p_tenant_id, v_pip_id, 'Work Permit Issued',
       'Work permit approved and issued. Conditions and expiry date reviewed with client.',
       '#10b981', 10, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- EXPRESS ENTRY — 12 stages (amber/gold family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Express Entry';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Express Entry', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Express Entry';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Eligibility Assessment',
       'Assess client eligibility across all Express Entry streams: FSWP, FSTP, CEC, and PNP. Calculate preliminary CRS score.',
       '#64748b', 1, FALSE, FALSE, 5, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'NOC Code Review',
       'Confirm the correct NOC 2021 code(s) for the client''s work history. Verify skill type, duties, and hours of experience.',
       '#fbbf24', 2, FALSE, FALSE, 3, '[]'::jsonb, 12),

      (p_tenant_id, v_pip_id, 'CRS Score Optimisation',
       'Advise on CRS-boosting strategies: language re-tests, spousal profile, PNP nomination, job offer letter, or additional education.',
       '#f59e0b', 3, FALSE, FALSE, 30, '[]'::jsonb, 20),

      (p_tenant_id, v_pip_id, 'Express Entry Profile Created',
       'Create and submit the Express Entry profile in the IRCC portal. Record profile number, ITA eligibility details, and CRS score.',
       '#d97706', 4, FALSE, FALSE, 1, '[]'::jsonb, 30),

      (p_tenant_id, v_pip_id, 'In the Pool — Awaiting ITA',
       'Profile is active in the Express Entry pool. Monitor draws and advise client on CRS cutoff trends.',
       '#b45309', 5, FALSE, FALSE, 1, '[]'::jsonb, 38),

      (p_tenant_id, v_pip_id, 'Invitation to Apply (ITA) Received',
       'ITA issued. 60-day application window starts. Confirm document checklist with client immediately.',
       '#92400e', 6, FALSE, FALSE, 1, '[]'::jsonb, 45),

      (p_tenant_id, v_pip_id, 'Document Collection (60-day window)',
       'Collect all required documents: police certificates, medicals, photos, language results, work reference letters, ECA, and proof of funds.',
       '#7c3aed', 7, FALSE, FALSE, 20, '[]'::jsonb, 55),

      (p_tenant_id, v_pip_id, 'Application Package Preparation',
       'Compile the complete PR application. Complete Schedule A, IMM 0008, and all schedules. Verify 60-day deadline.',
       '#6d28d9', 8, FALSE, FALSE, 10, '[]'::jsonb, 65),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews the entire package, confirms accuracy, and provides digital signatures.',
       '#5b21b6', 9, FALSE, FALSE, 5, '[]'::jsonb, 72),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted within the 60-day ITA window. AOR (Acknowledgement of Receipt) recorded.',
       '#4c1d95', 10, FALSE, FALSE, 1, '[]'::jsonb, 80),

      (p_tenant_id, v_pip_id, 'IRCC Processing & Background Checks',
       'IRCC reviews the application. Biometrics, medical exam, criminal check, and eligibility assessed.',
       '#3730a3', 11, FALSE, FALSE, 180, '[]'::jsonb, 90),

      (p_tenant_id, v_pip_id, 'PR Confirmed / COPR Issued',
       'Permanent Residence confirmed. COPR and landing instructions provided. PR card application initiated.',
       '#10b981', 12, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- PR APPLICATION — 11 stages (indigo family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'PR Application';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'PR Application', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'PR Application';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Program Assessment',
       'Assess which PR stream applies: PNP, Family Class, H&C, or other. Review eligibility criteria.',
       '#64748b', 1, FALSE, FALSE, 5, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Stream Selection & Strategy',
       'Confirm the PR stream and assess alternative pathways. Advise client on processing times and success factors.',
       '#818cf8', 2, FALSE, FALSE, 7, '[]'::jsonb, 13),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather identity documents, status documents, police certificates, medical results, photographs, and proof of relationship or status.',
       '#6366f1', 3, FALSE, FALSE, 30, '[]'::jsonb, 25),

      (p_tenant_id, v_pip_id, 'Sponsorship / Eligibility Review',
       'Review sponsor eligibility (Family Class) or employer LMIA (if applicable). Confirm no inadmissibility issues.',
       '#4f46e5', 4, FALSE, FALSE, 7, '[]'::jsonb, 38),

      (p_tenant_id, v_pip_id, 'Application Package Preparation',
       'Complete all IMM forms (IMM 0008, Schedule A, Schedule 4, etc.). Prepare the full application bundle.',
       '#4338ca', 5, FALSE, FALSE, 14, '[]'::jsonb, 50),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews and signs the completed package. All declarations confirmed.',
       '#3730a3', 6, FALSE, FALSE, 5, '[]'::jsonb, 60),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted. AOR number recorded and tracked.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 70),

      (p_tenant_id, v_pip_id, 'Biometrics & Medical Exam',
       'Client completes biometrics and medical examination. Results submitted to IRCC.',
       '#6d28d9', 8, FALSE, FALSE, 30, '[]'::jsonb, 80),

      (p_tenant_id, v_pip_id, 'Interview (if Required)',
       'IRCC may schedule an interview for additional verification. Client preparation underway.',
       '#5b21b6', 9, FALSE, FALSE, 30, '[]'::jsonb, 87),

      (p_tenant_id, v_pip_id, 'IRCC Processing & Decision',
       'Application under final IRCC review. Background and security checks completed.',
       '#4c1d95', 10, FALSE, FALSE, 180, '[]'::jsonb, 93),

      (p_tenant_id, v_pip_id, 'PR Confirmed',
       'Permanent Residence granted. COPR issued. Client advised on SIN, health card, and PR card.',
       '#10b981', 11, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- VISITOR VISA — INSIDE CANADA — 9 stages (sky family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Visitor Visa — Inside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Visitor Visa — Inside Canada', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Visitor Visa — Inside Canada';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Status Review',
       'Review current immigration status, reason for extension, and urgency. Determine if a TRP or Restoration is required.',
       '#64748b', 1, FALSE, FALSE, 3, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Extension or Restoration Assessed',
       'Confirm eligibility for a status extension vs. restoration. Advise on maintaining temporary resident status while in Canada.',
       '#38bdf8', 2, FALSE, FALSE, 5, '[]'::jsonb, 15),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather passport copies, current status documents, invitation letters, financial proof, and purpose-of-visit support.',
       '#0ea5e9', 3, FALSE, FALSE, 14, '[]'::jsonb, 28),

      (p_tenant_id, v_pip_id, 'Application Form Preparation',
       'Complete IMM 5708 (extension) or IMM 5645 and supporting forms. Verify all fields and attachments.',
       '#0284c7', 4, FALSE, FALSE, 7, '[]'::jsonb, 42),

      (p_tenant_id, v_pip_id, 'Implied Status Confirmed',
       'Confirm maintained implied status (if applicable). Advise client on travel restrictions during processing.',
       '#0369a1', 5, FALSE, FALSE, 1, '[]'::jsonb, 53),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews and signs the completed package.',
       '#075985', 6, FALSE, FALSE, 5, '[]'::jsonb, 62),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted online. Acknowledgement recorded.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 75),

      (p_tenant_id, v_pip_id, 'IRCC Processing',
       'Application under IRCC review. Biometrics (if required) completed.',
       '#6d28d9', 8, FALSE, FALSE, 90, '[]'::jsonb, 90),

      (p_tenant_id, v_pip_id, 'Decision Received',
       'Extension or TRP decision received. Conditions and new expiry reviewed with client.',
       '#10b981', 9, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- VISITOR VISA — OUTSIDE CANADA — 10 stages (blue family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Visitor Visa — Outside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Visitor Visa — Outside Canada', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Visitor Visa — Outside Canada';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Eligibility Assessment',
       'Review purpose of visit, ties to home country, financial sufficiency, and prior travel history to assess approval prospects.',
       '#64748b', 1, FALSE, FALSE, 3, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Travel Purpose & Ties Documented',
       'Collect invitation letters, hotel/travel bookings, family ties evidence, and employment confirmation from home country.',
       '#60a5fa', 2, FALSE, FALSE, 5, '[]'::jsonb, 15),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather passport, photographs, financial statements, property/employment records, and travel history.',
       '#3b82f6', 3, FALSE, FALSE, 14, '[]'::jsonb, 28),

      (p_tenant_id, v_pip_id, 'IMM 5257 Form Preparation',
       'Complete the Temporary Resident Visa application form (IMM 5257) and family information form (IMM 5645).',
       '#2563eb', 4, FALSE, FALSE, 7, '[]'::jsonb, 40),

      (p_tenant_id, v_pip_id, 'Biometrics Scheduled & Enrolled',
       'Client books and attends biometrics appointment at VAC.',
       '#1d4ed8', 5, FALSE, FALSE, 14, '[]'::jsonb, 50),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews the complete package and signs declarations.',
       '#1e40af', 6, FALSE, FALSE, 5, '[]'::jsonb, 60),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC/VAC',
       'Application submitted at VAC or online. Reference number recorded.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 72),

      (p_tenant_id, v_pip_id, 'Additional Docs Requested (if any)',
       'IRCC or VAC has requested additional information. Response prepared and submitted.',
       '#6d28d9', 8, FALSE, FALSE, 14, '[]'::jsonb, 82),

      (p_tenant_id, v_pip_id, 'IRCC Processing',
       'Application under review at the visa office. Processing times monitored.',
       '#4c1d95', 9, FALSE, FALSE, 60, '[]'::jsonb, 91),

      (p_tenant_id, v_pip_id, 'Decision Received',
       'Decision issued. Visa stamp or refusal letter reviewed with client.',
       '#10b981', 10, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- POST-GRADUATE WORK PERMIT (PGWP) — 10 stages (purple family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Post-Graduate Work Permit (PGWP)';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Post-Graduate Work Permit (PGWP)', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Post-Graduate Work Permit (PGWP)';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Eligibility Assessment',
       'Confirm PGWP eligibility: program length (≥8 months), DLI eligibility, graduation date, and prior PGWP history.',
       '#64748b', 1, FALSE, FALSE, 3, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Graduation & DLI Verification',
       'Verify final transcript, graduation letter, and DLI on the eligible institutions list. Confirm program duration for permit length.',
       '#c084fc', 2, FALSE, FALSE, 5, '[]'::jsonb, 15),

      (p_tenant_id, v_pip_id, 'PGWP Duration Planning',
       'Calculate the maximum PGWP duration based on program length. Advise client on future status pathways (CEC, Provincial Nominee).',
       '#a855f7', 3, FALSE, FALSE, 3, '[]'::jsonb, 25),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather passport, study permit, graduation letter, transcript, photographs, and proof of current status.',
       '#9333ea', 4, FALSE, FALSE, 10, '[]'::jsonb, 36),

      (p_tenant_id, v_pip_id, 'IMM 5710 Form Preparation',
       'Complete the PGWP application form (IMM 5710) and supporting documents checklist.',
       '#7e22ce', 5, FALSE, FALSE, 5, '[]'::jsonb, 48),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Client reviews and approves the completed application. Statutory declarations signed.',
       '#6b21a8', 6, FALSE, FALSE, 3, '[]'::jsonb, 58),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Application submitted online immediately after graduation (study permit still valid). Submission confirmation recorded.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 70),

      (p_tenant_id, v_pip_id, 'Biometrics (if Required)',
       'Client completes biometrics if required (first-time Canadian permit applicants).',
       '#6d28d9', 8, FALSE, FALSE, 14, '[]'::jsonb, 80),

      (p_tenant_id, v_pip_id, 'IRCC Processing',
       'Application under IRCC review. Implied status maintained if applied before study permit expiry.',
       '#5b21b6', 9, FALSE, FALSE, 60, '[]'::jsonb, 90),

      (p_tenant_id, v_pip_id, 'Work Permit Received',
       'PGWP issued. Expiry date and work conditions confirmed. Client advised on CEC/PR pathways.',
       '#10b981', 10, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SPOUSAL SPONSORSHIP — INSIDE CANADA — 12 stages (pink family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Spousal Sponsorship — Inside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Spousal Sponsorship — Inside Canada', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Spousal Sponsorship — Inside Canada';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Relationship Assessment',
       'Assess genuineness of relationship, current immigration status of the applicant, and sponsor eligibility.',
       '#64748b', 1, FALSE, FALSE, 5, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Sponsor Eligibility Confirmed',
       'Confirm sponsor meets IRCC requirements: Canadian citizen or PR, financial ability, no prior sponsorship undertaking defaults.',
       '#f472b6', 2, FALSE, FALSE, 7, '[]'::jsonb, 12),

      (p_tenant_id, v_pip_id, 'Relationship Evidence Planning',
       'Advise on compiling relationship evidence: photos, communications, joint accounts, affidavits, and letters of support.',
       '#ec4899', 3, FALSE, FALSE, 7, '[]'::jsonb, 20),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather all identity, status, relationship, and financial documents for both sponsor and applicant.',
       '#db2777', 4, FALSE, FALSE, 30, '[]'::jsonb, 30),

      (p_tenant_id, v_pip_id, 'OWP Application Submitted',
       'Open Work Permit application submitted concurrently (simultaneous submissions). Confirmation recorded.',
       '#be185d', 5, FALSE, FALSE, 1, '[]'::jsonb, 38),

      (p_tenant_id, v_pip_id, 'OWP Under IRCC Review',
       'OWP application under review. Client advised to maintain valid status while awaiting decision.',
       '#9d174d', 6, FALSE, FALSE, 90, '[]'::jsonb, 46),

      (p_tenant_id, v_pip_id, 'OWP Received',
       'Open Work Permit issued. Client can begin employment while PR application is under review.',
       '#831843', 7, FALSE, FALSE, 1, '[]'::jsonb, 52),

      (p_tenant_id, v_pip_id, 'PR Application Preparation',
       'Complete IMM 0008, Schedule A, IMM 5540 (sponsor), IMM 5481 (undertaking), and supporting bundles.',
       '#7c3aed', 8, FALSE, FALSE, 14, '[]'::jsonb, 60),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Sponsor and applicant review and sign all declarations.',
       '#6d28d9', 9, FALSE, FALSE, 5, '[]'::jsonb, 68),

      (p_tenant_id, v_pip_id, 'PR Application Submitted to IRCC',
       'Full PR application submitted. AOR recorded.',
       '#5b21b6', 10, FALSE, FALSE, 1, '[]'::jsonb, 75),

      (p_tenant_id, v_pip_id, 'Biometrics, Medical & IRCC Review',
       'Biometrics and medical examination complete. Application under IRCC security and eligibility review.',
       '#4c1d95', 11, FALSE, FALSE, 365, '[]'::jsonb, 88),

      (p_tenant_id, v_pip_id, 'PR Confirmed',
       'PR approved. COPR issued. Transition to PR status completed.',
       '#10b981', 12, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SPOUSAL SPONSORSHIP — OUTSIDE CANADA — 12 stages (rose family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_imm_pa_id
     AND name = 'Spousal Sponsorship — Outside Canada';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'Spousal Sponsorship — Outside Canada', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'Spousal Sponsorship — Outside Canada';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Relationship Assessment',
       'Assess the genuineness of the relationship and sponsor eligibility. Review whether inside or outside Canada stream is optimal.',
       '#64748b', 1, FALSE, FALSE, 5, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Sponsor Eligibility Confirmed',
       'Confirm sponsor''s Canadian status, financial capacity, and no inadmissibility issues.',
       '#fb7185', 2, FALSE, FALSE, 7, '[]'::jsonb, 13),

      (p_tenant_id, v_pip_id, 'Relationship Evidence Planning',
       'Plan evidence package: photos, correspondence, travel history together, affidavits, and statutory declarations.',
       '#f43f5e', 3, FALSE, FALSE, 7, '[]'::jsonb, 20),

      (p_tenant_id, v_pip_id, 'Document Collection',
       'Gather all identity, status, relationship, and financial documents.',
       '#e11d48', 4, FALSE, FALSE, 30, '[]'::jsonb, 30),

      (p_tenant_id, v_pip_id, 'Application Package Preparation',
       'Complete IMM 0008, Schedule A, IMM 5540, IMM 5481, and all sponsorship undertaking forms.',
       '#be123c', 5, FALSE, FALSE, 14, '[]'::jsonb, 42),

      (p_tenant_id, v_pip_id, 'Client Review & Signature',
       'Both sponsor and applicant review and sign all declarations.',
       '#9f1239', 6, FALSE, FALSE, 5, '[]'::jsonb, 52),

      (p_tenant_id, v_pip_id, 'Application Submitted to IRCC',
       'Sponsorship and PR application submitted. AOR recorded.',
       '#7c3aed', 7, FALSE, FALSE, 1, '[]'::jsonb, 62),

      (p_tenant_id, v_pip_id, 'Sponsorship Approved (Stage 1)',
       'IRCC approves the sponsorship portion. File transferred to overseas visa office.',
       '#6d28d9', 8, FALSE, FALSE, 120, '[]'::jsonb, 72),

      (p_tenant_id, v_pip_id, 'Biometrics & Medical Exam',
       'Applicant completes biometrics at VAC and attends IRCC-approved medical examination.',
       '#5b21b6', 9, FALSE, FALSE, 30, '[]'::jsonb, 80),

      (p_tenant_id, v_pip_id, 'Visa Office Interview (if Required)',
       'Overseas visa office may request an interview to assess relationship genuineness.',
       '#4c1d95', 10, FALSE, FALSE, 30, '[]'::jsonb, 87),

      (p_tenant_id, v_pip_id, 'Visa Office Processing',
       'Final review by overseas visa office. Background and security checks.',
       '#3730a3', 11, FALSE, FALSE, 180, '[]'::jsonb, 94),

      (p_tenant_id, v_pip_id, 'PR Visa Issued',
       'Spousal PR visa issued. Travel and landing instructions provided.',
       '#10b981', 12, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- GENERAL MATTER — 6 stages (slate family)
  -- ══════════════════════════════════════════════════════════
  SELECT id INTO v_mt_id FROM matter_types
   WHERE tenant_id = p_tenant_id
     AND practice_area_id = v_gen_pa_id
     AND name = 'General Matter';

  IF v_mt_id IS NOT NULL THEN
    INSERT INTO matter_stage_pipelines
      (tenant_id, matter_type_id, name, is_default, is_active)
    VALUES (p_tenant_id, v_mt_id, 'General Pipeline', TRUE, TRUE)
    ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

    SELECT id INTO v_pip_id FROM matter_stage_pipelines
     WHERE tenant_id = p_tenant_id AND matter_type_id = v_mt_id AND name = 'General Pipeline';

    INSERT INTO matter_stages
      (tenant_id, pipeline_id, name, description, color, sort_order, is_terminal, auto_close_matter, sla_days, gating_rules, completion_pct)
    VALUES
      (p_tenant_id, v_pip_id, 'Intake & Assessment',
       'Receive and assess the matter. Document client objectives, key facts, and deadlines. Perform initial conflict check.',
       '#64748b', 1, FALSE, FALSE, 7, '[]'::jsonb, 5),

      (p_tenant_id, v_pip_id, 'Research & Strategy',
       'Research applicable law and precedents. Develop legal strategy and advise client on options and risks.',
       '#475569', 2, FALSE, FALSE, 14, '[]'::jsonb, 20),

      (p_tenant_id, v_pip_id, 'Active Work',
       'Drafting, negotiations, correspondence, and legal work underway.',
       '#334155', 3, FALSE, FALSE, 30, '[]'::jsonb, 42),

      (p_tenant_id, v_pip_id, 'Client Review & Approval',
       'Send completed work product to client for review. Collect feedback and approvals.',
       '#1e293b', 4, FALSE, FALSE, 5, '[]'::jsonb, 62),

      (p_tenant_id, v_pip_id, 'Filing / Submission',
       'File documents with court, tribunal, or relevant authority. Confirm receipt.',
       '#7c3aed', 5, FALSE, FALSE, 3, '[]'::jsonb, 78),

      (p_tenant_id, v_pip_id, 'Closed',
       'Matter resolved and file closed. Client advised of outcome.',
       '#10b981', 6, TRUE, TRUE, 1, '[]'::jsonb, 100)
    ON CONFLICT (pipeline_id, name) DO UPDATE SET
      description    = EXCLUDED.description,
      color          = EXCLUDED.color,
      completion_pct = EXCLUDED.completion_pct,
      sla_days       = EXCLUDED.sla_days,
      gating_rules   = EXCLUDED.gating_rules;
  END IF;

  RAISE NOTICE '[140] seed_tenant_defaults complete for tenant %', p_tenant_id;
END;
$$;

-- ── 4. Backfill all existing tenants ─────────────────────────────────────
SELECT seed_tenant_defaults(id) FROM tenants;

COMMIT;
