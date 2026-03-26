-- Migration 163: Cross-Tenant Violation Trigger  -  Sentinel Audit Defence Layer
--
-- Supports:
--   1. Automatic detection of RLS-bypassing cross-tenant access attempts
--   2. Critical-severity logging to sentinel_audit_log (created in migration 161)
--   3. Hard denial (RAISE EXCEPTION) for non-service_role violators
--   4. Helper to attach the sentinel trigger to any tenant-scoped table
--
-- Depends on: migration 161 (sentinel_audit_log table + sentinel_log_event function)

-- ─── 1. Cross-Tenant Violation Detection Function ──────────────────────────────
-- Fires BEFORE INSERT OR UPDATE. Compares NEW.tenant_id against the session's
-- resolved tenant. If they diverge and the caller is NOT service_role, logs a
-- critical event and blocks the operation.

CREATE OR REPLACE FUNCTION log_cross_tenant_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_tenant_id UUID;
  _current_role      TEXT;
  _acting_user_id    UUID;
BEGIN
  -- Resolve the authenticated user's tenant
  _current_tenant_id := get_current_tenant_id();
  _current_role      := current_setting('role', true);

  -- Allow service_role to bypass (Supabase admin / server-side operations)
  IF _current_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If tenant IDs match, nothing to do
  IF NEW.tenant_id IS NOT DISTINCT FROM _current_tenant_id THEN
    RETURN NEW;
  END IF;

  -- ── Violation detected ──────────────────────────────────────────────────────
  -- Resolve the acting user for the audit record
  SELECT id INTO _acting_user_id
    FROM users
   WHERE auth_user_id = auth.uid();

  -- Log to sentinel_audit_log via the helper from migration 161
  PERFORM sentinel_log_event(
    'TENANT_VIOLATION',
    'critical',
    _current_tenant_id,
    _acting_user_id,
    TG_TABLE_NAME,
    NEW.id,
    jsonb_build_object(
      'attempted_tenant_id', NEW.tenant_id,
      'actual_tenant_id',    _current_tenant_id,
      'operation',           TG_OP
    )
  );

  -- Hard deny  -  SQLSTATE 42501 = insufficient_privilege
  RAISE EXCEPTION 'SENTINEL-403: Cross-tenant access denied on %.%. Your tenant: %, attempted: %',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, _current_tenant_id, NEW.tenant_id
    USING ERRCODE = '42501';

  -- Unreachable, but required by plpgsql grammar
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION log_cross_tenant_violation()
  IS 'Sentinel trigger function: detects cross-tenant writes that bypass RLS, logs a critical event, and raises a 42501 exception. Allows service_role to pass through.';


-- ─── 2. Helper: Attach Sentinel Trigger to Any Table ────────────────────────────
-- Idempotent  -  drops existing trigger first, then creates BEFORE INSERT OR UPDATE.

CREATE OR REPLACE FUNCTION attach_sentinel_trigger(p_table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  _trigger_name TEXT;
BEGIN
  _trigger_name := 'sentinel_cross_tenant_' || p_table_name;

  -- Drop if already exists (idempotent re-runs)
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I',
    _trigger_name, p_table_name
  );

  -- Create BEFORE INSERT OR UPDATE trigger
  EXECUTE format(
    'CREATE TRIGGER %I '
    'BEFORE INSERT OR UPDATE ON %I '
    'FOR EACH ROW EXECUTE FUNCTION log_cross_tenant_violation()',
    _trigger_name, p_table_name
  );
END;
$$;

COMMENT ON FUNCTION attach_sentinel_trigger(TEXT)
  IS 'Idempotently attaches the Sentinel cross-tenant violation trigger (BEFORE INSERT OR UPDATE) to the given table. Safe to re-run.';


-- ─── 3. Attach to All Tenant-Scoped Core Tables ─────────────────────────────────

SELECT attach_sentinel_trigger('matters');
SELECT attach_sentinel_trigger('contacts');
SELECT attach_sentinel_trigger('leads');
SELECT attach_sentinel_trigger('retainer_agreements');
SELECT attach_sentinel_trigger('invoices');
SELECT attach_sentinel_trigger('documents');
SELECT attach_sentinel_trigger('trust_transactions');
SELECT attach_sentinel_trigger('activities');
SELECT attach_sentinel_trigger('tasks');
SELECT attach_sentinel_trigger('appointments');
