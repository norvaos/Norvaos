-- ============================================================================
-- Migration 028: Document Engine — Slot Model, Versioning, Review RPCs
-- ============================================================================
-- Phase B.2: Structured document management with slot-based requirements,
-- immutable versioning, acceptance workflows, and transactional operations.
--
-- Tables:
--   1. document_slot_templates — per-type definitions (what docs are needed)
--   2. document_slots — per-matter instances (denormalized, soft-deletable)
--   3. document_versions — immutable version history (SELECT + INSERT only)
--
-- RPCs:
--   4. upload_document_version() — atomic version creation with row locking
--   5. review_document_version() — atomic review (slot + version + audit)
-- ============================================================================

-- ─── 1. document_slot_templates ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_slot_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Scope: exactly one of these must be set
  matter_type_id      UUID REFERENCES matter_types(id) ON DELETE CASCADE,
  case_type_id        UUID REFERENCES immigration_case_types(id) ON DELETE CASCADE,

  -- Slot definition
  slot_name           TEXT NOT NULL,
  slot_slug           TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'general',
  person_role_scope   TEXT DEFAULT NULL,
  is_required         BOOLEAN NOT NULL DEFAULT true,
  accepted_file_types TEXT[] DEFAULT '{application/pdf,image/jpeg,image/png}',
  max_file_size_bytes BIGINT DEFAULT 52428800,
  conditions          JSONB DEFAULT NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_slot_template_scope CHECK (
    (matter_type_id IS NOT NULL AND case_type_id IS NULL) OR
    (matter_type_id IS NULL AND case_type_id IS NOT NULL)
  ),
  CONSTRAINT uq_slot_template UNIQUE (tenant_id, matter_type_id, case_type_id, slot_slug, person_role_scope)
);

ALTER TABLE document_slot_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_slot_templates_tenant_isolation ON document_slot_templates;
CREATE POLICY document_slot_templates_tenant_isolation ON document_slot_templates
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_slot_templates_matter_type
  ON document_slot_templates(tenant_id, matter_type_id) WHERE matter_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slot_templates_case_type
  ON document_slot_templates(tenant_id, case_type_id) WHERE case_type_id IS NOT NULL;

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_slot_templates_updated_at'
  ) THEN
    CREATE TRIGGER set_document_slot_templates_updated_at
      BEFORE UPDATE ON document_slot_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 2. document_slots ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id           UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  person_id           UUID REFERENCES matter_people(id) ON DELETE SET NULL,
  slot_template_id    UUID REFERENCES document_slot_templates(id) ON DELETE SET NULL,

  -- Denormalized from template
  slot_name           TEXT NOT NULL,
  slot_slug           TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'general',
  person_role         TEXT DEFAULT NULL,
  is_required         BOOLEAN NOT NULL DEFAULT true,
  accepted_file_types TEXT[] DEFAULT '{application/pdf,image/jpeg,image/png}',
  max_file_size_bytes BIGINT DEFAULT 52428800,

  -- Status machine
  status              TEXT NOT NULL DEFAULT 'empty'
    CHECK (status IN ('empty', 'pending_review', 'accepted', 'needs_re_upload', 'rejected')),

  -- Current version tracking
  current_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  current_version     INT NOT NULL DEFAULT 0,

  -- Sort & lifecycle
  sort_order          INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  deactivated_at      TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_slot UNIQUE (matter_id, slot_template_id, person_id)
);

ALTER TABLE document_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_slots_tenant_isolation ON document_slots;
CREATE POLICY document_slots_tenant_isolation ON document_slots
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_slots_matter ON document_slots(matter_id);
CREATE INDEX IF NOT EXISTS idx_doc_slots_person ON document_slots(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_slots_status ON document_slots(matter_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_slots_active ON document_slots(matter_id, is_active);

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_slots_updated_at'
  ) THEN
    CREATE TRIGGER set_document_slots_updated_at
      BEFORE UPDATE ON document_slots
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 3. document_versions (immutable) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_id             UUID NOT NULL REFERENCES document_slots(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number      INT NOT NULL,

  -- File metadata snapshot
  storage_path        TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_size           BIGINT,
  file_type           TEXT,

  -- Upload tracking
  uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Review state
  review_status       TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'accepted', 'needs_re_upload', 'rejected')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_reason       TEXT,

  -- Immutable timestamp
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Race-condition prevention
  CONSTRAINT uq_slot_version UNIQUE (slot_id, version_number)
);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — immutable history
DROP POLICY IF EXISTS document_versions_select ON document_versions;
CREATE POLICY document_versions_select ON document_versions
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_versions_insert ON document_versions;
CREATE POLICY document_versions_insert ON document_versions
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- No UPDATE or DELETE policies — review updates go through SECURITY DEFINER RPCs

CREATE INDEX IF NOT EXISTS idx_doc_versions_slot ON document_versions(slot_id, version_number);
CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_review ON document_versions(slot_id, review_status);

-- ─── 4. RPC: upload_document_version() ──────────────────────────────────────
-- Atomic version creation with row locking.
-- Prevents race conditions from concurrent uploads to the same slot.

CREATE OR REPLACE FUNCTION upload_document_version(
  p_tenant_id     UUID,
  p_slot_id       UUID,
  p_document_id   UUID,
  p_storage_path  TEXT,
  p_file_name     TEXT,
  p_file_size     BIGINT,
  p_file_type     TEXT,
  p_uploaded_by   UUID
)
RETURNS INT AS $$
DECLARE
  v_new_version INT;
BEGIN
  -- Lock the slot row to prevent concurrent version number assignment
  PERFORM id FROM document_slots WHERE id = p_slot_id FOR UPDATE;

  -- Compute next version number atomically
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM document_versions WHERE slot_id = p_slot_id;

  -- Insert version record
  INSERT INTO document_versions (
    tenant_id, slot_id, document_id, version_number,
    storage_path, file_name, file_size, file_type,
    uploaded_by, review_status
  ) VALUES (
    p_tenant_id, p_slot_id, p_document_id, v_new_version,
    p_storage_path, p_file_name, p_file_size, p_file_type,
    p_uploaded_by, 'pending_review'
  );

  -- Update slot to point to new version
  UPDATE document_slots SET
    current_document_id = p_document_id,
    current_version = v_new_version,
    status = 'pending_review'
  WHERE id = p_slot_id;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5. RPC: review_document_version() ──────────────────────────────────────
-- Atomic review: slot status + version metadata + audit log in one transaction.

CREATE OR REPLACE FUNCTION review_document_version(
  p_tenant_id      UUID,
  p_slot_id        UUID,
  p_user_id        UUID,
  p_action         TEXT,
  p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_slot RECORD;
  v_version_number INT;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept', 'needs_re_upload', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || p_action);
  END IF;

  -- Lock and fetch slot
  SELECT * INTO v_slot FROM document_slots
  WHERE id = p_slot_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot not found');
  END IF;

  IF v_slot.current_version = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No document uploaded to review');
  END IF;

  -- Prevent re-review of already finalized versions
  IF v_slot.status IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Current version is already ' || v_slot.status || '. Upload a new version to initiate a new review.');
  END IF;

  v_version_number := v_slot.current_version;

  -- Update version review metadata
  UPDATE document_versions SET
    review_status = p_action,
    reviewed_by = p_user_id,
    reviewed_at = now(),
    review_reason = p_reason
  WHERE slot_id = p_slot_id AND version_number = v_version_number;

  -- Update slot status
  UPDATE document_slots SET status = p_action
  WHERE id = p_slot_id;

  -- Insert audit log
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes, source)
  VALUES (
    p_tenant_id,
    p_user_id,
    'document_' || p_action,
    'document_slot',
    p_slot_id,
    jsonb_build_object(
      'slot_name', v_slot.slot_name,
      'version_number', v_version_number,
      'action', p_action,
      'reason', p_reason
    ),
    'web'
  );

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', p_slot_id,
    'version_number', v_version_number,
    'new_status', p_action
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- END Migration 028
-- ============================================================================
