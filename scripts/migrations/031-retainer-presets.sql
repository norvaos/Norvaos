-- Migration 031: Retainer Presets
-- Persists firm-specific presets for the retainer builder.
-- Supports three categories: professional_services, government_fees, disbursements.
-- Amounts stored in cents. Currency defaults to CAD.

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

CREATE POLICY retainer_presets_tenant_isolation ON retainer_presets
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Auto-update updated_at on row modification
CREATE TRIGGER set_retainer_presets_updated_at
  BEFORE UPDATE ON retainer_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
