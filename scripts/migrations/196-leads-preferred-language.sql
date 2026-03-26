-- ============================================================================
-- Migration 196 — Leads preferred_language: dedicated column + backfill
-- ============================================================================
-- Promotes preferred_language from custom_fields JSONB to a dedicated column
-- for direct query access and portal language selection.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT NULL;
COMMENT ON COLUMN leads.preferred_language IS 'ISO 639-1 locale code. Promoted from custom_fields JSONB for direct query access.';

CREATE INDEX IF NOT EXISTS idx_leads_preferred_language ON leads(tenant_id, preferred_language) WHERE preferred_language IS NOT NULL;

-- Backfill from custom_fields JSONB
UPDATE leads
SET preferred_language = (custom_fields->>'preferred_language')::VARCHAR(5)
WHERE custom_fields->>'preferred_language' IS NOT NULL
  AND preferred_language IS NULL;
