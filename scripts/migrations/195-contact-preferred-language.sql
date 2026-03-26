-- ============================================================================
-- Migration 195 — Contact preferred_language: index + data backfill
-- ============================================================================
-- The dedicated column was added in migration 184 (polyglot-bridge).
-- This migration adds:
--   1. Composite index for query performance and portal email language selection
--   2. Data migration from custom_fields JSONB for any rows not yet backfilled
-- ============================================================================

-- Add dedicated preferred_language column if somehow missing (idempotent guard)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT NULL;
COMMENT ON COLUMN contacts.preferred_language IS 'ISO 639-1 locale code (en, fr, ur, etc.). Used for portal invites, automated emails, and client-facing documents.';

-- Composite index for tenant-scoped language queries
CREATE INDEX IF NOT EXISTS idx_contacts_preferred_language ON contacts(tenant_id, preferred_language) WHERE preferred_language IS NOT NULL;

-- Migrate existing data from custom_fields JSONB
UPDATE contacts
SET preferred_language = (custom_fields->>'preferred_language')::VARCHAR(5)
WHERE custom_fields->>'preferred_language' IS NOT NULL
  AND preferred_language IS NULL;
