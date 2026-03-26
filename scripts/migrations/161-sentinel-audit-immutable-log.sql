-- =============================================================================
-- Migration 161 — Team SENTINEL Immutable Audit Log
-- =============================================================================
--
-- Creates an append-only, immutable audit log for SENTINEL security events.
-- Records cannot be updated or deleted — a trigger enforces this at the DB level.
--
-- Events logged include: tenant boundary violations, RLS bypass attempts,
-- unauthorised access, retainer gate blocks, and other security-relevant actions.
--
-- Insertion is restricted to a SECURITY DEFINER function (sentinel_log_event)
-- so that no authenticated user can INSERT directly into the table.
--
-- =============================================================================


-- ── 1. Table: sentinel_audit_log ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sentinel_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT        NOT NULL,
  severity      TEXT        NOT NULL DEFAULT 'warning'
                            CHECK (severity IN ('info', 'warning', 'critical', 'breach')),
  tenant_id     UUID        REFERENCES tenants(id),
  user_id       UUID        REFERENCES users(id),
  auth_user_id  UUID,
  table_name    TEXT,
  record_id     UUID,
  ip_address    TEXT,
  user_agent    TEXT,
  request_path  TEXT,
  details       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. Immutability guard — prevent UPDATE and DELETE ────────────────────────

CREATE OR REPLACE FUNCTION sentinel_audit_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SENTINEL: Audit log is immutable — cannot modify or delete records';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sentinel_audit_immutable
  BEFORE UPDATE OR DELETE ON sentinel_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION sentinel_audit_immutable_guard();


-- ── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE sentinel_audit_log ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS automatically (Supabase convention).
-- Platform admins (users with admin role) can SELECT for investigation.
CREATE POLICY sentinel_audit_select_admin
  ON sentinel_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.auth_user_id = auth.uid()
        AND roles.name = 'admin'
    )
  );

-- No INSERT / UPDATE / DELETE policies for authenticated users.
-- All inserts go through the SECURITY DEFINER function below.
-- This ensures the audit trail cannot be tampered with from the client.


-- ── 4. SECURITY DEFINER insert function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_log_event(
  p_event_type  TEXT,
  p_severity    TEXT     DEFAULT 'warning',
  p_tenant_id   UUID     DEFAULT NULL,
  p_user_id     UUID     DEFAULT NULL,
  p_table_name  TEXT     DEFAULT NULL,
  p_record_id   UUID     DEFAULT NULL,
  p_details     JSONB    DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO sentinel_audit_log (
    event_type,
    severity,
    tenant_id,
    user_id,
    auth_user_id,
    table_name,
    record_id,
    details
  ) VALUES (
    p_event_type,
    p_severity,
    p_tenant_id,
    p_user_id,
    auth.uid(),
    p_table_name,
    p_record_id,
    p_details
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ── 5. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_event_type
  ON sentinel_audit_log (event_type);

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_tenant_created
  ON sentinel_audit_log (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_severity_created
  ON sentinel_audit_log (severity, created_at);


-- ── 6. Documentation ────────────────────────────────────────────────────────

COMMENT ON TABLE sentinel_audit_log IS
  'Immutable append-only audit log for Team SENTINEL security events. '
  'Records tenant boundary violations, RLS bypass attempts, unauthorised access, '
  'retainer gate blocks, and other security-critical actions. '
  'UPDATE and DELETE are blocked by the sentinel_audit_immutable_guard trigger. '
  'Inserts must go through the sentinel_log_event() SECURITY DEFINER function.';

COMMENT ON FUNCTION sentinel_audit_immutable_guard() IS
  'Trigger function that prevents any UPDATE or DELETE on sentinel_audit_log. '
  'Raises an exception to enforce the immutability invariant of the audit trail.';

COMMENT ON FUNCTION sentinel_log_event(TEXT, TEXT, UUID, UUID, TEXT, UUID, JSONB) IS
  'SECURITY DEFINER function to insert a row into sentinel_audit_log. '
  'Automatically captures auth.uid() as auth_user_id. '
  'This is the ONLY sanctioned way to write to the audit log — '
  'direct INSERT is blocked by RLS (no INSERT policy for authenticated users).';
