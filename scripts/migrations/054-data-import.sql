-- Migration 054: Data Import tables
-- Supports importing data from Go High Level, Clio, and Officio

-- ─── import_batches ─────────────────────────────────────────────────────────
-- One row per import wizard run. Tracks overall progress and configuration.
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_platform TEXT NOT NULL CHECK (source_platform IN ('ghl', 'clio', 'officio')),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'contacts', 'leads', 'matters', 'tasks', 'notes', 'documents', 'time_entries', 'pipeline_stages'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'validating', 'importing', 'completed', 'completed_with_errors', 'failed', 'rolled_back'
  )),
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  storage_path TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  succeeded_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  validation_errors JSONB NOT NULL DEFAULT '[]',
  import_errors JSONB NOT NULL DEFAULT '[]',
  duplicate_strategy TEXT NOT NULL DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'update', 'create_new')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_tenant ON import_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(tenant_id, status);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_batches_tenant_isolation ON import_batches
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── import_records ─────────────────────────────────────────────────────────
-- Per-row tracking within a batch. Enables error reporting and rollback.
CREATE TABLE IF NOT EXISTS import_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  source_data JSONB NOT NULL DEFAULT '{}',
  source_id TEXT,
  target_entity_type TEXT NOT NULL,
  target_entity_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'succeeded', 'failed', 'skipped'
  )),
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_records_batch ON import_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_records_source_id ON import_records(tenant_id, batch_id, source_id);
CREATE INDEX IF NOT EXISTS idx_import_records_target ON import_records(tenant_id, target_entity_type, target_entity_id);

ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_records_tenant_isolation ON import_records
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── import_id_map ──────────────────────────────────────────────────────────
-- Persistent mapping from source platform IDs to NorvaOS IDs.
-- Used for cross-entity relationship resolution during import.
CREATE TABLE IF NOT EXISTS import_id_map (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_platform, source_entity_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_import_id_map_lookup ON import_id_map(tenant_id, source_platform, source_entity_type, source_id);

ALTER TABLE import_id_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_id_map_tenant_isolation ON import_id_map
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

