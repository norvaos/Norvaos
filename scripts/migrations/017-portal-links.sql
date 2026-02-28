-- ============================================================================
-- Migration 017: Portal Links for Client Document Upload
-- Creates portal_links table for secure, time-limited document upload portals
-- ============================================================================

-- Portal links table: stores secure tokens that give clients
-- access to upload documents against a matter's checklist.
CREATE TABLE IF NOT EXISTS portal_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id        UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  token            TEXT NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  last_accessed_at TIMESTAMPTZ,
  access_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast token lookup (portal page resolves token → link)
CREATE INDEX IF NOT EXISTS idx_portal_links_token
  ON portal_links (token) WHERE is_active = TRUE;

-- Tenant + matter scoped lookups (lawyer fetching links for a matter)
CREATE INDEX IF NOT EXISTS idx_portal_links_tenant_matter
  ON portal_links (tenant_id, matter_id) WHERE is_active = TRUE;

-- Row Level Security
ALTER TABLE portal_links ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (for authenticated lawyer-side queries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'portal_links_tenant_isolation'
  ) THEN
    CREATE POLICY portal_links_tenant_isolation ON portal_links
      FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
  END IF;
END;
$$;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'portal_links_updated_at'
  ) THEN
    CREATE TRIGGER portal_links_updated_at
      BEFORE UPDATE ON portal_links
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
