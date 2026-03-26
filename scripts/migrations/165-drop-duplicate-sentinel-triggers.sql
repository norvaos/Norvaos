-- ============================================================================
-- Migration 165: Drop Duplicate SENTINEL Triggers
-- ============================================================================
-- Performance fix: Migrations 160 and 163 both attached BEFORE INSERT/UPDATE
-- triggers to the same 8 tables, causing get_current_tenant_id() to be called
-- TWICE per write. This migration drops the migration-160 triggers, keeping
-- only the migration-163 triggers which are superior (they also log violations
-- to sentinel_audit_log).
--
-- Net effect: 50% reduction in per-write overhead from SENTINEL layer.
-- ============================================================================

-- Drop migration 160's triggers (named trg_sentinel_tenant_isolation)
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON matters;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON contacts;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON leads;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON retainer_agreements;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON invoices;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON documents;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON trust_transactions;
DROP TRIGGER IF EXISTS trg_sentinel_tenant_isolation ON activities;

-- The enforce_tenant_isolation_trigger() function from migration 160 is kept
-- in case it's referenced by assert_tenant_access() or manual RPC calls.
-- Only the automatic trigger firing is removed.

COMMENT ON FUNCTION enforce_tenant_isolation_trigger() IS
  'SENTINEL tenant isolation trigger function (migration 160). '
  'Automatic triggers dropped in migration 165  -  replaced by '
  'log_cross_tenant_violation() triggers from migration 163 which '
  'also write to sentinel_audit_log on violations.';
