-- Migration 007: Create retainer_presets table + correct RLS policy
--
-- The table was defined in scripts/migrations/031 but never applied to the database.
-- This migration creates it from scratch with the correct RLS policy (USING + WITH CHECK).

CREATE TABLE IF NOT EXISTS retainer_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('professional_services', 'government_fees', 'disbursements')),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness guard: no duplicate active presets per tenant + category + description
CREATE UNIQUE INDEX IF NOT EXISTS idx_retainer_presets_unique_active
  ON retainer_presets (tenant_id, category, lower(description))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_retainer_presets_tenant ON retainer_presets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retainer_presets_category ON retainer_presets(tenant_id, category);

ALTER TABLE retainer_presets ENABLE ROW LEVEL SECURITY;

-- Drop any old policies (safe if they don't exist)
DROP POLICY IF EXISTS retainer_presets_tenant_isolation ON retainer_presets;
DROP POLICY IF EXISTS tenant_isolation_retainer_presets ON retainer_presets;

-- Create correct policy with USING + WITH CHECK
CREATE POLICY tenant_isolation_retainer_presets ON retainer_presets
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Auto-update updated_at on row modification
CREATE OR REPLACE TRIGGER set_retainer_presets_updated_at
  BEFORE UPDATE ON retainer_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
