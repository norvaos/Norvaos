-- Migration 164: Lead-to-Matter Data Carry-Forward
--
-- Purpose: Ensure 100% data carry-forward from leads to matters during conversion.
--          No client should ever be asked the same question twice because the system
--          "lost" their intake data.
--
-- Changes:
--   1. Add UTM/source attribution columns to `matters` (mirrors leads table pattern)
--   2. Add `lead_intake_snapshot` JSONB to `matter_intake` to carry forward all
--      screening answers and intake profile data from the lead
--
-- Run in: Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── 1. Source Attribution on Matters ─────────────────────────────────────────
-- These columns mirror the leads table so marketing attribution is preserved
-- through the full lead → matter lifecycle.

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_detail TEXT DEFAULT NULL;

COMMENT ON COLUMN matters.utm_source IS 'UTM source tag carried forward from originating lead';
COMMENT ON COLUMN matters.utm_medium IS 'UTM medium tag carried forward from originating lead';
COMMENT ON COLUMN matters.utm_campaign IS 'UTM campaign tag carried forward from originating lead';
COMMENT ON COLUMN matters.source IS 'Lead source (e.g. intake_form, referral, walk_in) carried forward from originating lead';
COMMENT ON COLUMN matters.source_detail IS 'Detailed source info carried forward from originating lead';

-- Index for marketing analytics queries (filter by source/campaign)
CREATE INDEX IF NOT EXISTS idx_matters_utm_source
  ON matters (tenant_id, utm_source)
  WHERE utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matters_source
  ON matters (tenant_id, source)
  WHERE source IS NOT NULL;

-- ─── 2. Lead Intake Snapshot on matter_intake ────────────────────────────────
-- Carries forward ALL intake data collected during the lead phase:
--   - leads.custom_intake_data (front desk screening answers)
--   - lead_intake_profiles.custom_intake_data (practice-area-specific intake)
--   - lead_intake_profiles metadata (jurisdiction, urgency, flags, etc.)
--
-- This is a read-only snapshot  -  the matter's own intake forms should pre-fill
-- from this data to avoid asking the client the same questions twice.

ALTER TABLE matter_intake
  ADD COLUMN IF NOT EXISTS lead_intake_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN matter_intake.lead_intake_snapshot IS
  'Snapshot of all intake data from the originating lead (custom_intake_data + intake_profile). '
  'Used to pre-fill matter intake forms and prevent duplicate data collection.';

-- GIN index for querying snapshot contents
CREATE INDEX IF NOT EXISTS idx_matter_intake_lead_snapshot
  ON matter_intake USING gin (lead_intake_snapshot)
  WHERE lead_intake_snapshot IS NOT NULL;

-- No RLS changes needed  -  matters and matter_intake already have tenant-scoped RLS.
