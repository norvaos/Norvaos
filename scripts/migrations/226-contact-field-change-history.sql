-- ============================================================================
-- Migration 226: Contact Field Change History
-- ============================================================================
-- Directive: Data Evolution — Verification & Historical Snapshot Engine
-- Records all changes to contact fields with old/new values, evidence links,
-- and user stamps. High-security fields (passport, name, DOB, national ID)
-- require either a verification document or a change rationale.
-- ============================================================================

-- ── Table: contact_field_changes ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_field_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name    TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  is_high_security  BOOLEAN NOT NULL DEFAULT false,
  -- For high-security changes: link to uploaded verification document
  evidence_document_id  UUID REFERENCES documents(id),
  -- Or a textual rationale if no document is uploaded
  change_rationale      TEXT,
  -- The user who made the change
  changed_by    UUID REFERENCES users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optional: link to the matter this change was made in context of
  matter_id     UUID REFERENCES matters(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contact_field_changes_contact
  ON contact_field_changes(contact_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_field_changes_tenant
  ON contact_field_changes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contact_field_changes_field
  ON contact_field_changes(contact_id, field_name);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE contact_field_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_field_changes_tenant_isolation
  ON contact_field_changes
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── High-security field definitions (stored as a reference) ──────────────────
-- These fields require verification evidence or rationale when changed:
--   passport_number, first_name, last_name, date_of_birth, national_id, uci
-- This is enforced at the application layer, not the database.

COMMENT ON TABLE contact_field_changes IS 'Tracks all changes to contact fields with old/new values, verification evidence, and user stamps. Part of the Data Evolution directive.';
