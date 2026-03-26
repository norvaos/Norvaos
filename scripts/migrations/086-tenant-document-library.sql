-- Migration 086: Tenant Document Library
-- Two-layer document slot architecture:
--   Layer 1: tenant_document_library   -  master catalog, deduplicated, tenant-owned
--   Layer 2: document_slot_templates   -  per-matter-type template rows (unchanged engine)
-- Replaces hardcoded document-slot-presets.ts with a DB-driven library.
-- The document engine (document-slot-engine.ts) is NOT changed  -  it still reads
-- document_slot_templates as before. The library is purely the source of truth
-- for definitions; "Add from Library" stamps template rows with library_slot_id set.

-- ============================================================
-- 1. tenant_document_library  -  master catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_document_library (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Definition
  slot_name            TEXT NOT NULL,
  slot_slug            TEXT NOT NULL,
  description          TEXT,
  description_fr       TEXT,
  category             TEXT NOT NULL DEFAULT 'general',
  person_role_scope    TEXT DEFAULT NULL,
  is_required          BOOLEAN NOT NULL DEFAULT false,
  accepted_file_types  TEXT[] DEFAULT '{application/pdf,image/jpeg,image/png}',
  max_file_size_bytes  BIGINT DEFAULT 52428800,

  -- Tagging: groups slots into bundles (e.g. 'visitor_visa', 'work_permit')
  -- Used for bulk-select in "Add from Library" UI
  tags                 TEXT[] DEFAULT '{}',

  -- Future SaaS hooks (nullable stubs  -  do not use yet)
  jurisdiction_code    TEXT NOT NULL DEFAULT 'CA',
  platform_slot_id     UUID DEFAULT NULL,   -- future: FK to platform_document_library

  sort_order           INT NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, slot_slug)
);

ALTER TABLE tenant_document_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_document_library_isolation ON tenant_document_library;
CREATE POLICY tenant_document_library_isolation ON tenant_document_library
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tenant_doc_library_tenant
  ON tenant_document_library(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_doc_library_category
  ON tenant_document_library(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_tenant_doc_library_active
  ON tenant_document_library(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tenant_doc_library_tags
  ON tenant_document_library USING GIN (tags);

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_tenant_document_library_updated_at'
  ) THEN
    CREATE TRIGGER set_tenant_document_library_updated_at
      BEFORE UPDATE ON tenant_document_library
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 2. Add library_slot_id to document_slot_templates
-- ============================================================
-- Nullable FK: NULL = custom slot not from library.
-- Set when "Add from Library" creates a template row.
-- Allows bulk-sync: UPDATE document_slot_templates SET description = lib.description
--   FROM tenant_document_library lib WHERE library_slot_id = lib.id.
ALTER TABLE document_slot_templates
  ADD COLUMN IF NOT EXISTS library_slot_id UUID
    REFERENCES tenant_document_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slot_templates_library_slot
  ON document_slot_templates(library_slot_id)
  WHERE library_slot_id IS NOT NULL;
