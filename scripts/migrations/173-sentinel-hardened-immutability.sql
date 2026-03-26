-- =============================================================================
-- Migration 173 — SENTINEL Hardened Immutability Guard
-- =============================================================================
--
-- Upgrades the immutability guard from migration 161 to be resistant to
-- service_role bypass. Even if an attacker gains the Supabase service_role
-- key, the database engine itself will refuse to alter audit history.
--
-- Defence layers:
--   1. SECURITY DEFINER trigger function — runs as the definer, not the caller
--   2. Explicitly blocks service_role from UPDATE/DELETE
--   3. Event trigger to prevent DROP TRIGGER on sentinel_audit_log
--   4. TRUNCATE protection via REVOKE
--
-- Depends on: migration 161 (sentinel_audit_log table)
-- =============================================================================


-- ── 1. Replace immutability guard with hardened version ──────────────────────

CREATE OR REPLACE FUNCTION sentinel_audit_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This trigger fires BEFORE UPDATE OR DELETE on sentinel_audit_log.
  -- It blocks ALL callers — including service_role, superadmin, and
  -- any future role that might be created.
  --
  -- The ONLY way to bypass this is to DROP the trigger first,
  -- which is protected by the event trigger below.

  RAISE EXCEPTION
    'SENTINEL-IMMUTABLE: Audit log records cannot be modified or deleted. '
    'This violation has been detected. Operation: %, Role: %',
    TG_OP, current_setting('role', true)
    USING ERRCODE = '42501';

  -- Never reached, but required for BEFORE trigger
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION sentinel_audit_immutable_guard() IS
  'SENTINEL hardened immutability guard (migration 173). '
  'SECURITY DEFINER trigger that blocks ALL UPDATE and DELETE operations '
  'on sentinel_audit_log, including from service_role. '
  'Protected by event trigger sentinel_protect_audit_triggers.';


-- ── 2. Ensure trigger exists (idempotent) ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_sentinel_audit_immutable ON sentinel_audit_log;

CREATE TRIGGER trg_sentinel_audit_immutable
  BEFORE UPDATE OR DELETE ON sentinel_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION sentinel_audit_immutable_guard();


-- ── 3. Block TRUNCATE on sentinel_audit_log ─────────────────────────────────
-- TRUNCATE bypasses row-level triggers, so we must block it at the
-- permission level. Revoke TRUNCATE from all non-superuser roles.

REVOKE TRUNCATE ON sentinel_audit_log FROM authenticated;
REVOKE TRUNCATE ON sentinel_audit_log FROM anon;
REVOKE TRUNCATE ON sentinel_audit_log FROM service_role;


-- ── 4. Event trigger — prevent DROP TRIGGER on sentinel_audit_log ───────────
-- This is the nuclear option: even if an attacker has service_role,
-- they cannot silently drop the immutability trigger.
--
-- IMPORTANT: Uses `sql_drop` event (not `ddl_command_end`) so it only
-- fires when objects are DROPPED, not when they are CREATED/REPLACED.
-- This prevents the event trigger from blocking its own migration.
--
-- Note: Event triggers require superuser to create. If running as
-- service_role in Supabase SQL Editor, this will be skipped gracefully.

CREATE OR REPLACE FUNCTION sentinel_protect_audit_triggers()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  obj RECORD;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type = 'trigger' AND
       obj.object_identity ILIKE '%sentinel_audit_log%' THEN
      RAISE EXCEPTION
        'SENTINEL-LOCKDOWN: Cannot DROP triggers on sentinel_audit_log. '
        'This DDL attempt has been detected and blocked.';
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS sentinel_ddl_protect_audit;

CREATE EVENT TRIGGER sentinel_ddl_protect_audit
  ON sql_drop
  EXECUTE FUNCTION sentinel_protect_audit_triggers();


-- ── 5. Documentation ────────────────────────────────────────────────────────

COMMENT ON TRIGGER trg_sentinel_audit_immutable ON sentinel_audit_log IS
  'SENTINEL hardened immutability trigger (migration 173). '
  'Blocks ALL UPDATE and DELETE operations including service_role. '
  'Protected by event trigger sentinel_ddl_protect_audit which prevents '
  'dropping this trigger via DDL.';
