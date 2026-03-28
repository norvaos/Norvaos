-- ============================================================
-- 224: Lead Sources Table — Zero Fake Data
-- ============================================================
-- Replaces the hard-coded CONTACT_SOURCES array with a live,
-- tenant-scoped database table.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_lead_sources_tenant_name UNIQUE (tenant_id, name)
);

-- RLS
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_sources_tenant_isolation ON lead_sources
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Index
CREATE INDEX IF NOT EXISTS idx_lead_sources_tenant
  ON lead_sources (tenant_id, is_active, sort_order);

-- ============================================================
-- Seed the 5 Rana Law Office production sources
-- Uses a subquery to get the tenant_id dynamically.
-- If you have multiple tenants, run this per-tenant.
-- ============================================================
INSERT INTO lead_sources (tenant_id, name, sort_order)
SELECT t.id, s.name, s.sort_order
FROM tenants t
CROSS JOIN (
  VALUES
    ('Referral',      1),
    ('Website',       2),
    ('Google',        3),
    ('Social Media',  4),
    ('Walk-in',       5)
) AS s(name, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
