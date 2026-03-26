-- =============================================================================
-- Migration 160  -  Hard 403 Tenant Isolation (Team SENTINEL)
-- =============================================================================
--
-- Previously, RLS policies silently returned empty result sets on cross-tenant
-- access. This migration upgrades to HARD 403 errors (SQLSTATE 42501) so that
-- cross-tenant attempts are loud, logged, and unmistakable.
--
-- Components:
--   1. assert_tenant_access(target_tenant_id)   -  callable guard function
--   2. get_current_tenant_id()                  -  idempotent re-create (already exists from 152)
--   3. enforce_tenant_isolation_trigger()        -  BEFORE INSERT/UPDATE trigger fn
--   4. Triggers on 8 critical tables
--   5. tenant_violation_log table + RLS
-- =============================================================================

BEGIN;

-- ─── 1. assert_tenant_access() ──────────────────────────────────────────────
-- Explicit guard that any RPC or function can call to hard-block cross-tenant
-- access with SQLSTATE 42501 (insufficient_privilege).

CREATE OR REPLACE FUNCTION public.assert_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _my_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO _my_tenant_id
    FROM users
   WHERE auth_user_id = auth.uid();

  IF _my_tenant_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL-403: Could not resolve tenant for current user.'
      USING ERRCODE = '42501';
  END IF;

  IF target_tenant_id IS DISTINCT FROM _my_tenant_id THEN
    -- Best-effort violation logging (do not let logging failure block the raise)
    BEGIN
      INSERT INTO public.tenant_violation_log (
        id, tenant_id, attempted_tenant_id, user_id,
        table_name, operation, occurred_at, metadata
      ) VALUES (
        gen_random_uuid(),
        _my_tenant_id,
        target_tenant_id,
        auth.uid(),
        'assert_tenant_access',
        'GUARD',
        now(),
        jsonb_build_object('source', 'assert_tenant_access')
      );
    EXCEPTION WHEN OTHERS THEN
      -- Logging table may not exist yet on first run; swallow gracefully.
      NULL;
    END;

    RAISE EXCEPTION 'SENTINEL-403: Cross-tenant access denied. Your tenant: %, Requested: %',
      _my_tenant_id, target_tenant_id
      USING ERRCODE = '42501';
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.assert_tenant_access(UUID) IS
  'Hard-403 guard: raises SQLSTATE 42501 if target_tenant_id does not match the '
  'authenticated user''s tenant. Use in RPCs and SECURITY DEFINER functions to '
  'enforce cross-tenant isolation with a loud error instead of silent empty sets.';


-- ─── 2. get_current_tenant_id()  -  idempotent ────────────────────────────────
-- Already created in migration 152, but we re-declare with CREATE OR REPLACE
-- so this migration is self-contained. Behaviour is unchanged.

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid UUID;
BEGIN
  -- Priority 1: Session variable (set by API middleware via SET LOCAL)
  _tid := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  IF _tid IS NOT NULL THEN
    RETURN _tid;
  END IF;

  -- Priority 2: Look up from users table
  SELECT tenant_id INTO _tid
    FROM users
   WHERE auth_user_id = auth.uid();

  RETURN _tid;
END;
$$;

COMMENT ON FUNCTION public.get_current_tenant_id() IS
  'Returns the authenticated user''s tenant_id. Checks session variable first '
  '(app.current_tenant_id), then falls back to users table lookup. '
  'STABLE SECURITY DEFINER  -  safe to use in RLS policies.';


-- ─── 3. enforce_tenant_isolation_trigger() ───────────────────────────────────
-- BEFORE INSERT OR UPDATE trigger function. Raises hard 403 when the row's
-- tenant_id does not match the caller's tenant. Skips for service_role so
-- admin/migration operations are not blocked.

CREATE OR REPLACE FUNCTION public.enforce_tenant_isolation_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _my_tenant_id UUID;
  _op           TEXT;
BEGIN
  -- Allow service_role (admin SDK, migrations, cron jobs) to bypass
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  _my_tenant_id := public.get_current_tenant_id();

  -- If we cannot resolve a tenant (e.g. anon role), block everything
  IF _my_tenant_id IS NULL THEN
    RAISE EXCEPTION 'SENTINEL-403: Tenant isolation violation on table %. Could not resolve caller tenant.',
      TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM _my_tenant_id THEN
    _op := TG_OP;  -- INSERT or UPDATE

    -- Best-effort violation logging
    BEGIN
      INSERT INTO public.tenant_violation_log (
        id, tenant_id, attempted_tenant_id, user_id,
        table_name, operation, occurred_at, metadata
      ) VALUES (
        gen_random_uuid(),
        _my_tenant_id,
        NEW.tenant_id,
        auth.uid(),
        TG_TABLE_NAME,
        _op,
        now(),
        jsonb_build_object(
          'trigger', TG_NAME,
          'schema', TG_TABLE_SCHEMA
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- Do not let logging failure prevent the security raise
    END;

    RAISE EXCEPTION 'SENTINEL-403: Tenant isolation violation on table %. Your tenant: %, Attempted: %',
      TG_TABLE_NAME, _my_tenant_id, NEW.tenant_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_tenant_isolation_trigger() IS
  'BEFORE INSERT/UPDATE trigger that hard-blocks writes where NEW.tenant_id '
  'does not match the caller''s tenant. Raises SQLSTATE 42501 (insufficient_privilege). '
  'Bypassed for service_role to allow admin SDK and migration operations.';


-- ─── 4. Apply triggers to critical tables ────────────────────────────────────
-- Using DROP + CREATE (not IF NOT EXISTS, which is unsupported for triggers)
-- to make this idempotent.

DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'matters',
    'contacts',
    'leads',
    'retainer_agreements',
    'invoices',
    'documents',
    'activities',
    'trust_transactions'
  ];
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY _tables
  LOOP
    -- Drop if exists for idempotency
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON public.%I',
      _t
    );
    -- Create the trigger
    EXECUTE format(
      'CREATE TRIGGER trg_sentinel_tenant_isolation '
      'BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_isolation_trigger()',
      _t
    );

    RAISE NOTICE 'SENTINEL: tenant isolation trigger applied to %', _t;
  END LOOP;
END;
$$;


-- ─── 5. tenant_violation_log ─────────────────────────────────────────────────
-- Audit table for cross-tenant access attempts. Restricted to service_role
-- since is_platform_admin() does not exist in this project.

CREATE TABLE IF NOT EXISTS public.tenant_violation_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL,
  attempted_tenant_id UUID       NOT NULL,
  user_id            UUID,
  table_name         TEXT        NOT NULL,
  operation          TEXT        NOT NULL CHECK (operation IN ('SELECT','INSERT','UPDATE','DELETE','GUARD')),
  ip_address         INET,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata           JSONB       DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.tenant_violation_log IS
  'Audit log of cross-tenant access violations detected by SENTINEL triggers '
  'and the assert_tenant_access() guard function. Restricted to service_role only.';

COMMENT ON COLUMN public.tenant_violation_log.tenant_id IS
  'The tenant_id of the user who attempted the cross-tenant access (the violator).';
COMMENT ON COLUMN public.tenant_violation_log.attempted_tenant_id IS
  'The tenant_id the user tried to read or write to.';
COMMENT ON COLUMN public.tenant_violation_log.operation IS
  'The type of operation attempted: SELECT, INSERT, UPDATE, DELETE, or GUARD (from assert_tenant_access).';
COMMENT ON COLUMN public.tenant_violation_log.ip_address IS
  'Client IP address if available (populated by application layer).';
COMMENT ON COLUMN public.tenant_violation_log.metadata IS
  'Additional context as JSON (trigger name, table schema, request details, etc.).';

-- RLS: only service_role can read violation logs
ALTER TABLE public.tenant_violation_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS tenant_violation_log_service_role_select ON public.tenant_violation_log;
DROP POLICY IF EXISTS tenant_violation_log_service_role_insert ON public.tenant_violation_log;

CREATE POLICY tenant_violation_log_service_role_select
  ON public.tenant_violation_log
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY tenant_violation_log_service_role_insert
  ON public.tenant_violation_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Index for querying violations by tenant or time range
CREATE INDEX IF NOT EXISTS idx_tenant_violation_log_tenant
  ON public.tenant_violation_log (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_violation_log_occurred
  ON public.tenant_violation_log (occurred_at DESC);

COMMIT;
