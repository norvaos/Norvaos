-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 006  -  E-Sign Subsystem
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Three tables:
--   1. signing_documents   -  Immutable document snapshots (INSERT-ONLY)
--   2. signing_requests    -  Signing workflow with state machine
--   3. signing_events      -  Append-only audit ledger
--
-- Design principles:
--   - Document-oriented: signing_documents is type-agnostic (retainer, engagement, etc.)
--   - Immutable snapshots: source PDFs frozen at send time with SHA-256 hash
--   - Token security: only SHA-256 hash of token stored, never the raw token
--   - Append-only audit: signing_events cannot be updated or deleted (trigger-enforced)
--   - Structural independence: signing state ≠ payment state ≠ matter state
--   - One active request per document (partial unique index)
--

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. signing_documents  -  Immutable Document Snapshots
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE signing_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  document_type      VARCHAR(50) NOT NULL,
  source_entity_type VARCHAR(50) NOT NULL,
  source_entity_id   UUID NOT NULL,
  matter_id          UUID NOT NULL REFERENCES matters(id),
  contact_id         UUID REFERENCES contacts(id),
  title              VARCHAR(255) NOT NULL,
  storage_path       TEXT NOT NULL,
  checksum_sha256    VARCHAR(64) NOT NULL,
  file_size_bytes    BIGINT NOT NULL,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signing_documents_tenant ON signing_documents (tenant_id);
CREATE INDEX idx_signing_documents_matter ON signing_documents (matter_id);
CREATE INDEX idx_signing_documents_source ON signing_documents (source_entity_type, source_entity_id);

COMMENT ON TABLE signing_documents IS 'Immutable document snapshots for electronic signing. INSERT-ONLY  -  no updates or deletes.';
COMMENT ON COLUMN signing_documents.document_type IS 'retainer_agreement, engagement_letter, disengagement_letter, authorization, acknowledgement, general';
COMMENT ON COLUMN signing_documents.source_entity_type IS 'Origin record type: invoice, document_instance, etc.';
COMMENT ON COLUMN signing_documents.source_entity_id IS 'FK to the source record (invoice.id, document_instance.id, etc.)';
COMMENT ON COLUMN signing_documents.storage_path IS 'Supabase storage path to frozen PDF: {tenantId}/signing/source/{id}.pdf';
COMMENT ON COLUMN signing_documents.checksum_sha256 IS 'SHA-256 hex digest of the frozen PDF bytes (64 chars)';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. signing_requests  -  Signing Workflow
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE signing_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  signing_document_id   UUID NOT NULL REFERENCES signing_documents(id),
  matter_id             UUID NOT NULL REFERENCES matters(id),

  -- Token: stored as SHA-256 hash of the raw bearer token. Raw token never persisted.
  token_hash            VARCHAR(64) NOT NULL UNIQUE,

  -- Request lifecycle status
  status                VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'sent', 'viewed', 'signed',
      'declined', 'expired', 'cancelled', 'superseded'
    )),

  -- Signer identity: denormalized snapshots (immutable after creation)
  signer_name           VARCHAR(255) NOT NULL,
  signer_email          VARCHAR(255) NOT NULL,
  signer_contact_id     UUID REFERENCES contacts(id),

  -- Lifecycle timestamps
  sent_at               TIMESTAMPTZ,
  viewed_at             TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ NOT NULL,

  -- Decline
  decline_reason        TEXT,

  -- Signature capture (populated at sign time)
  signature_mode        VARCHAR(20) CHECK (signature_mode IN ('drawn', 'typed')),
  signature_typed_name  VARCHAR(255),
  signature_data_path   TEXT,

  -- Signed artifact (populated at sign time)
  signed_document_path  TEXT,
  signed_document_hash  VARCHAR(64),

  -- Consent record (populated at sign time)
  consent_text          TEXT,

  -- Signer forensics (captured at sign time)
  signer_ip             VARCHAR(45),
  signer_user_agent     TEXT,

  -- Reminders
  reminder_count        INT NOT NULL DEFAULT 0,
  last_reminder_at      TIMESTAMPTZ,

  -- Supersession
  superseded_by         UUID REFERENCES signing_requests(id),

  -- Provenance
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active (non-terminal) request per document.
-- Terminal states: signed, declined, expired, cancelled, superseded.
CREATE UNIQUE INDEX idx_signing_requests_active_per_doc
  ON signing_requests (signing_document_id)
  WHERE status NOT IN ('signed', 'declined', 'expired', 'cancelled', 'superseded');

CREATE INDEX idx_signing_requests_tenant ON signing_requests (tenant_id);
CREATE INDEX idx_signing_requests_matter ON signing_requests (matter_id);
CREATE INDEX idx_signing_requests_document ON signing_requests (signing_document_id);
CREATE INDEX idx_signing_requests_status ON signing_requests (status) WHERE status NOT IN ('signed', 'declined', 'expired', 'cancelled', 'superseded');

COMMENT ON TABLE signing_requests IS 'Signing workflow requests with enforced state machine. One active request per document.';
COMMENT ON COLUMN signing_requests.token_hash IS 'SHA-256 hash of the raw bearer token. Raw token is never stored.';
COMMENT ON COLUMN signing_requests.signature_data_path IS 'Supabase storage path to signature image PNG';
COMMENT ON COLUMN signing_requests.signed_document_path IS 'Supabase storage path to signed PDF with signature overlay';
COMMENT ON COLUMN signing_requests.signed_document_hash IS 'SHA-256 hex digest of the signed PDF';
COMMENT ON COLUMN signing_requests.consent_text IS 'Exact consent text shown to signer at signing time';
COMMENT ON COLUMN signing_requests.superseded_by IS 'Points to the new signing_request that replaced this one';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. signing_events  -  Append-Only Audit Ledger
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE signing_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  signing_request_id    UUID NOT NULL REFERENCES signing_requests(id),

  event_type            VARCHAR(30) NOT NULL
    CHECK (event_type IN (
      'created', 'sent', 'viewed', 'signed', 'declined',
      'expired', 'cancelled', 'superseded',
      'reminder_sent', 'resent'
    )),

  from_status           VARCHAR(30),
  to_status             VARCHAR(30),

  -- Actor identification
  actor_type            VARCHAR(20) NOT NULL
    CHECK (actor_type IN ('system', 'lawyer', 'signer')),
  actor_id              UUID,

  -- Forensics
  ip_address            VARCHAR(45),
  user_agent            TEXT,

  -- Document integrity (populated on viewed + signed events)
  source_document_hash  VARCHAR(64),
  signed_document_hash  VARCHAR(64),

  -- Consent & signature capture (populated on signed event)
  consent_text          TEXT,
  signature_mode        VARCHAR(20),
  typed_name            VARCHAR(255),

  -- Email delivery (populated on sent/reminder_sent events)
  email_message_id      VARCHAR(255),

  -- Extensible context
  metadata              JSONB DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signing_events_request ON signing_events (signing_request_id);
CREATE INDEX idx_signing_events_tenant ON signing_events (tenant_id);
CREATE INDEX idx_signing_events_type ON signing_events (event_type);

COMMENT ON TABLE signing_events IS 'Append-only audit ledger for signing requests. No updates or deletes permitted.';
COMMENT ON COLUMN signing_events.actor_type IS 'system = automated action, lawyer = staff user, signer = public client';
COMMENT ON COLUMN signing_events.source_document_hash IS 'SHA-256 of source PDF shown to signer (on viewed/signed events)';
COMMENT ON COLUMN signing_events.signed_document_hash IS 'SHA-256 of signed PDF produced (on signed event only)';
COMMENT ON COLUMN signing_events.email_message_id IS 'Resend message ID for email delivery tracking';


-- ═══════════════════════════════════════════════════════════════════════════════
-- IMMUTABILITY TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Uses the existing prevent_audit_log_mutation() function from earlier migrations.

-- signing_documents: INSERT-ONLY (no updates, no deletes)
CREATE TRIGGER trg_signing_documents_immutable
  BEFORE UPDATE OR DELETE ON signing_documents
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- signing_events: INSERT-ONLY (no updates, no deletes)
CREATE TRIGGER trg_signing_events_immutable
  BEFORE UPDATE OR DELETE ON signing_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();


-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- signing_documents
ALTER TABLE signing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_docs_select ON signing_documents
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY signing_docs_insert ON signing_documents
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- signing_requests
ALTER TABLE signing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_req_select ON signing_requests
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY signing_req_insert ON signing_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY signing_req_update ON signing_requests
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- signing_events
ALTER TABLE signing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_events_select ON signing_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY signing_events_insert ON signing_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 006
-- ═══════════════════════════════════════════════════════════════════════════════
