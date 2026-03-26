-- Migration 041: Super Admin Portal Foundation
--
-- Creates the DB-backed platform admin allowlist, tenant lifecycle status,
-- and an immutable cross-tenant audit log for all platform-admin actions.
--
-- Tables:
--   platform_admins            -  admin allowlist keyed by auth.users(id)
--   platform_admin_audit_logs  -  append-only log for every admin action
--
-- Columns:
--   tenants.status             -  lifecycle: active / suspended / closed
--
-- All tables are service-role only (no RLS policies for app users).
-- platform_admin_audit_logs is INSERT-only  -  no UPDATE or DELETE.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. platform_admins  -  DB-backed admin allowlist
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  email       text NOT NULL,
  granted_by  text NOT NULL,           -- who added them (email or 'seed')
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,             -- soft-revoke: non-null = inactive
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only one active (non-revoked) entry per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_user_id_active
  ON platform_admins (user_id) WHERE revoked_at IS NULL;

-- Lookup by email for display/audit
CREATE INDEX IF NOT EXISTS idx_platform_admins_email
  ON platform_admins (email);

COMMENT ON TABLE platform_admins IS
  'DB-backed platform admin allowlist. Soft-revoke via revoked_at. Service-role only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. tenants.status  -  lifecycle column
-- ═══════════════════════════════════════════════════════════════════════════

-- Add status column if it does not exist (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'status'
  ) THEN
    ALTER TABLE tenants ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
      CHECK (status IN ('active', 'suspended', 'closed'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.status IS
  'Tenant lifecycle: active (default), suspended (admin action), closed (permanent).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. platform_admin_audit_logs  -  immutable, append-only
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_admin_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES platform_admins(id),
  action      text NOT NULL,
  target_type text NOT NULL,           -- 'tenant', 'user', 'invite'
  target_id   uuid NOT NULL,
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason      text NOT NULL,
  ip          text,
  user_agent  text,
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Query by target (e.g. "show all admin actions on tenant X")
CREATE INDEX IF NOT EXISTS idx_pa_audit_logs_target
  ON platform_admin_audit_logs (target_type, target_id, created_at DESC);

-- Query by admin (e.g. "show all actions by admin Y")
CREATE INDEX IF NOT EXISTS idx_pa_audit_logs_admin
  ON platform_admin_audit_logs (admin_id, created_at DESC);

-- Query by action type
CREATE INDEX IF NOT EXISTS idx_pa_audit_logs_action
  ON platform_admin_audit_logs (action, created_at DESC);

COMMENT ON TABLE platform_admin_audit_logs IS
  'Immutable, append-only audit log for all platform-admin actions. No UPDATE/DELETE. Service-role INSERT only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS: Enable RLS but grant NO policies to app users
--    Only service-role (createAdminClient) can read/write.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- No policies = no app-user access. Service-role bypasses RLS.

COMMIT;
