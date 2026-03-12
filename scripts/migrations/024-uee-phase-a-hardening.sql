-- ============================================================================
-- Migration 024: UEE Phase A Hardening — Pre-Phase B Gate
-- ============================================================================
-- Structural hardening items:
--   A. Audit log immutability (trigger + granular RLS)
--   B. Lock enforcement at database level (triggers on matter_intake + matter_people)
--   C. Risk override history table (append-only)
-- ============================================================================

-- ─── A. Audit Log Immutability ──────────────────────────────────────────────

-- 1. Trigger: prevent UPDATE or DELETE on audit_logs
--    This cannot be bypassed by service_role (unlike RLS).
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_immutable'
  ) THEN
    CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;

-- 2. Granular RLS policies (replace the single FOR ALL policy)
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON audit_logs;

-- SELECT: tenant users can read their own audit logs
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- INSERT: tenant users can create audit logs
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- No UPDATE or DELETE policies = denied by default via RLS.
-- The trigger is the belt; RLS is the suspenders.

-- ─── B. Lock Enforcement ────────────────────────────────────────────────────

-- 1. Trigger on matter_intake: prevent writes when locked
--    Escape hatch: allows changes ONLY to lock fields
--    (intake_status, locked_at, locked_by, lock_reason)
--    so the lock/unlock API can operate.
CREATE OR REPLACE FUNCTION enforce_intake_lock()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if the record is currently locked
  IF OLD.intake_status = 'locked' THEN
    -- Check if this is a lock-related change (unlock or re-lock)
    IF (NEW.intake_status IS DISTINCT FROM OLD.intake_status)
       OR (NEW.locked_at IS DISTINCT FROM OLD.locked_at)
       OR (NEW.locked_by IS DISTINCT FROM OLD.locked_by)
       OR (NEW.lock_reason IS DISTINCT FROM OLD.lock_reason) THEN
      -- This is a lock/unlock operation.
      -- Verify that ONLY lock fields are changing (no data field modifications).
      IF (NEW.processing_stream IS DISTINCT FROM OLD.processing_stream)
         OR (NEW.program_category IS DISTINCT FROM OLD.program_category)
         OR (NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction)
         OR (NEW.intake_delegation IS DISTINCT FROM OLD.intake_delegation)
         OR (NEW.risk_score IS DISTINCT FROM OLD.risk_score)
         OR (NEW.risk_level IS DISTINCT FROM OLD.risk_level)
         OR (NEW.red_flags IS DISTINCT FROM OLD.red_flags)
         OR (NEW.completion_pct IS DISTINCT FROM OLD.completion_pct)
         OR (NEW.risk_override_level IS DISTINCT FROM OLD.risk_override_level)
         OR (NEW.risk_override_reason IS DISTINCT FROM OLD.risk_override_reason)
         OR (NEW.risk_override_by IS DISTINCT FROM OLD.risk_override_by)
         OR (NEW.risk_override_at IS DISTINCT FROM OLD.risk_override_at) THEN
        RAISE EXCEPTION 'Cannot modify data fields on a locked intake record. Only lock/unlock operations are permitted.';
      END IF;
      -- Pure lock field change — allowed
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Intake record is locked. Unlock it before making changes.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_intake_lock'
  ) THEN
    CREATE TRIGGER trg_enforce_intake_lock
      BEFORE UPDATE ON matter_intake
      FOR EACH ROW EXECUTE FUNCTION enforce_intake_lock();
  END IF;
END $$;

-- 2. Trigger on matter_people: prevent INSERT/UPDATE/DELETE when parent is locked
CREATE OR REPLACE FUNCTION enforce_people_parent_lock()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  -- For DELETE, use OLD; for INSERT/UPDATE, use NEW
  IF TG_OP = 'DELETE' THEN
    SELECT intake_status INTO parent_status
    FROM matter_intake
    WHERE matter_id = OLD.matter_id;
  ELSE
    SELECT intake_status INTO parent_status
    FROM matter_intake
    WHERE matter_id = NEW.matter_id;
  END IF;

  -- If no intake record exists, allow the operation (non-enforcement matter)
  IF parent_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF parent_status = 'locked' THEN
    RAISE EXCEPTION 'Cannot modify people on a locked intake record. Unlock the intake first.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_people_parent_lock'
  ) THEN
    CREATE TRIGGER trg_enforce_people_parent_lock
      BEFORE INSERT OR UPDATE OR DELETE ON matter_people
      FOR EACH ROW EXECUTE FUNCTION enforce_people_parent_lock();
  END IF;
END $$;

-- ─── C. Risk Override History ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_override_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  intake_id       UUID        NOT NULL REFERENCES matter_intake(id) ON DELETE CASCADE,
  previous_level  TEXT        DEFAULT NULL,
  new_level       TEXT        NOT NULL,
  reason          TEXT        NOT NULL,
  overridden_by   UUID        NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE risk_override_history ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT + INSERT only (no UPDATE or DELETE)
CREATE POLICY risk_override_history_select ON risk_override_history
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY risk_override_history_insert ON risk_override_history
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Immutability trigger (reuses prevent_audit_log_mutation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_risk_override_history_immutable'
  ) THEN
    CREATE TRIGGER trg_risk_override_history_immutable
      BEFORE UPDATE OR DELETE ON risk_override_history
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_risk_override_history_matter
  ON risk_override_history(matter_id);
CREATE INDEX IF NOT EXISTS idx_risk_override_history_tenant
  ON risk_override_history(tenant_id);

-- ============================================================================
-- END Migration 024
-- ============================================================================
