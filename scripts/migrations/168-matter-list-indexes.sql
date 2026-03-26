-- Migration 168: Performance indexes for 10k+ matter lists
-- Optimizes the matter list query: ORDER BY created_at DESC with tenant + status filters

-- 1. Composite index for the main matter list query
-- Covers: tenant_id = X AND status NOT IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_matters_tenant_status_created
ON matters (tenant_id, created_at DESC)
WHERE status NOT IN ('archived', 'import_reverted');

-- 2. Composite index for matter search (title/matter_number ILIKE)
CREATE INDEX IF NOT EXISTS idx_matters_tenant_title_search
ON matters (tenant_id, title text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_matters_tenant_number_search
ON matters (tenant_id, matter_number text_pattern_ops);

-- 3. Index for global_search RPC  -  ILIKE '%pattern%' needs trigram
-- Only create if pg_trgm extension exists (should already be enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matters_title_trgm ON matters USING gin (title gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matters_number_trgm ON matters USING gin (matter_number gin_trgm_ops)';
  END IF;
END $$;

COMMENT ON INDEX idx_matters_tenant_status_created IS
  'Covers matter list pagination: tenant + active status filter + created_at sort. Critical for 10k+ matters.';
