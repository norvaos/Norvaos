-- ============================================================================
-- Migration 072: Immigration Sequence Control Layer
-- ============================================================================
-- Adds immigration-specific intake status tracking, contradiction flags,
-- lawyer review workflow, and stale draft detection.
--
-- Does NOT modify the existing intake_status column (used by generic gating).
-- Adds a parallel immigration_intake_status column with 10 granular states.
-- ============================================================================

-- ─── Immigration Intake Status ──────────────────────────────────────────────

ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  immigration_intake_status TEXT DEFAULT 'not_issued';

-- Add CHECK constraint (safe: uses IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matter_intake_imm_intake_status_check'
  ) THEN
    ALTER TABLE matter_intake ADD CONSTRAINT matter_intake_imm_intake_status_check
      CHECK (immigration_intake_status IN (
        'not_issued',
        'issued',
        'client_in_progress',
        'review_required',
        'deficiency_outstanding',
        'intake_complete',
        'drafting_enabled',
        'lawyer_review',
        'ready_for_filing',
        'filed'
      ));
  END IF;
END $$;

-- Track who/when for immigration status transitions
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  imm_status_changed_at TIMESTAMPTZ;
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  imm_status_changed_by UUID REFERENCES users(id);

-- ─── Contradiction Flags ────────────────────────────────────────────────────

ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  contradiction_flags JSONB DEFAULT '[]';

-- Lawyer override for contradictions
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  contradiction_override_by UUID REFERENCES users(id);
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  contradiction_override_at TIMESTAMPTZ;
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  contradiction_override_reason TEXT;

-- ─── Lawyer Review Workflow ─────────────────────────────────────────────────

ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  lawyer_review_status TEXT DEFAULT 'not_required';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matter_intake_lawyer_review_status_check'
  ) THEN
    ALTER TABLE matter_intake ADD CONSTRAINT matter_intake_lawyer_review_status_check
      CHECK (lawyer_review_status IN (
        'not_required',
        'pending',
        'approved',
        'changes_requested'
      ));
  END IF;
END $$;

ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  lawyer_review_by UUID REFERENCES users(id);
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  lawyer_review_at TIMESTAMPTZ;
ALTER TABLE matter_intake ADD COLUMN IF NOT EXISTS
  lawyer_review_notes TEXT;

-- ─── Stale Draft Tracking on Form Pack Versions ─────────────────────────────

ALTER TABLE form_pack_versions ADD COLUMN IF NOT EXISTS
  is_stale BOOLEAN DEFAULT false;
ALTER TABLE form_pack_versions ADD COLUMN IF NOT EXISTS
  stale_reason TEXT;
ALTER TABLE form_pack_versions ADD COLUMN IF NOT EXISTS
  stale_at TIMESTAMPTZ;

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- Review queue: filter by immigration intake status
CREATE INDEX IF NOT EXISTS idx_matter_intake_imm_status
  ON matter_intake(tenant_id, immigration_intake_status)
  WHERE immigration_intake_status IS NOT NULL
    AND immigration_intake_status != 'not_issued';

-- Review queue: filter by lawyer review status
CREATE INDEX IF NOT EXISTS idx_matter_intake_lawyer_review
  ON matter_intake(tenant_id, lawyer_review_status)
  WHERE lawyer_review_status IN ('pending', 'changes_requested');

-- Stale pack lookup
CREATE INDEX IF NOT EXISTS idx_form_pack_versions_stale
  ON form_pack_versions(matter_id, is_stale)
  WHERE is_stale = true;

-- ─── RLS Policies ───────────────────────────────────────────────────────────
-- matter_intake already has RLS policies from prior migrations.
-- form_pack_versions already has RLS policies from migration 052.
-- New columns are covered by existing row-level policies (same table, same rows).

-- ─── Gating Rules on Immigration Stages ───────────────────────────────────
-- Add immigration-specific gating rules to pipeline stages for all immigration
-- matter types. Uses COALESCE + jsonb concatenation to preserve existing rules.

-- Stages at sort_order >= 3 (Application Preparation onwards):
--   require no blocking contradictions
DO $$
BEGIN
  UPDATE matter_stages ms
  SET gating_rules = COALESCE(ms.gating_rules, '[]'::jsonb) || '[{"type": "require_no_contradictions", "severity": "blocking"}]'::jsonb
  FROM matter_stage_pipelines p
  JOIN matter_types mt ON mt.id = p.matter_type_id
  WHERE ms.pipeline_id = p.id
    AND mt.program_category_key IN (
      'spousal', 'work_permit', 'study_permit', 'express_entry',
      'refugee', 'visitor_visa', 'citizenship', 'lmia'
    )
    AND ms.sort_order >= 3
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(ms.gating_rules, '[]'::jsonb)) AS rule
      WHERE rule->>'type' = 'require_no_contradictions'
    );
END $$;

-- "Application Filed" / "LMIA Application Filed" stages:
--   require immigration intake status >= ready_for_filing
DO $$
BEGIN
  UPDATE matter_stages ms
  SET gating_rules = COALESCE(ms.gating_rules, '[]'::jsonb) || '[{"type": "require_imm_intake_status", "minimum_status": "ready_for_filing"}]'::jsonb
  FROM matter_stage_pipelines p
  JOIN matter_types mt ON mt.id = p.matter_type_id
  WHERE ms.pipeline_id = p.id
    AND mt.program_category_key IN (
      'spousal', 'work_permit', 'study_permit', 'express_entry',
      'refugee', 'visitor_visa', 'citizenship', 'lmia'
    )
    AND ms.name ILIKE '%filed%'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(ms.gating_rules, '[]'::jsonb)) AS rule
      WHERE rule->>'type' = 'require_imm_intake_status'
    );
END $$;

-- Preparation stages (sort_order >= 3, before "Filed"):
--   require immigration intake status >= intake_complete
DO $$
BEGIN
  UPDATE matter_stages ms
  SET gating_rules = COALESCE(ms.gating_rules, '[]'::jsonb) || '[{"type": "require_imm_intake_status", "minimum_status": "intake_complete"}]'::jsonb
  FROM matter_stage_pipelines p
  JOIN matter_types mt ON mt.id = p.matter_type_id
  WHERE ms.pipeline_id = p.id
    AND mt.program_category_key IN (
      'spousal', 'work_permit', 'study_permit', 'express_entry',
      'refugee', 'visitor_visa', 'citizenship', 'lmia'
    )
    AND ms.sort_order >= 3
    AND ms.name NOT ILIKE '%filed%'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(ms.gating_rules, '[]'::jsonb)) AS rule
      WHERE rule->>'type' = 'require_imm_intake_status'
    );
END $$;
