-- ============================================================================
-- Migration 218: Sovereign Audit Log Indexes  -  Directive 052
-- ============================================================================
--
-- The Sovereign Audit Log is the immutable forensic record of every
-- business-critical event in NorvaOS. These indexes ensure that the
-- Principal can scroll through 10,000+ audit entries with sub-second
-- latency, filtered by tenant, event type, record, or date range.
--
-- The sentinel_audit_log table is write-only (INSERT only, no UPDATE or
-- DELETE). RLS prevents tenants from reading each other's audit trails;
-- the admin client (service_role) is used for writes.
-- ============================================================================

-- Index 1: Primary query path  -  tenant-scoped, newest-first pagination.
-- Covers the default Forensic Stream view (all events for a tenant, DESC).
CREATE INDEX IF NOT EXISTS idx_sentinel_audit_tenant_created
  ON sentinel_audit_log (tenant_id, created_at DESC);

-- Index 2: Event-type filter within a tenant.
-- Covers "Filter by Ignite Only" and per-type queries.
CREATE INDEX IF NOT EXISTS idx_sentinel_audit_tenant_event_type
  ON sentinel_audit_log (tenant_id, event_type);

-- Index 3: Record lookup within a tenant.
-- Covers "show all audit entries for this matter/document" queries.
CREATE INDEX IF NOT EXISTS idx_sentinel_audit_tenant_record
  ON sentinel_audit_log (tenant_id, record_id);

-- Table comment for documentation
COMMENT ON TABLE sentinel_audit_log IS
  'Directive 052  -  Sovereign Audit Log. Immutable, append-only forensic '
  'record of all business-critical events (matter lifecycle, document '
  'operations, stage transitions, retainer signing, portal access). '
  'Write-only via admin client. Never updated or deleted.';
