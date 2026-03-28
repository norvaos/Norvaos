-- Migration 181: Rename chinook_scans → audit_optimizer_scans
-- The term 'Chinook' is retired from all schemas. The table is
-- renamed to align with the Audit-Optimizer / Regulator-Mirror branding.

ALTER TABLE IF EXISTS chinook_scans RENAME TO audit_optimizer_scans;

-- Rename indexes
ALTER INDEX IF EXISTS idx_chinook_tenant  RENAME TO idx_audit_optimizer_tenant;
ALTER INDEX IF EXISTS idx_chinook_matter  RENAME TO idx_audit_optimizer_matter;
ALTER INDEX IF EXISTS idx_chinook_status  RENAME TO idx_audit_optimizer_status;

-- Rename RLS policy
ALTER POLICY IF EXISTS chinook_scans_tenant_isolation ON audit_optimizer_scans
  RENAME TO audit_optimizer_scans_tenant_isolation;
