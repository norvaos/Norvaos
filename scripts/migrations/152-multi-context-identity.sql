-- ============================================================================
-- 152 — Multi-Context Identity: Allow one auth user across multiple tenants
-- ============================================================================
-- Problem: users.auth_user_id has a UNIQUE constraint, blocking an email
--          that's already a "Client" in tenant A from signing up as an
--          "Owner" in tenant B.
-- Fix:     Change UNIQUE(auth_user_id) → UNIQUE(auth_user_id, tenant_id)
--          and update get_current_tenant_id() to handle multiple rows.
-- ============================================================================

BEGIN;

-- ── 1. Drop the old single-column unique constraint ─────────────────────────
-- The constraint name may vary — try both auto-generated names.
DO $$
BEGIN
  -- Try the most common auto-generated name
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_user_id_key;
EXCEPTION WHEN undefined_object THEN
  NULL; -- constraint doesn't exist under that name
END;
$$;

-- Also drop any unique index on auth_user_id alone
DROP INDEX IF EXISTS users_auth_user_id_key;
DROP INDEX IF EXISTS idx_users_auth_user_id;

-- ── 2. Add composite unique constraint ──────────────────────────────────────
-- One users row per (auth_user_id, tenant_id) — allows multi-tenant membership.
-- NULLs in auth_user_id are exempt (Postgres treats each NULL as distinct).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_user_id_tenant_id_key'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_user_id_tenant_id_key
      UNIQUE (auth_user_id, tenant_id);
  END IF;
END;
$$;

-- ── 3. Replace get_current_tenant_id() ──────────────────────────────────────
-- Old version: SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
--   → Returns multiple rows after the constraint change, breaking RLS.
--
-- New version:
--   1. Check session variable 'app.current_tenant_id' (set by server middleware)
--   2. Fall back to the most-recently-created users row for this auth user
--   3. LIMIT 1 ensures a single value even with multiple memberships
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  _tid UUID;
BEGIN
  -- Priority 1: Session variable (set by API middleware via SET LOCAL)
  _tid := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  IF _tid IS NOT NULL THEN
    RETURN _tid;
  END IF;

  -- Priority 2: Look up from users table, newest membership first
  SELECT tenant_id INTO _tid
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN _tid;
END;
$$;

-- ── 4. Add index for the new lookup pattern ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id_active
  ON public.users (auth_user_id, is_active, created_at DESC)
  WHERE is_active = true;

COMMIT;
