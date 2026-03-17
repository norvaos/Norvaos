-- ============================================================
-- 114-extend-immigration-intake-fields.sql
-- Adds fields required by immigration-details-panel,
-- case-insights-engine, immigration-readiness query hooks,
-- and form_pack_versions staleness tracking.
-- ============================================================

-- ── matter_immigration: case-type-specific fields ───────────────────────────
-- Study-stream fields
ALTER TABLE matter_immigration
  ADD COLUMN IF NOT EXISTS program_category         text,
  ADD COLUMN IF NOT EXISTS study_program            text,
  ADD COLUMN IF NOT EXISTS study_level              text,
  ADD COLUMN IF NOT EXISTS dli_number               text,
  ADD COLUMN IF NOT EXISTS study_duration_months    integer,
  ADD COLUMN IF NOT EXISTS letter_of_acceptance     boolean;

-- Work-permit fields
ALTER TABLE matter_immigration
  ADD COLUMN IF NOT EXISTS work_permit_type         text,
  ADD COLUMN IF NOT EXISTS job_title                text;

-- Family-sponsorship fields
ALTER TABLE matter_immigration
  ADD COLUMN IF NOT EXISTS sponsor_name             text,
  ADD COLUMN IF NOT EXISTS sponsor_relationship     text,
  ADD COLUMN IF NOT EXISTS sponsor_status           text,
  ADD COLUMN IF NOT EXISTS relationship_start_date  date;

-- Second language test (bilingual EE profiles)
ALTER TABLE matter_immigration
  ADD COLUMN IF NOT EXISTS second_language_test_type   text,
  ADD COLUMN IF NOT EXISTS second_language_test_scores jsonb;

-- ── matter_intake: contradiction + lawyer-review workflow ───────────────────
ALTER TABLE matter_intake
  ADD COLUMN IF NOT EXISTS contradiction_flags       jsonb        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contradiction_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS contradiction_override_by uuid         REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lawyer_review_status      text,
  ADD COLUMN IF NOT EXISTS lawyer_review_by          uuid         REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lawyer_review_at          timestamptz,
  ADD COLUMN IF NOT EXISTS lawyer_review_notes       text;

-- ── form_pack_versions: staleness flag ──────────────────────────────────────
ALTER TABLE form_pack_versions
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;
