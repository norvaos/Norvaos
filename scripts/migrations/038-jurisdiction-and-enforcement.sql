-- Migration 038: Jurisdiction-Aware Tenancy + Enforcement
-- Adds jurisdiction_code to tenants (CA-only v1), immutability trigger,
-- max_users DB enforcement, and user_invites table for token-based acceptance.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. jurisdiction_code on tenants  -  CA-only CHECK for v1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS jurisdiction_code TEXT NOT NULL DEFAULT 'CA';

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_jurisdiction CHECK (jurisdiction_code = 'CA');
-- Future migration will ALTER constraint to IN ('CA','US','GB') when US/GB enabled.

CREATE INDEX IF NOT EXISTS idx_tenants_jurisdiction ON tenants(jurisdiction_code);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Immutability trigger  -  prevents UPDATE of jurisdiction_code after creation
--    Applies to ALL roles including service_role.
--    Override for testing: DROP TRIGGER trg_tenants_jurisdiction_immutable ON tenants;
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_jurisdiction_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.jurisdiction_code IS DISTINCT FROM NEW.jurisdiction_code THEN
    RAISE EXCEPTION 'jurisdiction_code cannot be changed after tenant creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_jurisdiction_immutable
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION prevent_jurisdiction_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. max_users enforcement trigger on users table
--    Blocks INSERT when active user count >= tenants.max_users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_max_users()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  SELECT count(*) INTO current_count
    FROM users
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

  SELECT max_users INTO max_allowed
    FROM tenants
    WHERE id = NEW.tenant_id;

  IF current_count >= COALESCE(max_allowed, 5) THEN
    RAISE EXCEPTION 'User limit reached: tenant allows % active users', max_allowed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_max_enforcement
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_users();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. user_invites table for token-based acceptance flow
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_invites_tenant_isolation
  ON user_invites
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX idx_user_invites_token ON user_invites(token);
CREATE INDEX idx_user_invites_tenant ON user_invites(tenant_id);

COMMIT;
