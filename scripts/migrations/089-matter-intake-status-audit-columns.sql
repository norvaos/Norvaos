-- Migration 089: Add missing immigration intake status audit columns to matter_intake
--
-- Root cause: immigration_intake_status, imm_status_changed_at, and imm_status_changed_by
-- were defined in lib/types/database.ts but never added to the actual table.
-- Every call to syncImmigrationIntakeStatus() silently failed (PGRST204) when trying
-- to write the new status, leaving matters permanently stuck at 'not_issued'.
--
-- Already applied to production on 2026-03-12 via Supabase SQL editor.

ALTER TABLE matter_intake
  ADD COLUMN IF NOT EXISTS immigration_intake_status TEXT NOT NULL DEFAULT 'not_issued',
  ADD COLUMN IF NOT EXISTS imm_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imm_status_changed_by TEXT;

-- Reload PostgREST schema cache so the new columns are immediately visible via API
NOTIFY pgrst, 'reload schema';
