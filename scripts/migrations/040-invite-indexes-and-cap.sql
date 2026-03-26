-- Migration 040: user_invites indexes and constraints
-- Adds performance indexes and a unique partial index to prevent
-- duplicate active invites for the same (tenant_id, email).
--
-- These are additive-only (CREATE INDEX IF NOT EXISTS)  -  safe to
-- re-run without dropping existing data.

BEGIN;

-- 1. Composite index for seat-limit queries: count pending invites per tenant
--    Used by checkSeatLimit() and the nightly cleanup cron.
CREATE INDEX IF NOT EXISTS idx_user_invites_tenant_status_expires
  ON user_invites (tenant_id, status, expires_at);

-- 2. Unique partial index: prevent multiple active (pending + not-expired) invites
--    for the same email within a tenant. This is the authoritative constraint  - 
--    the app-layer duplicate check is a UX nicety, this is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invites_tenant_email_active
  ON user_invites (tenant_id, email)
  WHERE status = 'pending';

COMMIT;
