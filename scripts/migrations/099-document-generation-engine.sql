-- ============================================================================
-- Migration 099: Document Generation Engine — Phase 6
-- ============================================================================
-- Creates 15 tables for the document generation & correspondence automation
-- system. Includes RLS policies, performance indexes, and redline columns
-- (generation_tier, max_length) per the approved Phase 6 spec with addendum.
--
-- Tables:
--   1.  docgen_templates
--   2.  document_template_versions
--   3.  document_template_mappings  (+ max_length redline column)
--   4.  document_template_conditions
--   5.  document_clauses
--   6.  document_clause_assignments
--   7.  document_instances
--   8.  document_artifacts
--   9.  document_instance_fields
--  10.  document_signature_requests
--  11.  document_signers
--  12.  document_signer_events
--  13.  document_status_events
--  14.  document_template_audit_log
--  15.  document_workflow_rules
-- ============================================================================

-- ─── 1. docgen_templates ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS docgen_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key          TEXT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  document_family       TEXT NOT NULL,
  practice_area         TEXT,
  matter_type_id        UUID REFERENCES matter_types(id) ON DELETE SET NULL,
  jurisdiction_code     TEXT NOT NULL DEFAULT 'CA-ON',
  language_code         TEXT NOT NULL DEFAULT 'en',
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'superseded')),
  current_version_id    UUID,
  is_system_template    BOOLEAN NOT NULL DEFAULT false,
  requires_review       BOOLEAN NOT NULL DEFAULT false,
  -- Redline 3: Document family auto-generation tier
  generation_tier       TEXT NOT NULL DEFAULT 'manual_only'
    CHECK (generation_tier IN ('auto_draft', 'manual_only', 'auto_draft_with_review')),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INT NOT NULL DEFAULT 0,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_docgen_template_key UNIQUE (tenant_id, template_key)
);

ALTER TABLE docgen_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS docgen_templates_tenant_isolation ON docgen_templates;
CREATE POLICY docgen_templates_tenant_isolation ON docgen_templates
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_docgen_templates_tenant ON docgen_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_docgen_templates_family ON docgen_templates(tenant_id, document_family);
CREATE INDEX IF NOT EXISTS idx_docgen_templates_matter_type ON docgen_templates(tenant_id, matter_type_id) WHERE matter_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docgen_templates_status ON docgen_templates(tenant_id, status) WHERE is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_docgen_templates_updated_at') THEN
    CREATE TRIGGER set_docgen_templates_updated_at
      BEFORE UPDATE ON docgen_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 2. document_template_versions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_template_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       UUID NOT NULL REFERENCES docgen_templates(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  version_label     TEXT,
  template_body     JSONB NOT NULL DEFAULT '{}',
  change_summary    TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'superseded')),
  published_at      TIMESTAMPTZ,
  published_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_template_version UNIQUE (template_id, version_number)
);

ALTER TABLE document_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_template_versions_tenant_isolation ON document_template_versions;
CREATE POLICY document_template_versions_tenant_isolation ON document_template_versions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON document_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_status ON document_template_versions(template_id, status);

-- Add FK from docgen_templates.current_version_id now that versions table exists
ALTER TABLE docgen_templates
  ADD CONSTRAINT fk_docgen_templates_current_version
  FOREIGN KEY (current_version_id)
  REFERENCES document_template_versions(id)
  ON DELETE SET NULL
  NOT VALID;

-- ─── 3. document_template_mappings ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_template_mappings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  field_key             TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  source_entity         TEXT NOT NULL,
  source_path           TEXT NOT NULL,
  field_type            TEXT NOT NULL DEFAULT 'text',
  is_required           BOOLEAN NOT NULL DEFAULT false,
  default_value         TEXT,
  format_rule           TEXT,
  fallback_rule         TEXT,
  -- Redline 2: No silent truncation — max_length per mapping
  max_length            INT,
  sort_order            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_mapping_field UNIQUE (template_version_id, field_key)
);

ALTER TABLE document_template_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_template_mappings_tenant_isolation ON document_template_mappings;
CREATE POLICY document_template_mappings_tenant_isolation ON document_template_mappings
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_template_mappings_version ON document_template_mappings(template_version_id);

-- ─── 4. document_template_conditions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_template_conditions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  condition_key         TEXT NOT NULL,
  label                 TEXT NOT NULL,
  rules                 JSONB NOT NULL DEFAULT '{"rules":[]}',
  logic_operator        TEXT NOT NULL DEFAULT 'and'
    CHECK (logic_operator IN ('and', 'or')),
  evaluation_order      INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_condition_key UNIQUE (template_version_id, condition_key)
);

ALTER TABLE document_template_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_template_conditions_tenant_isolation ON document_template_conditions;
CREATE POLICY document_template_conditions_tenant_isolation ON document_template_conditions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_template_conditions_version ON document_template_conditions(template_version_id);

-- ─── 5. document_clauses ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_clauses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clause_key        TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  document_family   TEXT,
  practice_area     TEXT,
  jurisdiction_code TEXT NOT NULL DEFAULT 'CA-ON',
  language_code     TEXT NOT NULL DEFAULT 'en',
  content           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  version_number    INT NOT NULL DEFAULT 1,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_clause_key UNIQUE (tenant_id, clause_key)
);

ALTER TABLE document_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_clauses_tenant_isolation ON document_clauses;
CREATE POLICY document_clauses_tenant_isolation ON document_clauses
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_clauses_tenant ON document_clauses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clauses_family ON document_clauses(tenant_id, document_family) WHERE document_family IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_clauses_updated_at') THEN
    CREATE TRIGGER set_document_clauses_updated_at
      BEFORE UPDATE ON document_clauses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 6. document_clause_assignments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_clause_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  clause_id             UUID NOT NULL REFERENCES document_clauses(id) ON DELETE CASCADE,
  placement_key         TEXT NOT NULL,
  sort_order            INT NOT NULL DEFAULT 0,
  is_required           BOOLEAN NOT NULL DEFAULT false,
  condition_id          UUID REFERENCES document_template_conditions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_clause_assignment UNIQUE (template_version_id, clause_id, placement_key)
);

ALTER TABLE document_clause_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_clause_assignments_tenant_isolation ON document_clause_assignments;
CREATE POLICY document_clause_assignments_tenant_isolation ON document_clause_assignments
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_clause_assignments_version ON document_clause_assignments(template_version_id);
CREATE INDEX IF NOT EXISTS idx_clause_assignments_clause ON document_clause_assignments(clause_id);

-- ─── 7. document_instances ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_instances (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id                       UUID REFERENCES matters(id) ON DELETE SET NULL,
  contact_id                      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  template_id                     UUID NOT NULL REFERENCES docgen_templates(id) ON DELETE RESTRICT,
  template_version_id             UUID NOT NULL REFERENCES document_template_versions(id) ON DELETE RESTRICT,
  document_family                 TEXT NOT NULL,
  jurisdiction_code               TEXT NOT NULL DEFAULT 'CA-ON',
  title                           TEXT NOT NULL,
  status                          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'sent', 'partially_signed', 'signed', 'declined', 'voided', 'expired', 'superseded')),
  generation_mode                 TEXT NOT NULL DEFAULT 'manual'
    CHECK (generation_mode IN ('manual', 'auto_draft', 'auto_draft_with_review', 'regenerated')),
  source_snapshot_json            JSONB NOT NULL DEFAULT '{}',
  latest_artifact_id              UUID,
  latest_signature_request_id     UUID,
  supersedes_instance_id          UUID REFERENCES document_instances(id) ON DELETE SET NULL,
  generated_by                    UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active                       BOOLEAN NOT NULL DEFAULT true,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_instance_has_scope CHECK (matter_id IS NOT NULL OR contact_id IS NOT NULL)
);

ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_instances_tenant_isolation ON document_instances;
CREATE POLICY document_instances_tenant_isolation ON document_instances
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_instances_matter ON document_instances(matter_id) WHERE matter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_instances_contact ON document_instances(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_instances_template ON document_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_doc_instances_status ON document_instances(tenant_id, status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_doc_instances_family ON document_instances(tenant_id, document_family);
-- Idempotency check: active instance for (matter, template) pair
CREATE INDEX IF NOT EXISTS idx_doc_instances_idempotency ON document_instances(matter_id, template_id, status) WHERE is_active = true AND status NOT IN ('superseded', 'voided');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_instances_updated_at') THEN
    CREATE TRIGGER set_document_instances_updated_at
      BEFORE UPDATE ON document_instances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 8. document_artifacts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id       UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  artifact_type     TEXT NOT NULL DEFAULT 'generated_draft'
    CHECK (artifact_type IN ('generated_draft', 'approved_copy', 'sent_copy', 'signed_copy', 'countersigned_copy')),
  storage_path      TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_size         INT NOT NULL DEFAULT 0,
  file_type         TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  checksum_sha256   TEXT NOT NULL,
  is_final          BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — artifacts are immutable
DROP POLICY IF EXISTS document_artifacts_select ON document_artifacts;
CREATE POLICY document_artifacts_select ON document_artifacts
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_artifacts_insert ON document_artifacts;
CREATE POLICY document_artifacts_insert ON document_artifacts
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_artifacts_instance ON document_artifacts(instance_id);

-- Add FK from document_instances.latest_artifact_id
ALTER TABLE document_instances
  ADD CONSTRAINT fk_doc_instances_latest_artifact
  FOREIGN KEY (latest_artifact_id)
  REFERENCES document_artifacts(id)
  ON DELETE SET NULL
  NOT VALID;

-- ─── 9. document_instance_fields ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_instance_fields (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  field_key             TEXT NOT NULL,
  resolved_value_text   TEXT,
  resolved_value_json   JSONB,
  resolution_status     TEXT NOT NULL DEFAULT 'resolved'
    CHECK (resolution_status IN ('resolved', 'empty', 'default', 'fallback', 'unresolved', 'error')),
  source_path           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_instance_field UNIQUE (document_instance_id, field_key)
);

ALTER TABLE document_instance_fields ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — fields are frozen at generation time
DROP POLICY IF EXISTS document_instance_fields_select ON document_instance_fields;
CREATE POLICY document_instance_fields_select ON document_instance_fields
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_instance_fields_insert ON document_instance_fields;
CREATE POLICY document_instance_fields_insert ON document_instance_fields
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_instance_fields_instance ON document_instance_fields(document_instance_id);

-- ─── 10. document_signature_requests ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_signature_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'docusign', 'hellosign')),
  provider_request_id   TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'partially_signed', 'completed', 'declined', 'expired', 'cancelled')),
  sent_at               TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  reminder_count        INT NOT NULL DEFAULT 0,
  last_reminder_at      TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_signature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_signature_requests_tenant_isolation ON document_signature_requests;
CREATE POLICY document_signature_requests_tenant_isolation ON document_signature_requests
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sig_requests_instance ON document_signature_requests(document_instance_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_status ON document_signature_requests(tenant_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_signature_requests_updated_at') THEN
    CREATE TRIGGER set_document_signature_requests_updated_at
      BEFORE UPDATE ON document_signature_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Add FK from document_instances.latest_signature_request_id
ALTER TABLE document_instances
  ADD CONSTRAINT fk_doc_instances_latest_sig_request
  FOREIGN KEY (latest_signature_request_id)
  REFERENCES document_signature_requests(id)
  ON DELETE SET NULL
  NOT VALID;

-- ─── 11. document_signers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_signers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signature_request_id  UUID NOT NULL REFERENCES document_signature_requests(id) ON DELETE CASCADE,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  role_key              TEXT NOT NULL,
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  signing_order         INT NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired')),
  viewed_at             TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  decline_reason        TEXT,
  provider_signer_id    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_signers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_signers_tenant_isolation ON document_signers;
CREATE POLICY document_signers_tenant_isolation ON document_signers
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_signers_request ON document_signers(signature_request_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_signers_updated_at') THEN
    CREATE TRIGGER set_document_signers_updated_at
      BEFORE UPDATE ON document_signers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 12. document_signer_events ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_signer_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signer_id       UUID NOT NULL REFERENCES document_signers(id) ON DELETE CASCADE,
  request_id      UUID NOT NULL REFERENCES document_signature_requests(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  note            TEXT,
  performed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_signer_events ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — immutable event log
DROP POLICY IF EXISTS document_signer_events_select ON document_signer_events;
CREATE POLICY document_signer_events_select ON document_signer_events
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_signer_events_insert ON document_signer_events;
CREATE POLICY document_signer_events_insert ON document_signer_events
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_signer_events_signer ON document_signer_events(signer_id);
CREATE INDEX IF NOT EXISTS idx_signer_events_request ON document_signer_events(request_id);

-- ─── 13. document_status_events ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_status_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL,
  from_status           TEXT,
  to_status             TEXT,
  event_payload_json    JSONB NOT NULL DEFAULT '{}',
  performed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_status_events ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — immutable event log
DROP POLICY IF EXISTS document_status_events_select ON document_status_events;
CREATE POLICY document_status_events_select ON document_status_events
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_status_events_insert ON document_status_events;
CREATE POLICY document_status_events_insert ON document_status_events
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_status_events_instance ON document_status_events(document_instance_id);

-- ─── 14. document_template_audit_log ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_template_audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id           UUID NOT NULL REFERENCES docgen_templates(id) ON DELETE CASCADE,
  template_version_id   UUID REFERENCES document_template_versions(id) ON DELETE SET NULL,
  event_type            TEXT NOT NULL,
  event_payload_json    JSONB NOT NULL DEFAULT '{}',
  performed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_template_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — immutable audit log
DROP POLICY IF EXISTS document_template_audit_log_select ON document_template_audit_log;
CREATE POLICY document_template_audit_log_select ON document_template_audit_log
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS document_template_audit_log_insert ON document_template_audit_log;
CREATE POLICY document_template_audit_log_insert ON document_template_audit_log
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_template_audit_template ON document_template_audit_log(template_id);

-- ─── 15. document_workflow_rules ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_workflow_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  description             TEXT,
  document_family         TEXT NOT NULL,
  matter_type_id          UUID REFERENCES matter_types(id) ON DELETE SET NULL,
  practice_area           TEXT,
  jurisdiction_code       TEXT,
  trigger_type            TEXT NOT NULL
    CHECK (trigger_type IN ('matter_created', 'stage_changed', 'lead_converted', 'manual')),
  trigger_config_json     JSONB NOT NULL DEFAULT '{}',
  template_id             UUID NOT NULL REFERENCES docgen_templates(id) ON DELETE CASCADE,
  auto_generate           BOOLEAN NOT NULL DEFAULT true,
  auto_send_for_signature BOOLEAN NOT NULL DEFAULT false,
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'archived')),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_workflow_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_workflow_rules_tenant_isolation ON document_workflow_rules;
CREATE POLICY document_workflow_rules_tenant_isolation ON document_workflow_rules
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_workflow_rules_tenant ON document_workflow_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_trigger ON document_workflow_rules(tenant_id, trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_rules_template ON document_workflow_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_matter_type ON document_workflow_rules(tenant_id, matter_type_id) WHERE matter_type_id IS NOT NULL AND is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_document_workflow_rules_updated_at') THEN
    CREATE TRIGGER set_document_workflow_rules_updated_at
      BEFORE UPDATE ON document_workflow_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- END Migration 099
-- ============================================================================
