-- =============================================================================
-- Migration 203 — Directive 004 / Pillar 4: Statute of Limitations & Deadline Shield
-- =============================================================================
--
-- Implements compliance-grade deadline protection for immigration matters.
--
--   1. Shield columns on matter_deadlines (immutable while matter is active)
--   2. ircc_deadline_rules catalogue — IRCC filing deadline definitions
--   3. Seed 14 common IRCC deadline rules
--   4. shield_deadline_guard() trigger — prevents deletion/dismissal of shielded deadlines
--   5. rpc_scan_matter_deadlines() — auto-generates deadlines from matching rules
--   6. auto_scan_on_matter_create() trigger — fires scan on new immigration matters
--
-- Depends on: 009 (matter_types, deadline_types, matter_deadlines),
--             matters table (id, tenant_id, matter_type_id, status, practice_area_id, date_opened)
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ADD SHIELD COLUMNS TO matter_deadlines
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE matter_deadlines
  ADD COLUMN IF NOT EXISTS is_shielded      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shield_reason    TEXT,
  ADD COLUMN IF NOT EXISTS auto_generated   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_rule_id   UUID,
  ADD COLUMN IF NOT EXISTS alert_24h_sent   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_1w_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_1m_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_sent  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN matter_deadlines.is_shielded     IS 'When true, deadline cannot be deleted or dismissed while matter is active. Compliance shield.';
COMMENT ON COLUMN matter_deadlines.shield_reason    IS 'Human-readable reason why this deadline is protected (e.g. IRCC Compliance: Biometrics appointment).';
COMMENT ON COLUMN matter_deadlines.auto_generated   IS 'True if this deadline was auto-created by the system from an ircc_deadline_rules match.';
COMMENT ON COLUMN matter_deadlines.source_rule_id   IS 'FK to ircc_deadline_rules.id — which rule generated this deadline.';
COMMENT ON COLUMN matter_deadlines.alert_24h_sent   IS 'Whether the 24-hour warning alert has been dispatched.';
COMMENT ON COLUMN matter_deadlines.alert_1w_sent    IS 'Whether the 1-week warning alert has been dispatched.';
COMMENT ON COLUMN matter_deadlines.alert_1m_sent    IS 'Whether the 1-month warning alert has been dispatched.';
COMMENT ON COLUMN matter_deadlines.escalation_sent  IS 'Whether the escalation alert has been dispatched.';

CREATE INDEX IF NOT EXISTS idx_matter_deadlines_shielded
  ON matter_deadlines (matter_id)
  WHERE is_shielded = true;

CREATE INDEX IF NOT EXISTS idx_matter_deadlines_source_rule
  ON matter_deadlines (source_rule_id)
  WHERE source_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matter_deadlines_auto_generated
  ON matter_deadlines (matter_id)
  WHERE auto_generated = true;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CREATE ircc_deadline_rules TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ircc_deadline_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code           TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL,
  description         TEXT,
  practice_area_code  TEXT        NOT NULL DEFAULT 'immigration',
  matter_type_codes   TEXT[],
  trigger_event       TEXT        NOT NULL DEFAULT 'matter_created'
    CHECK (trigger_event IN ('matter_created', 'stage_advanced', 'document_received', 'manual')),
  days_from_trigger   INT         NOT NULL,
  deadline_priority   TEXT        NOT NULL DEFAULT 'high'
    CHECK (deadline_priority IN ('low', 'medium', 'high', 'critical')),
  is_shielded         BOOLEAN     NOT NULL DEFAULT true,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ircc_deadline_rules                        IS 'Catalogue of IRCC filing deadlines and statutory limitation periods. Used by rpc_scan_matter_deadlines to auto-generate shielded deadlines.';
COMMENT ON COLUMN ircc_deadline_rules.rule_code              IS 'Unique machine-readable code, e.g. IRCC-PR-RENEWAL-90.';
COMMENT ON COLUMN ircc_deadline_rules.name                   IS 'Human-readable rule name shown in UI.';
COMMENT ON COLUMN ircc_deadline_rules.practice_area_code     IS 'Practice area this rule applies to. Matched against LOWER(practice_areas.name).';
COMMENT ON COLUMN ircc_deadline_rules.matter_type_codes      IS 'Array of matter type name patterns this rule applies to. Matched via overlap with LOWER(matter_types.name).';
COMMENT ON COLUMN ircc_deadline_rules.trigger_event          IS 'What event causes this deadline to be generated: matter_created, stage_advanced, document_received, or manual.';
COMMENT ON COLUMN ircc_deadline_rules.days_from_trigger      IS 'Offset in days from trigger event. Negative = before (e.g. -90 for renewal before expiry), positive = after.';
COMMENT ON COLUMN ircc_deadline_rules.deadline_priority      IS 'Default priority assigned to generated deadlines: low, medium, high, or critical.';
COMMENT ON COLUMN ircc_deadline_rules.is_shielded            IS 'Whether deadlines generated from this rule are automatically shielded (cannot be deleted while matter is active).';
COMMENT ON COLUMN ircc_deadline_rules.is_active              IS 'Soft-delete flag. Inactive rules are skipped during scanning.';

-- RLS: ircc_deadline_rules is a global catalogue (not tenant-scoped), but restrict to authenticated users
ALTER TABLE ircc_deadline_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_deadline_rules_select
  ON ircc_deadline_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY ircc_deadline_rules_insert
  ON ircc_deadline_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY ircc_deadline_rules_update
  ON ircc_deadline_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- FK from matter_deadlines.source_rule_id to ircc_deadline_rules
ALTER TABLE matter_deadlines
  ADD CONSTRAINT fk_matter_deadlines_source_rule
  FOREIGN KEY (source_rule_id) REFERENCES ircc_deadline_rules(id)
  ON DELETE SET NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SEED IRCC DEADLINE RULES
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO ircc_deadline_rules (rule_code, name, description, practice_area_code, matter_type_codes, trigger_event, days_from_trigger, deadline_priority, is_shielded)
VALUES
  (
    'IRCC-BIOMETRICS-30',
    'Biometrics Appointment',
    'Client must complete biometrics collection within 30 days of the biometrics instruction letter.',
    'immigration',
    NULL,
    'matter_created',
    30,
    'high',
    true
  ),
  (
    'IRCC-MEDICAL-60',
    'Medical Exam',
    'Client must complete the immigration medical examination within 60 days of the medical request.',
    'immigration',
    NULL,
    'matter_created',
    60,
    'high',
    true
  ),
  (
    'IRCC-AOR-DOCS-30',
    'Additional Documents After AOR',
    'Submit any additional documents requested after Acknowledgement of Receipt within 30 days.',
    'immigration',
    NULL,
    'document_received',
    30,
    'high',
    true
  ),
  (
    'IRCC-PROCEDURAL-FAIRNESS-30',
    'Procedural Fairness Response',
    'Response to procedural fairness letter must be filed within 30 days. Failure to respond may result in refusal.',
    'immigration',
    NULL,
    'document_received',
    30,
    'critical',
    true
  ),
  (
    'IRCC-REFUGEE-BOC-15',
    'Basis of Claim Form',
    'Basis of Claim form must be submitted within 15 days of refugee claim referral to the IRB.',
    'immigration',
    ARRAY['refugee'],
    'matter_created',
    15,
    'critical',
    true
  ),
  (
    'IRCC-REFUGEE-HEARING-0',
    'Refugee Hearing Date',
    'Refugee hearing before the IRB. No extensions — attendance is mandatory.',
    'immigration',
    ARRAY['refugee'],
    'manual',
    0,
    'critical',
    true
  ),
  (
    'IRCC-PR-RENEWAL-90',
    'PR Card Renewal Before Expiry',
    'Permanent Resident card renewal application should be submitted at least 90 days before expiry to avoid status gaps.',
    'immigration',
    ARRAY['pr_application', 'pr_renewal', 'permanent_residence'],
    'matter_created',
    -90,
    'high',
    true
  ),
  (
    'IRCC-WP-EXPIRY-90',
    'Work Permit Renewal',
    'Work permit renewal application should be submitted at least 90 days before expiry to maintain implied status.',
    'immigration',
    ARRAY['work_permit'],
    'matter_created',
    -90,
    'high',
    true
  ),
  (
    'IRCC-SP-EXPIRY-90',
    'Study Permit Renewal',
    'Study permit renewal application should be submitted at least 90 days before expiry to maintain student status.',
    'immigration',
    ARRAY['study_permit'],
    'matter_created',
    -90,
    'high',
    true
  ),
  (
    'IRCC-VISA-EXPIRY-60',
    'Visa Expiry',
    'Temporary resident visa renewal should be submitted at least 60 days before expiry.',
    'immigration',
    NULL,
    'matter_created',
    -60,
    'high',
    true
  ),
  (
    'IRCC-COPR-LANDING-365',
    'Confirmation of PR Landing Deadline',
    'Client must complete landing (first entry as PR) before the COPR expiry date, typically within 365 days of medical exam.',
    'immigration',
    ARRAY['pr_application', 'permanent_residence'],
    'matter_created',
    365,
    'high',
    true
  ),
  (
    'IRCC-APPEAL-30',
    'Appeal Filing Deadline',
    'Appeal to the Immigration Appeal Division must be filed within 30 days of the decision being communicated.',
    'immigration',
    NULL,
    'document_received',
    30,
    'critical',
    true
  ),
  (
    'IRCC-JUDICIAL-REVIEW-15',
    'Federal Court Judicial Review',
    'Application for leave and judicial review to the Federal Court must be filed within 15 days of the decision (or 60 days if from outside Canada).',
    'immigration',
    NULL,
    'document_received',
    15,
    'critical',
    true
  ),
  (
    'IRCC-PRRA-15',
    'Pre-Removal Risk Assessment',
    'Pre-removal risk assessment application must be submitted within 15 days of notification.',
    'immigration',
    ARRAY['refugee', 'removal'],
    'document_received',
    15,
    'critical',
    true
  )
ON CONFLICT (rule_code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER FUNCTION: shield_deadline_guard()
-- ═══════════════════════════════════════════════════════════════════════════
-- Prevents deletion, dismissal, or un-shielding of shielded deadlines
-- while the parent matter is still active.

CREATE OR REPLACE FUNCTION shield_deadline_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matter_status TEXT;
BEGIN
  -- Only act on shielded deadlines
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_shielded IS NOT TRUE THEN
      RETURN OLD;
    END IF;
  ELSE
    IF OLD.is_shielded IS NOT TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Look up the parent matter's status
  SELECT status INTO v_matter_status
    FROM matters
   WHERE id = COALESCE(OLD.matter_id, NEW.matter_id);

  -- Allow changes if matter is in a terminal state
  IF v_matter_status IN ('closed_won', 'closed_lost', 'archived') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Matter is active — enforce shield
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMPLIANCE: Shielded deadline cannot be deleted while matter is active'
      USING ERRCODE = 'P0001';
  END IF;

  -- Block dismissal
  IF TG_OP = 'UPDATE' AND NEW.status = 'dismissed' AND OLD.status IS DISTINCT FROM 'dismissed' THEN
    RAISE EXCEPTION 'COMPLIANCE: Shielded deadline cannot be dismissed while matter is active'
      USING ERRCODE = 'P0001';
  END IF;

  -- Block un-shielding
  IF TG_OP = 'UPDATE' AND NEW.is_shielded = false AND OLD.is_shielded = true THEN
    RAISE EXCEPTION 'COMPLIANCE: Deadline shield cannot be removed while matter is active'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION shield_deadline_guard() IS 'Compliance trigger: prevents deletion, dismissal, or un-shielding of shielded deadlines while the parent matter is active.';

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS trg_shield_deadline_guard ON matter_deadlines;

CREATE TRIGGER trg_shield_deadline_guard
  BEFORE UPDATE OR DELETE ON matter_deadlines
  FOR EACH ROW
  EXECUTE FUNCTION shield_deadline_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC FUNCTION: rpc_scan_matter_deadlines(p_matter_id, p_tenant_id, p_user_id)
-- ═══════════════════════════════════════════════════════════════════════════
-- Scans ircc_deadline_rules for matching rules and auto-creates shielded
-- deadlines on the given matter. Idempotent — skips rules already applied.

CREATE OR REPLACE FUNCTION rpc_scan_matter_deadlines(
  p_matter_id  UUID,
  p_tenant_id  UUID,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice_area_name TEXT;
  v_matter_type_name   TEXT;
  v_matter_date_opened DATE;
  v_rule               RECORD;
  v_existing_count     INT;
  v_created            INT := 0;
  v_skipped            INT := 0;
  v_matched            INT := 0;
BEGIN
  -- ── 1. Look up the matter's practice area name and matter type name ──
  SELECT
    LOWER(pa.name),
    LOWER(mt.name),
    m.date_opened
  INTO
    v_practice_area_name,
    v_matter_type_name,
    v_matter_date_opened
  FROM matters m
  LEFT JOIN practice_areas pa ON pa.id = m.practice_area_id
  LEFT JOIN matter_types   mt ON mt.id = m.matter_type_id
  WHERE m.id = p_matter_id
    AND m.tenant_id = p_tenant_id;

  -- Bail out if matter not found
  IF v_practice_area_name IS NULL THEN
    RETURN jsonb_build_object(
      'deadlines_created', 0,
      'deadlines_skipped', 0,
      'rules_matched', 0,
      'error', 'Matter not found or practice area not set'
    );
  END IF;

  -- Default date_opened to today if NULL
  IF v_matter_date_opened IS NULL THEN
    v_matter_date_opened := CURRENT_DATE;
  END IF;

  -- ── 2. Iterate matching rules ────────────────────────────────────────
  FOR v_rule IN
    SELECT *
      FROM ircc_deadline_rules
     WHERE is_active = true
       AND LOWER(practice_area_code) = v_practice_area_name
       AND trigger_event = 'matter_created'
       AND (
         matter_type_codes IS NULL
         OR v_matter_type_name = ANY(
              SELECT LOWER(unnest(matter_type_codes))
            )
       )
  LOOP
    v_matched := v_matched + 1;

    -- Check if deadline already exists for this matter + rule
    SELECT COUNT(*) INTO v_existing_count
      FROM matter_deadlines
     WHERE matter_id     = p_matter_id
       AND source_rule_id = v_rule.id;

    IF v_existing_count > 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Insert the deadline
    INSERT INTO matter_deadlines (
      tenant_id,
      matter_id,
      due_date,
      description,
      status,
      priority,
      responsible_user_id,
      is_shielded,
      shield_reason,
      auto_generated,
      source_rule_id
    ) VALUES (
      p_tenant_id,
      p_matter_id,
      v_matter_date_opened + (v_rule.days_from_trigger * INTERVAL '1 day'),
      COALESCE(v_rule.description, v_rule.name),
      'pending',
      v_rule.deadline_priority,
      p_user_id,
      v_rule.is_shielded,
      'IRCC Compliance: ' || v_rule.name,
      true,
      v_rule.id
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'deadlines_created', v_created,
    'deadlines_skipped', v_skipped,
    'rules_matched',     v_matched
  );
END;
$$;

COMMENT ON FUNCTION rpc_scan_matter_deadlines(UUID, UUID, UUID) IS 'Scans ircc_deadline_rules for rules matching the matter practice area and type, then auto-creates shielded deadlines. Idempotent — skips duplicates.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. TRIGGER: auto_scan_on_matter_create()
-- ═══════════════════════════════════════════════════════════════════════════
-- When a new immigration matter is inserted, automatically run the deadline
-- scan to populate shielded IRCC deadlines.

CREATE OR REPLACE FUNCTION auto_scan_on_matter_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pa_name TEXT;
  v_result  JSONB;
BEGIN
  -- Look up the practice area name
  SELECT LOWER(pa.name) INTO v_pa_name
    FROM practice_areas pa
   WHERE pa.id = NEW.practice_area_id;

  -- Only fire for immigration matters
  IF v_pa_name IS NOT NULL AND v_pa_name LIKE '%immigration%' THEN
    v_result := rpc_scan_matter_deadlines(
      NEW.id,
      NEW.tenant_id,
      COALESCE(NEW.created_by, NEW.responsible_user_id)
    );
    -- Result is discarded; deadlines are created as a side effect
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_scan_on_matter_create() IS 'After-insert trigger on matters: auto-scans IRCC deadline rules for new immigration matters and creates shielded deadlines.';

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS trg_auto_scan_on_matter_create ON matters;

CREATE TRIGGER trg_auto_scan_on_matter_create
  AFTER INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION auto_scan_on_matter_create();


COMMIT;
