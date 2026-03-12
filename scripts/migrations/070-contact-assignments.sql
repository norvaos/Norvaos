-- ============================================================================
-- Migration 070: Contact Team Assignments
-- ============================================================================
-- Adds a junction table to assign multiple team members to a contact with roles.
-- Replaces the single responsible_lawyer_id pattern with a flexible team model:
--   - One "primary" person (is_primary = true) — the main handler
--   - Additional team members (lawyer, paralegal, clerk, support, etc.)
-- ============================================================================

-- ── New table: contact_assignments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'responsible',  -- responsible | supporting | paralegal | clerk | supervisor
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate user-contact assignments with same role
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_assignments_unique
  ON contact_assignments(contact_id, user_id, role);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_contact_assignments_contact ON contact_assignments(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_assignments_user ON contact_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_assignments_tenant ON contact_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_assignments_primary ON contact_assignments(contact_id, is_primary) WHERE is_primary = true;

-- Row Level Security
ALTER TABLE contact_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contact_assignments ON contact_assignments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_contact_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_assignments_updated_at
  BEFORE UPDATE ON contact_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_assignments_updated_at();
