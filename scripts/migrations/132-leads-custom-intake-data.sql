-- Migration 132: Add custom_intake_data column to leads table
--
-- Purpose: Store screening/intake answers collected at the front desk
--          (Quick Create wizard Step 3) directly on the lead row.
--          The column holds a JSONB map of question_id → answer pairs.
--
-- Run in: Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS custom_intake_data JSONB DEFAULT NULL;

-- Optional index for future querying of intake data fields
CREATE INDEX IF NOT EXISTS idx_leads_custom_intake_data
  ON leads USING gin (custom_intake_data)
  WHERE custom_intake_data IS NOT NULL;

-- No RLS changes needed  -  leads already has tenant-scoped RLS.
