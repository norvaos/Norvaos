-- ============================================================================
-- Migration 211: Clio Sovereign Bridge — Directive 035
--
-- Tables for Clio OAuth connections, migration tracking, and error logging.
-- Also adds clio_source_id columns to contacts, matters, and trust_transactions
-- to prevent double-imports.
-- ============================================================================

BEGIN;

-- NOTE: Clio OAuth tokens are stored in the existing `platform_connections`
-- table (platform = 'clio'). No separate clio_connections table needed.

-- ── Clio Migrations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clio_migrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES platform_connections(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  progress        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clio_migrations_tenant
  ON clio_migrations (tenant_id);

ALTER TABLE clio_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clio_migrations_tenant_isolation" ON clio_migrations
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── Clio Migration Logs (error/audit trail) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS clio_migration_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_id    UUID REFERENCES clio_migrations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase           TEXT NOT NULL,
  clio_source_id  TEXT,
  error_message   TEXT,
  severity        TEXT NOT NULL DEFAULT 'error'
                    CHECK (severity IN ('info', 'warning', 'error')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clio_migration_logs_migration
  ON clio_migration_logs (migration_id);

ALTER TABLE clio_migration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clio_migration_logs_tenant_isolation" ON clio_migration_logs
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── Document Import Queue (Sentinel Eye scan queue) ─────────────────────────

CREATE TABLE IF NOT EXISTS document_import_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
  clio_document_id  TEXT,
  clio_version_id   TEXT,
  file_name       TEXT NOT NULL,
  content_type    TEXT,
  file_size       BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending_scan'
                    CHECK (status IN ('pending_scan', 'scanning', 'completed', 'failed')),
  scan_result     JSONB,
  source          TEXT DEFAULT 'clio_import',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_document_import_queue_tenant_status
  ON document_import_queue (tenant_id, status);

ALTER TABLE document_import_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_import_queue_tenant_isolation" ON document_import_queue
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── Add clio_source_id to existing tables (prevent double-imports) ──────────

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS clio_source_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_clio_source
  ON contacts (tenant_id, clio_source_id) WHERE clio_source_id IS NOT NULL;

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS clio_source_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_clio_source
  ON matters (tenant_id, clio_source_id) WHERE clio_source_id IS NOT NULL;

-- trust_transactions: add clio_source_id if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trust_transactions') THEN
    ALTER TABLE trust_transactions
      ADD COLUMN IF NOT EXISTS clio_source_id TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_txn_clio_source
      ON trust_transactions (tenant_id, clio_source_id) WHERE clio_source_id IS NOT NULL;
  END IF;
END $$;

COMMIT;
