-- ============================================================================
-- Migration 178: SENTINEL Zero-Trust Outsource Bridge + Vault Hashing
-- ============================================================================
-- Three security layers:
--
-- 1. DYNAMIC FIELD MASKING: Role-based PII masking configuration
--    - Outsourced/freelancer roles see asterisked PII by default
--    - Cannot reveal PII (no reveal button)
--    - Can still fill forms (write-only for PII fields)
--
-- 2. IDENTITY VERIFICATION VAULT: Biometric Handshake infrastructure
--    - identity_verifications table for storing verification tokens
--    - Tracks verification provider, status, and token
--    - Ready for 3D face scan / digital ID provider integration
--
-- 3. DOCUMENT VAULT HASHING: SHA-256 on every document
--    - content_hash column on documents table
--    - Tamper detection function
--    - SENTINEL alert on hash mismatch
-- ============================================================================


-- ── 1. PII Masking Role Configuration ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pii_masking_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id         UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  masking_level   TEXT        NOT NULL DEFAULT 'full'
                  CHECK (masking_level IN ('none', 'partial', 'full', 'write_only')),
  can_reveal      BOOLEAN     NOT NULL DEFAULT false,
  reveal_timeout_seconds INT  NOT NULL DEFAULT 60,
  max_reveals_per_hour   INT  NOT NULL DEFAULT 20,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pii_masking_role UNIQUE (tenant_id, role_id)
);

ALTER TABLE pii_masking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY pii_masking_config_tenant ON pii_masking_config
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Lookup function for PII masking level by user
CREATE OR REPLACE FUNCTION get_user_pii_masking(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role_id UUID;
  _role_name TEXT;
  _config RECORD;
BEGIN
  -- Get the user's role
  SELECT u.role_id, r.name
  INTO _role_id, _role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = p_user_id;

  IF _role_id IS NULL THEN
    RETURN jsonb_build_object(
      'masking_level', 'full',
      'can_reveal', false,
      'role_name', 'unknown'
    );
  END IF;

  -- Admin/super_admin bypass: no masking
  IF _role_name IN ('admin', 'super_admin', 'superadmin') THEN
    RETURN jsonb_build_object(
      'masking_level', 'none',
      'can_reveal', true,
      'reveal_timeout_seconds', 60,
      'max_reveals_per_hour', 999,
      'role_name', _role_name
    );
  END IF;

  -- Check for custom config
  SELECT * INTO _config
  FROM pii_masking_config
  WHERE role_id = _role_id
  LIMIT 1;

  IF _config IS NOT NULL THEN
    RETURN jsonb_build_object(
      'masking_level', _config.masking_level,
      'can_reveal', _config.can_reveal,
      'reveal_timeout_seconds', _config.reveal_timeout_seconds,
      'max_reveals_per_hour', _config.max_reveals_per_hour,
      'role_name', _role_name
    );
  END IF;

  -- Default for Lawyer: partial masking with reveal
  IF _role_name = 'Lawyer' THEN
    RETURN jsonb_build_object(
      'masking_level', 'partial',
      'can_reveal', true,
      'reveal_timeout_seconds', 60,
      'max_reveals_per_hour', 50,
      'role_name', _role_name
    );
  END IF;

  -- Default for Paralegal: partial masking with reveal
  IF _role_name = 'Paralegal' THEN
    RETURN jsonb_build_object(
      'masking_level', 'partial',
      'can_reveal', true,
      'reveal_timeout_seconds', 60,
      'max_reveals_per_hour', 30,
      'role_name', _role_name
    );
  END IF;

  -- Default for Clerk and all others (including freelancers): write-only masking, no reveal
  RETURN jsonb_build_object(
    'masking_level', 'write_only',
    'can_reveal', false,
    'reveal_timeout_seconds', 0,
    'max_reveals_per_hour', 0,
    'role_name', _role_name
  );
END;
$$;


-- ── 2. Identity Verification Vault ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS identity_verifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id          UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  matter_id           UUID        REFERENCES matters(id) ON DELETE SET NULL,

  -- Verification provider & method
  provider            TEXT        NOT NULL DEFAULT 'manual'
                      CHECK (provider IN ('manual', 'onfido', 'jumio', 'veriff', 'id_analyzer')),
  method              TEXT        NOT NULL DEFAULT 'document'
                      CHECK (method IN ('document', 'face_scan', 'biometric', 'liveness', 'manual_review')),

  -- Status tracking
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'verified', 'failed', 'expired')),
  confidence_score    NUMERIC(5,2),  -- 0.00 to 100.00

  -- Verification token (encrypted reference to provider's verification)
  verification_token  TEXT,         -- Provider's verification ID/token
  token_expires_at    TIMESTAMPTZ,

  -- Document details
  document_type       TEXT,         -- 'passport', 'drivers_licence', 'national_id', 'pr_card'
  document_country    TEXT,
  document_number_hash TEXT,        -- SHA-256 hash of document number (not the raw number)

  -- Result metadata
  result_data         JSONB,        -- Provider-specific result (redacted PII)
  failure_reason      TEXT,

  -- Audit
  initiated_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_verifications_tenant ON identity_verifications
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_iv_contact ON identity_verifications(contact_id);
CREATE INDEX IF NOT EXISTS idx_iv_matter ON identity_verifications(matter_id);
CREATE INDEX IF NOT EXISTS idx_iv_status ON identity_verifications(tenant_id, status);


-- ── 3. Document Vault Hashing ────────────────────────────────────────────────

-- Add content hash column to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT,        -- SHA-256 of file content at upload
  ADD COLUMN IF NOT EXISTS hash_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tamper_status TEXT DEFAULT 'unchecked'
    CHECK (tamper_status IS NULL OR tamper_status IN ('unchecked', 'verified', 'tampered', 'missing'));

CREATE INDEX IF NOT EXISTS idx_documents_tamper ON documents(tenant_id, tamper_status)
  WHERE tamper_status = 'tampered';

-- Function to verify a document's hash integrity
CREATE OR REPLACE FUNCTION sentinel_verify_document_hash(
  p_document_id UUID,
  p_current_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _doc RECORD;
  _is_tampered BOOLEAN;
BEGIN
  SELECT id, content_hash, file_name, tenant_id, uploaded_by
  INTO _doc
  FROM documents
  WHERE id = p_document_id;

  IF _doc IS NULL THEN
    RETURN jsonb_build_object('error', 'Document not found');
  END IF;

  IF _doc.content_hash IS NULL THEN
    -- Legacy document without hash  -  mark as unchecked
    RETURN jsonb_build_object(
      'status', 'unchecked',
      'message', 'No content hash recorded for this document (uploaded before hashing was enabled)'
    );
  END IF;

  _is_tampered := _doc.content_hash != p_current_hash;

  -- Update tamper status
  UPDATE documents
  SET tamper_status = CASE WHEN _is_tampered THEN 'tampered' ELSE 'verified' END,
      hash_verified_at = now()
  WHERE id = p_document_id;

  -- If tampered, log to SENTINEL
  IF _is_tampered THEN
    INSERT INTO sentinel_audit_log (
      event_type, severity, tenant_id, user_id,
      table_name, record_id, details
    ) VALUES (
      'DOCUMENT_TAMPER',
      'critical',
      _doc.tenant_id,
      _doc.uploaded_by,
      'documents',
      p_document_id::TEXT,
      jsonb_build_object(
        'file_name', _doc.file_name,
        'expected_hash', LEFT(_doc.content_hash, 16) || '...',
        'actual_hash', LEFT(p_current_hash, 16) || '...',
        'alert', 'TAMPER DETECTED: Document content modified outside NorvaOS'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN _is_tampered THEN 'tampered' ELSE 'verified' END,
    'document_id', p_document_id,
    'expected_hash', LEFT(_doc.content_hash, 8) || '...',
    'actual_hash', LEFT(p_current_hash, 8) || '...',
    'verified_at', now()
  );
END;
$$;
