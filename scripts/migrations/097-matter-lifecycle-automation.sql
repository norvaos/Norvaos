-- ============================================================================
-- Migration 097: Matter Lifecycle Automation
-- ============================================================================
-- Post-submission document classification, outcome events, expiry reminders,
-- and the post-decision lifecycle for immigration matters.
--
-- Tables:
--   1. post_submission_document_types  -  configurable document type catalogue
--   2. matter_outcome_events  -  tracks outcomes (approval, refusal, etc.)
--   3. expiry_reminder_rules  -  configurable reminder offsets
--   4. extracted_document_fields  -  OCR/AI extracted fields from documents
--   5. contact_status_records  -  permits, visas, PR cards with expiry tracking
--   6. drafting_prep_questions  -  questions for pre-drafting preparation
--   7. drafting_prep_responses  -  matter-specific answers
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. post_submission_document_types
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS post_submission_document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  stage_change_target TEXT,
  creates_deadline BOOLEAN NOT NULL DEFAULT false,
  deadline_days INTEGER,
  creates_task BOOLEAN NOT NULL DEFAULT false,
  task_template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  triggers_communication BOOLEAN NOT NULL DEFAULT false,
  communication_template_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_post_sub_doc_types_tenant ON post_submission_document_types(tenant_id);

ALTER TABLE post_submission_document_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_post_submission_document_types'
  ) THEN
    CREATE POLICY tenant_isolation_post_submission_document_types ON post_submission_document_types
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. matter_outcome_events
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS matter_outcome_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'acknowledgement', 'biometric', 'medical', 'passport_request',
    'pfl', 'approval', 'refusal', 'withdrawal', 'return'
  )),
  document_id UUID,
  outcome_data JSONB NOT NULL DEFAULT '{}',
  next_action TEXT CHECK (next_action IN (
    'reconsideration', 'judicial_review', 'appeal', 'fresh_application', 'no_action'
  )),
  next_matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matter_outcome_events_matter ON matter_outcome_events(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_outcome_events_tenant ON matter_outcome_events(tenant_id);

ALTER TABLE matter_outcome_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_matter_outcome_events'
  ) THEN
    CREATE POLICY tenant_isolation_matter_outcome_events ON matter_outcome_events
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. expiry_reminder_rules
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expiry_reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_offset_days INTEGER NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('email', 'task', 'notification')),
  template_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expiry_reminder_rules_tenant ON expiry_reminder_rules(tenant_id);

ALTER TABLE expiry_reminder_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_expiry_reminder_rules'
  ) THEN
    CREATE POLICY tenant_isolation_expiry_reminder_rules ON expiry_reminder_rules
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. extracted_document_fields
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS extracted_document_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  extracted_value TEXT NOT NULL,
  confidence_score DECIMAL NOT NULL DEFAULT 0,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  mapped_to_canonical_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extracted_doc_fields_document ON extracted_document_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_doc_fields_tenant ON extracted_document_fields(tenant_id);

ALTER TABLE extracted_document_fields ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_extracted_document_fields'
  ) THEN
    CREATE POLICY tenant_isolation_extracted_document_fields ON extracted_document_fields
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. contact_status_records
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contact_status_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status_type TEXT NOT NULL CHECK (status_type IN (
    'work_permit', 'study_permit', 'pr', 'citizenship', 'visa'
  )),
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  document_reference TEXT NOT NULL DEFAULT '',
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_status_records_contact_expiry ON contact_status_records(contact_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_contact_status_records_expiry ON contact_status_records(expiry_date);
CREATE INDEX IF NOT EXISTS idx_contact_status_records_tenant ON contact_status_records(tenant_id);

ALTER TABLE contact_status_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_contact_status_records'
  ) THEN
    CREATE POLICY tenant_isolation_contact_status_records ON contact_status_records
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. drafting_prep_questions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drafting_prep_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id UUID REFERENCES matter_types(id) ON DELETE SET NULL,
  question_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  applies_when JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafting_prep_questions_tenant ON drafting_prep_questions(tenant_id);

ALTER TABLE drafting_prep_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_drafting_prep_questions'
  ) THEN
    CREATE POLICY tenant_isolation_drafting_prep_questions ON drafting_prep_questions
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. drafting_prep_responses
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drafting_prep_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES drafting_prep_questions(id) ON DELETE CASCADE,
  response TEXT NOT NULL DEFAULT '',
  responded_by UUID NOT NULL REFERENCES users(id),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matter_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_drafting_prep_responses_matter ON drafting_prep_responses(matter_id);
CREATE INDEX IF NOT EXISTS idx_drafting_prep_responses_tenant ON drafting_prep_responses(tenant_id);

ALTER TABLE drafting_prep_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_drafting_prep_responses'
  ) THEN
    CREATE POLICY tenant_isolation_drafting_prep_responses ON drafting_prep_responses
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Seed Data  -  Standard IRCC Post-Submission Document Types
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: These are seeded per-tenant. In a multi-tenant setup, run for each tenant.
-- For now, we insert with a placeholder tenant_id that should be replaced.
-- The application layer seeds these on first use via getPostSubmissionDocTypes().

-- No hard-coded tenant seed  -  the application layer initialises these per tenant.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. Seed Data  -  Default Expiry Reminder Rules
-- ═══════════════════════════════════════════════════════════════════════════════
-- Same approach: seeded per-tenant by the application layer on first access.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. Helper function  -  seed post-submission doc types for a tenant
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION seed_post_submission_doc_types(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO post_submission_document_types (tenant_id, key, label, stage_change_target, creates_deadline, deadline_days, creates_task, sort_order)
  VALUES
    (p_tenant_id, 'acknowledgement', 'Acknowledgement of Receipt (AOR)', 'Submitted', false, NULL, false, 1),
    (p_tenant_id, 'biometric_instruction', 'Biometric Instruction Letter', NULL, true, 30, true, 2),
    (p_tenant_id, 'medical_request', 'Medical Examination Request', NULL, true, 60, true, 3),
    (p_tenant_id, 'passport_request', 'Passport Request (PPR)', 'Passport Requested', true, 30, true, 4),
    (p_tenant_id, 'adr', 'Additional Document Request (ADR)', NULL, true, 30, true, 5),
    (p_tenant_id, 'pfl', 'Procedural Fairness Letter (PFL)', NULL, true, 30, true, 6),
    (p_tenant_id, 'generic_ircc', 'Other IRCC Correspondence', NULL, false, NULL, false, 7),
    (p_tenant_id, 'approval', 'Approval / Grant Letter', 'Approved', false, NULL, true, 8),
    (p_tenant_id, 'refusal', 'Refusal Letter', 'Refused', false, NULL, true, 9),
    (p_tenant_id, 'withdrawal', 'Withdrawal Confirmation', 'Withdrawn', false, NULL, false, 10),
    (p_tenant_id, 'return_notice', 'Return of Application', 'Returned', false, NULL, true, 11),
    (p_tenant_id, 'hearing_notice', 'Hearing Notice', NULL, true, 14, true, 12)
  ON CONFLICT (tenant_id, key) DO NOTHING;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. Helper function  -  seed default expiry reminder rules for a tenant
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION seed_expiry_reminder_rules(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only seed if no rules exist for this tenant
  IF NOT EXISTS (SELECT 1 FROM expiry_reminder_rules WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO expiry_reminder_rules (tenant_id, reminder_offset_days, reminder_type)
    VALUES
      (p_tenant_id, -60, 'notification'),
      (p_tenant_id, -30, 'notification'),
      (p_tenant_id, -14, 'task'),
      (p_tenant_id, -7, 'email');
  END IF;
END;
$$;
