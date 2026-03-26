-- ============================================================================
-- Migration 193: Add home_province to tenants
-- Purpose: Store the firm's regulatory province/territory for Law Society
--          resolution. This drives the Compliance Badge, Regulatory Sidebar,
--          and Place-of-Supply tax logic.
-- ============================================================================

-- Add column (nullable  -  existing tenants keep NULL until configured)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS home_province TEXT;

-- Add constraint to ensure valid Canadian province codes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_home_province_code'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT chk_home_province_code
      CHECK (
        home_province IS NULL
        OR home_province IN (
          'ON','BC','AB','QC','SK','MB','NB','NS','PE','NL','NT','NU','YT'
        )
      );
  END IF;
END $$;

-- Comment for documentation
COMMENT ON COLUMN tenants.home_province IS
  'Two-letter Canadian province/territory code (e.g. ON, BC, AB). Determines the regulatory Law Society for this firm.';
