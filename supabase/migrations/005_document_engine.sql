-- ============================================================================
-- Migration 005: NorvaOS Document Generation Engine
-- ============================================================================
-- Independent, tenant-safe, template-driven document generation module.
-- Supports retainer agreements, non-engagement letters, disengagement letters,
-- and future document types across jurisdictions and practice areas.
--
-- Tables created (15):
--   1.  docgen_templates (renamed from document_templates to avoid collision with existing table)
--   2.  document_template_versions
--   3.  document_template_mappings
--   4.  document_template_conditions
--   5.  document_clauses
--   6.  document_clause_assignments
--   7.  document_instances
--   8.  document_artifacts
--   9.  document_instance_fields
--   10. document_signature_requests
--   11. document_signers
--   12. document_signer_events
--   13. document_status_events
--   14. document_template_audit_log
--   15. document_workflow_rules
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE doc_template_status AS ENUM ('draft','published','archived','superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_instance_status AS ENUM ('draft','pending_review','approved','sent','partially_signed','signed','declined','voided','superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_signature_request_status AS ENUM ('pending','sent','opened','partially_signed','completed','declined','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_signer_status AS ENUM ('pending','sent','viewed','signed','declined','expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_field_type AS ENUM ('text','number','date','currency','boolean','address','json','signature');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_generation_mode AS ENUM ('manual','auto','workflow_trigger');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_condition_operator AS ENUM ('equals','not_equals','is_empty','is_not_empty','greater_than','less_than','contains','in_list','truthy','falsy');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: TEMPLATE MANAGEMENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. docgen_templates ──────────────────────────────────────────────────

CREATE TABLE docgen_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key          VARCHAR(100) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  document_family       VARCHAR(50) NOT NULL,  -- engagement, disengagement, correspondence, immigration, general
  practice_area         VARCHAR(100),
  matter_type_id        UUID        REFERENCES matter_types(id) ON DELETE SET NULL,
  jurisdiction_code     VARCHAR(10) NOT NULL DEFAULT 'ON-CA',
  language_code         VARCHAR(10) NOT NULL DEFAULT 'en',
  status                doc_template_status NOT NULL DEFAULT 'draft',
  current_version_id    UUID,  -- FK added after versions table created
  is_system_template    BOOLEAN     NOT NULL DEFAULT false,
  requires_review       BOOLEAN     NOT NULL DEFAULT true,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_docgen_templates_tenant_key UNIQUE (tenant_id, template_key)
);

CREATE INDEX idx_docgen_templates_tenant ON docgen_templates (tenant_id);
CREATE INDEX idx_docgen_templates_family ON docgen_templates (tenant_id, document_family);
CREATE INDEX idx_docgen_templates_status ON docgen_templates (tenant_id, status);
CREATE INDEX idx_docgen_templates_matter_type ON docgen_templates (matter_type_id) WHERE matter_type_id IS NOT NULL;
CREATE INDEX idx_docgen_templates_active ON docgen_templates (tenant_id, is_active, status);


-- ─── 2. document_template_versions ──────────────────────────────────────────

CREATE TABLE document_template_versions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id           UUID        NOT NULL REFERENCES docgen_templates(id) ON DELETE CASCADE,
  version_number        INTEGER     NOT NULL,
  version_label         VARCHAR(50),
  template_body         JSONB       NOT NULL,  -- normalized template structure (sections, elements, header, footer, metadata)
  change_summary        TEXT,
  status                doc_template_status NOT NULL DEFAULT 'draft',
  published_at          TIMESTAMPTZ,
  published_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_template_versions_number UNIQUE (template_id, version_number)
);

CREATE INDEX idx_document_template_versions_template ON document_template_versions (template_id);
CREATE INDEX idx_document_template_versions_status ON document_template_versions (status);

-- Add FK from templates.current_version_id → versions.id
ALTER TABLE docgen_templates
  ADD CONSTRAINT fk_docgen_templates_current_version
  FOREIGN KEY (current_version_id)
  REFERENCES document_template_versions(id)
  ON DELETE SET NULL;


-- ─── 3. document_template_mappings ──────────────────────────────────────────

CREATE TABLE document_template_mappings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID        NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  field_key             VARCHAR(100) NOT NULL,  -- e.g. 'client.full_name'
  display_name          VARCHAR(255) NOT NULL,
  source_entity         VARCHAR(50) NOT NULL,  -- matter, contact, billing, tenant, user, custom
  source_path           VARCHAR(255) NOT NULL,  -- dot-notation path e.g. 'contacts.first_name'
  field_type            doc_field_type NOT NULL DEFAULT 'text',
  is_required           BOOLEAN     NOT NULL DEFAULT false,
  default_value         TEXT,
  format_rule           VARCHAR(100),  -- e.g. 'MMMM D, YYYY' for dates
  fallback_rule         TEXT,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_template_mappings_field UNIQUE (template_version_id, field_key)
);

CREATE INDEX idx_document_template_mappings_version ON document_template_mappings (template_version_id);


-- ─── 4. document_template_conditions ────────────────────────────────────────

CREATE TABLE document_template_conditions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID        NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  condition_key         VARCHAR(100) NOT NULL,
  label                 VARCHAR(255) NOT NULL,  -- human-readable e.g. 'Show if flat fee'
  rules                 JSONB       NOT NULL,   -- structured: { "rules": [{ "field_key", "operator", "value" }] }
  logic_operator        VARCHAR(5)  NOT NULL DEFAULT 'AND'
    CHECK (logic_operator IN ('AND', 'OR')),
  evaluation_order      INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_template_conditions_key UNIQUE (template_version_id, condition_key)
);

CREATE INDEX idx_document_template_conditions_version ON document_template_conditions (template_version_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: CLAUSE MANAGEMENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 5. document_clauses ────────────────────────────────────────────────────

CREATE TABLE document_clauses (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clause_key            VARCHAR(100) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  document_family       VARCHAR(50),
  practice_area         VARCHAR(100),
  jurisdiction_code     VARCHAR(10) NOT NULL DEFAULT 'ON-CA',
  language_code         VARCHAR(10) NOT NULL DEFAULT 'en',
  content               TEXT        NOT NULL,  -- may contain {{merge_field}} placeholders
  status                doc_template_status NOT NULL DEFAULT 'draft',
  version_number        INTEGER     NOT NULL DEFAULT 1,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_clauses_key_version UNIQUE (tenant_id, clause_key, version_number)
);

CREATE INDEX idx_document_clauses_tenant ON document_clauses (tenant_id);
CREATE INDEX idx_document_clauses_family ON document_clauses (tenant_id, document_family);
CREATE INDEX idx_document_clauses_active ON document_clauses (tenant_id, is_active);


-- ─── 6. document_clause_assignments ─────────────────────────────────────────

CREATE TABLE document_clause_assignments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_version_id   UUID        NOT NULL REFERENCES document_template_versions(id) ON DELETE CASCADE,
  clause_id             UUID        NOT NULL REFERENCES document_clauses(id) ON DELETE CASCADE,
  placement_key         VARCHAR(100) NOT NULL,  -- matches clause_placeholder.clause_placement_key in template body
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  is_required           BOOLEAN     NOT NULL DEFAULT false,
  condition_id          UUID        REFERENCES document_template_conditions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_clause_assignments UNIQUE (template_version_id, clause_id, placement_key)
);

CREATE INDEX idx_document_clause_assignments_version ON document_clause_assignments (template_version_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: DOCUMENT INSTANCE & ARTIFACT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 7. document_instances ──────────────────────────────────────────────────

CREATE TABLE document_instances (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id                   UUID        REFERENCES matters(id) ON DELETE SET NULL,
  contact_id                  UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  template_id                 UUID        NOT NULL REFERENCES docgen_templates(id),
  template_version_id         UUID        NOT NULL REFERENCES document_template_versions(id),
  document_family             VARCHAR(50) NOT NULL,
  jurisdiction_code           VARCHAR(10) NOT NULL DEFAULT 'ON-CA',
  title                       VARCHAR(255) NOT NULL,
  status                      doc_instance_status NOT NULL DEFAULT 'draft',
  generation_mode             doc_generation_mode NOT NULL DEFAULT 'manual',
  source_snapshot_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  latest_artifact_id          UUID,  -- FK added after artifacts table created
  latest_signature_request_id UUID,  -- FK added after signature_requests table created
  supersedes_instance_id      UUID  REFERENCES document_instances(id) ON DELETE SET NULL,
  generated_by                UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_instances_tenant ON document_instances (tenant_id);
CREATE INDEX idx_document_instances_matter ON document_instances (tenant_id, matter_id);
CREATE INDEX idx_document_instances_contact ON document_instances (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_document_instances_status ON document_instances (tenant_id, status);
CREATE INDEX idx_document_instances_family ON document_instances (tenant_id, document_family);
CREATE INDEX idx_document_instances_template ON document_instances (template_id);
CREATE INDEX idx_document_instances_supersedes ON document_instances (supersedes_instance_id) WHERE supersedes_instance_id IS NOT NULL;


-- ─── 8. document_artifacts ──────────────────────────────────────────────────
-- INSERT-only / immutable. Tracks every generated file.

CREATE TABLE document_artifacts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id           UUID        NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  artifact_type         VARCHAR(30) NOT NULL
    CHECK (artifact_type IN ('generated_draft', 'approved_copy', 'sent_copy', 'signed_copy', 'countersigned_copy')),
  storage_path          TEXT        NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  file_size             INTEGER     NOT NULL,
  file_type             VARCHAR(20) NOT NULL DEFAULT 'docx',
  checksum_sha256       VARCHAR(64) NOT NULL,
  is_final              BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_artifacts_instance ON document_artifacts (instance_id);
CREATE INDEX idx_document_artifacts_tenant ON document_artifacts (tenant_id);

-- Add FK from instances.latest_artifact_id → artifacts.id
ALTER TABLE document_instances
  ADD CONSTRAINT fk_document_instances_latest_artifact
  FOREIGN KEY (latest_artifact_id)
  REFERENCES document_artifacts(id)
  ON DELETE SET NULL;


-- ─── 9. document_instance_fields ────────────────────────────────────────────

CREATE TABLE document_instance_fields (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID        NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  field_key             VARCHAR(100) NOT NULL,
  resolved_value_text   TEXT,
  resolved_value_json   JSONB,
  resolution_status     VARCHAR(30) NOT NULL DEFAULT 'resolved'
    CHECK (resolution_status IN ('resolved', 'missing', 'fallback_used', 'conditional_skipped')),
  source_path           VARCHAR(255),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_instance_fields UNIQUE (document_instance_id, field_key)
);

CREATE INDEX idx_document_instance_fields_instance ON document_instance_fields (document_instance_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: SIGNATURE WORKFLOW TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 10. document_signature_requests ────────────────────────────────────────

CREATE TABLE document_signature_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID        NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  provider              VARCHAR(50) NOT NULL DEFAULT 'manual',  -- manual, docusign, hellosign
  provider_request_id   VARCHAR(255),
  status                doc_signature_request_status NOT NULL DEFAULT 'pending',
  sent_at               TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  reminder_count        INTEGER     NOT NULL DEFAULT 0,
  last_reminder_at      TIMESTAMPTZ,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_signature_requests_instance ON document_signature_requests (document_instance_id);
CREATE INDEX idx_document_signature_requests_tenant ON document_signature_requests (tenant_id);
CREATE INDEX idx_document_signature_requests_status ON document_signature_requests (tenant_id, status);

CREATE UNIQUE INDEX uq_document_signature_requests_provider
  ON document_signature_requests (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

-- Add FK from instances.latest_signature_request_id → signature_requests.id
ALTER TABLE document_instances
  ADD CONSTRAINT fk_document_instances_latest_signature_request
  FOREIGN KEY (latest_signature_request_id)
  REFERENCES document_signature_requests(id)
  ON DELETE SET NULL;


-- ─── 11. document_signers ───────────────────────────────────────────────────

CREATE TABLE document_signers (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signature_request_id  UUID        NOT NULL REFERENCES document_signature_requests(id) ON DELETE CASCADE,
  contact_id            UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  role_key              VARCHAR(50) NOT NULL,  -- client, lawyer, witness, firm_representative
  name                  VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  signing_order         INTEGER     NOT NULL DEFAULT 1,
  status                doc_signer_status NOT NULL DEFAULT 'pending',
  viewed_at             TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  decline_reason        TEXT,
  provider_signer_id    VARCHAR(255),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_signers_request ON document_signers (signature_request_id);
CREATE INDEX idx_document_signers_contact ON document_signers (contact_id) WHERE contact_id IS NOT NULL;


-- ─── 12. document_signer_events ─────────────────────────────────────────────
-- Append-only / immutable. Audit trail for signer status changes.

CREATE TABLE document_signer_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signer_id             UUID        NOT NULL REFERENCES document_signers(id) ON DELETE CASCADE,
  request_id            UUID        NOT NULL REFERENCES document_signature_requests(id) ON DELETE CASCADE,
  event_type            VARCHAR(30) NOT NULL,  -- status_changed, reminder_sent, note_added
  from_status           VARCHAR(30),
  to_status             VARCHAR(30),
  note                  TEXT,
  performed_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_signer_events_signer ON document_signer_events (signer_id);
CREATE INDEX idx_document_signer_events_request ON document_signer_events (request_id);
CREATE INDEX idx_document_signer_events_tenant ON document_signer_events (tenant_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: AUDIT & EVENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 13. document_status_events ─────────────────────────────────────────────
-- Append-only / immutable. Instance lifecycle event log.

CREATE TABLE document_status_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_instance_id  UUID        NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  event_type            VARCHAR(50) NOT NULL,  -- created, regenerated_draft, reviewed, approved, sent, signed, declined, voided, superseded, downloaded
  from_status           VARCHAR(30),
  to_status             VARCHAR(30),
  event_payload_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  performed_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_status_events_instance ON document_status_events (document_instance_id);
CREATE INDEX idx_document_status_events_tenant ON document_status_events (tenant_id);
CREATE INDEX idx_document_status_events_type ON document_status_events (event_type);


-- ─── 14. document_template_audit_log ────────────────────────────────────────
-- Append-only / immutable. Template change log.

CREATE TABLE document_template_audit_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id           UUID        NOT NULL REFERENCES docgen_templates(id) ON DELETE CASCADE,
  template_version_id   UUID        REFERENCES document_template_versions(id) ON DELETE SET NULL,
  event_type            VARCHAR(50) NOT NULL,  -- created, updated, version_created, published, archived, unarchived, cloned, deleted
  event_payload_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  performed_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_template_audit_log_template ON document_template_audit_log (template_id);
CREATE INDEX idx_document_template_audit_log_tenant ON document_template_audit_log (tenant_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: WORKFLOW RULES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 15. document_workflow_rules ────────────────────────────────────────────

CREATE TABLE document_workflow_rules (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                        VARCHAR(255) NOT NULL,
  description                 TEXT,
  document_family             VARCHAR(50) NOT NULL,
  matter_type_id              UUID        REFERENCES matter_types(id) ON DELETE SET NULL,
  practice_area               VARCHAR(100),
  jurisdiction_code           VARCHAR(10),
  trigger_type                VARCHAR(50) NOT NULL,  -- matter_created, stage_changed, lead_converted, manual
  trigger_config_json         JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- e.g. { "stage_name": "retained" }
  template_id                 UUID        NOT NULL REFERENCES docgen_templates(id),
  auto_generate               BOOLEAN     NOT NULL DEFAULT false,
  auto_send_for_signature     BOOLEAN     NOT NULL DEFAULT false,
  status                      VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_by                  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_workflow_rules_tenant ON document_workflow_rules (tenant_id);
CREATE INDEX idx_document_workflow_rules_trigger ON document_workflow_rules (tenant_id, trigger_type, is_active);
CREATE INDEX idx_document_workflow_rules_template ON document_workflow_rules (template_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 8: TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── updated_at triggers (mutable tables) ──────────────────────────────────

CREATE TRIGGER trg_docgen_templates_updated_at
  BEFORE UPDATE ON docgen_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_document_clauses_updated_at
  BEFORE UPDATE ON document_clauses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_document_instances_updated_at
  BEFORE UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_document_signature_requests_updated_at
  BEFORE UPDATE ON document_signature_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_document_signers_updated_at
  BEFORE UPDATE ON document_signers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_document_workflow_rules_updated_at
  BEFORE UPDATE ON document_workflow_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── immutability triggers (append-only tables) ────────────────────────────
-- Uses the existing prevent_audit_log_mutation() function from migration 024.

CREATE TRIGGER trg_document_artifacts_immutable
  BEFORE UPDATE OR DELETE ON document_artifacts
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_document_signer_events_immutable
  BEFORE UPDATE OR DELETE ON document_signer_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_document_status_events_immutable
  BEFORE UPDATE OR DELETE ON document_status_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_document_template_audit_log_immutable
  BEFORE UPDATE OR DELETE ON document_template_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Mutable tables: SELECT + INSERT + UPDATE ──────────────────────────────

-- docgen_templates
ALTER TABLE docgen_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_templates_select ON docgen_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_templates_insert ON docgen_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_templates_update ON docgen_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_template_versions
ALTER TABLE document_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_template_versions_select ON document_template_versions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_versions_insert ON document_template_versions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- document_template_mappings
ALTER TABLE document_template_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_template_mappings_select ON document_template_mappings
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_mappings_insert ON document_template_mappings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_mappings_update ON document_template_mappings
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_template_conditions
ALTER TABLE document_template_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_template_conditions_select ON document_template_conditions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_conditions_insert ON document_template_conditions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_conditions_update ON document_template_conditions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_clauses
ALTER TABLE document_clauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_clauses_select ON document_clauses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_clauses_insert ON document_clauses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_clauses_update ON document_clauses
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_clause_assignments
ALTER TABLE document_clause_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_clause_assignments_select ON document_clause_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_clause_assignments_insert ON document_clause_assignments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_clause_assignments_update ON document_clause_assignments
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_instances
ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_instances_select ON document_instances
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_instances_insert ON document_instances
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_instances_update ON document_instances
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_instance_fields
ALTER TABLE document_instance_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_instance_fields_select ON document_instance_fields
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_instance_fields_insert ON document_instance_fields
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- document_signature_requests
ALTER TABLE document_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_signature_requests_select ON document_signature_requests
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_signature_requests_insert ON document_signature_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_signature_requests_update ON document_signature_requests
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_signers
ALTER TABLE document_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_signers_select ON document_signers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_signers_insert ON document_signers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_signers_update ON document_signers
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- document_workflow_rules
ALTER TABLE document_workflow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_workflow_rules_select ON document_workflow_rules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_workflow_rules_insert ON document_workflow_rules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_workflow_rules_update ON document_workflow_rules
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ─── Append-only tables: SELECT + INSERT only ──────────────────────────────

-- document_artifacts
ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_artifacts_select ON document_artifacts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_artifacts_insert ON document_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- document_signer_events
ALTER TABLE document_signer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_signer_events_select ON document_signer_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_signer_events_insert ON document_signer_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- document_status_events
ALTER TABLE document_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_status_events_select ON document_status_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_status_events_insert ON document_status_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- document_template_audit_log
ALTER TABLE document_template_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_template_audit_log_select ON document_template_audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY doc_template_audit_log_insert ON document_template_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 005
-- ═══════════════════════════════════════════════════════════════════════════════
