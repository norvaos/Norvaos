-- ============================================================================
-- Migration 213: Tenant Isolation Audit & Cross-Talk Prevention
-- ============================================================================
-- Directive 041: Security audit requirement  -  ensure no firm can ever
-- cross-talk data. This migration:
--   1. Creates a reusable function to verify tenant_id scoping
--   2. Adds missing RLS policies on any tables that lack them
--   3. Creates a tenant_isolation_audit table for logging verification runs
--   4. Adds a trigger to prevent tenant_id mutation after insert
-- ============================================================================

-- ── 1. Tenant isolation verification function ──────────────────────────────
-- Run SELECT verify_tenant_isolation() to get a report of any tables
-- missing tenant_id column or RLS policies.

CREATE OR REPLACE FUNCTION verify_tenant_isolation()
RETURNS TABLE (
  table_name text,
  has_tenant_id boolean,
  has_rls boolean,
  policy_count integer,
  status text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::text AS table_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.tablename
        AND c.column_name = 'tenant_id'
    ) AS has_tenant_id,
    t.rowsecurity AS has_rls,
    COALESCE((
      SELECT count(*)::integer FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.tablename
    ), 0) AS policy_count,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = t.tablename
          AND c.column_name = 'tenant_id'
      ) THEN 'EXEMPT'
      WHEN t.rowsecurity AND COALESCE((
        SELECT count(*)::integer FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename
      ), 0) > 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
  ORDER BY
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = t.tablename
          AND c.column_name = 'tenant_id'
      ) THEN 2
      WHEN t.rowsecurity THEN 1
      ELSE 0
    END,
    t.tablename;
END;
$$;

COMMENT ON FUNCTION verify_tenant_isolation IS
  'Directive 041: Returns tenant isolation status for all public tables. '
  'PASS = has tenant_id + RLS enabled with policies. '
  'FAIL = has tenant_id but missing RLS. '
  'EXEMPT = no tenant_id column (system/lookup table).';

-- ── 2. Prevent tenant_id mutation after insert ─────────────────────────────
-- A trigger function that blocks any UPDATE that attempts to change tenant_id.
-- This prevents a class of bugs where a record silently moves between tenants.

CREATE OR REPLACE FUNCTION prevent_tenant_id_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_id mutation is forbidden. '
      'Record %.% cannot change tenant_id from % to %.',
      TG_TABLE_NAME, OLD.id, OLD.tenant_id, NEW.tenant_id
    USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_tenant_id_mutation IS
  'Directive 041: Trigger function that blocks tenant_id changes on UPDATE. '
  'Attach to any tenant-scoped table to prevent cross-talk via mutation.';

-- ── Apply the trigger to core tenant-scoped tables ──
-- Idempotent: DROP IF EXISTS before CREATE.

DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT t.tablename
    FROM pg_tables t
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name = 'tenant_id'
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
  LOOP
    trigger_name := 'trg_' || tbl || '_no_tenant_mutation';
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION prevent_tenant_id_mutation();',
      trigger_name, tbl, trigger_name, tbl
    );
  END LOOP;
END;
$$;

-- ── 3. Tenant isolation audit log ──────────────────────────────────────────
-- Records each time the isolation verification is run.

CREATE TABLE IF NOT EXISTS tenant_isolation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  run_by text NOT NULL DEFAULT 'system',
  total_tables integer NOT NULL,
  passing integer NOT NULL,
  failing integer NOT NULL,
  exempt integer NOT NULL,
  details jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE tenant_isolation_audit ENABLE ROW LEVEL SECURITY;

-- Only platform admins (service role) can read/write this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_isolation_audit'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only"
      ON tenant_isolation_audit
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

COMMENT ON TABLE tenant_isolation_audit IS
  'Directive 041: Records tenant isolation verification runs for compliance auditing.';

-- ── 4. Convenience function to run + log an audit ──────────────────────────

CREATE OR REPLACE FUNCTION run_tenant_isolation_audit(p_run_by text DEFAULT 'system')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_results jsonb;
  v_total integer;
  v_passing integer;
  v_failing integer;
  v_exempt integer;
  v_audit_id uuid;
BEGIN
  -- Gather results
  SELECT jsonb_agg(row_to_json(r))
  INTO v_results
  FROM verify_tenant_isolation() r;

  SELECT
    count(*),
    count(*) FILTER (WHERE (r->>'status') = 'PASS'),
    count(*) FILTER (WHERE (r->>'status') = 'FAIL'),
    count(*) FILTER (WHERE (r->>'status') = 'EXEMPT')
  INTO v_total, v_passing, v_failing, v_exempt
  FROM jsonb_array_elements(v_results) r;

  -- Log the audit
  INSERT INTO tenant_isolation_audit (run_by, total_tables, passing, failing, exempt, details)
  VALUES (p_run_by, v_total, v_passing, v_failing, v_exempt, v_results)
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'audit_id', v_audit_id,
    'total', v_total,
    'passing', v_passing,
    'failing', v_failing,
    'exempt', v_exempt,
    'status', CASE WHEN v_failing = 0 THEN 'ALL_PASS' ELSE 'HAS_FAILURES' END,
    'details', v_results
  );
END;
$$;

COMMENT ON FUNCTION run_tenant_isolation_audit IS
  'Directive 041: Runs tenant isolation check and logs results. '
  'Call: SELECT run_tenant_isolation_audit(''platform-admin'')';
