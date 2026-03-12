-- 069: Conflict Engine — Contact Automation, Conflict Search & Controlled Matter Opening
--
-- Creates:
--   1. New columns on contacts (conflict_score, conflict_status, pipeline_stage, milestone, matter_type_id)
--   2. conflict_scans — one row per scan execution
--   3. conflict_matches — individual matches per scan
--   4. conflict_decisions — lawyer review decisions
--   5. Enable pg_trgm extension for fuzzy name matching
--
-- All tables follow standard RLS pattern: tenant_id = public.get_current_tenant_id()

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0. Enable pg_trgm for fuzzy matching
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. New columns on contacts
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS conflict_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conflict_status TEXT NOT NULL DEFAULT 'not_run',
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS milestone TEXT NOT NULL DEFAULT 'lead_created',
  ADD COLUMN IF NOT EXISTS milestone_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id) ON DELETE SET NULL;

-- Trigram indexes for fuzzy name search on contacts
CREATE INDEX IF NOT EXISTS idx_contacts_first_name_trgm ON contacts USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name_trgm ON contacts USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_org_name_trgm ON contacts USING gin (organization_name gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. conflict_scans — one row per scan execution
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conflict_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES users(id),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  score INTEGER NOT NULL DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  search_inputs JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conflict_scans_contact ON conflict_scans(contact_id);
CREATE INDEX IF NOT EXISTS idx_conflict_scans_tenant ON conflict_scans(tenant_id);

ALTER TABLE conflict_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_conflict_scans'
  ) THEN
    CREATE POLICY tenant_isolation_conflict_scans ON conflict_scans
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. conflict_matches — individual matches per scan
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conflict_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES conflict_scans(id) ON DELETE CASCADE,
  matched_entity_type TEXT NOT NULL,
  matched_entity_id UUID NOT NULL,
  match_category TEXT NOT NULL,
  match_reasons JSONB NOT NULL DEFAULT '[]',
  confidence INTEGER NOT NULL DEFAULT 0,
  matched_name TEXT,
  matched_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_scan ON conflict_matches(scan_id);
CREATE INDEX IF NOT EXISTS idx_conflict_matches_tenant ON conflict_matches(tenant_id);

ALTER TABLE conflict_matches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_conflict_matches'
  ) THEN
    CREATE POLICY tenant_isolation_conflict_matches ON conflict_matches
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. conflict_decisions — lawyer review decisions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conflict_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES conflict_scans(id) ON DELETE SET NULL,
  decided_by UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  decision_scope TEXT NOT NULL DEFAULT 'contact',
  matter_type_id UUID REFERENCES matter_types(id),
  notes TEXT,
  internal_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conflict_decisions_contact ON conflict_decisions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conflict_decisions_tenant ON conflict_decisions(tenant_id);

ALTER TABLE conflict_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_conflict_decisions'
  ) THEN
    CREATE POLICY tenant_isolation_conflict_decisions ON conflict_decisions
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;
