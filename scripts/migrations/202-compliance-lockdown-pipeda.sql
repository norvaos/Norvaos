-- ============================================================================
-- Migration 202  -  PIPEDA Data Sovereignty Enforcer (Directive 004, Pillar 3)
-- ============================================================================
-- Establishes the compliance infrastructure for PIPEDA data sovereignty:
--   1. data_sovereignty_log        -  append-only geolocation access log
--   2. pii_access_registry         -  registry of PII columns for runtime enforcement
--   3. Seed data for pii_access_registry (contacts, leads, trust_bank_accounts)
--   4. v_pii_encryption_status     -  encryption coverage dashboard view
--   5. pii_decryption_log          -  append-only decryption audit trail
--   6. norva_decrypt_audited()     -  audited wrapper around norva_decrypt
--
-- DEPENDENCIES: pgcrypto, norva_encrypt/norva_decrypt (migration 197),
--               contacts/leads encrypted columns (197), trust_bank_accounts (100)
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. data_sovereignty_log  -  append-only log of all data access with geolocation
-- ===========================================================================

CREATE TABLE IF NOT EXISTS data_sovereignty_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES tenants(id),
  user_id         UUID        REFERENCES users(id),
  auth_user_id    UUID,
  request_path    TEXT        NOT NULL,
  request_method  TEXT        NOT NULL,
  source_ip       TEXT,
  source_region   TEXT,
  source_country  TEXT,
  is_canadian     BOOLEAN     NOT NULL DEFAULT true,
  was_blocked     BOOLEAN     NOT NULL DEFAULT false,
  block_reason    TEXT,
  pii_accessed    BOOLEAN     NOT NULL DEFAULT false,
  tables_accessed TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE data_sovereignty_log
  IS 'PIPEDA Pillar 3: append-only audit log of every data access request with geolocation and PII tracking. No UPDATE or DELETE permitted.';

COMMENT ON COLUMN data_sovereignty_log.source_region   IS 'Province/state resolved from source_ip at request time.';
COMMENT ON COLUMN data_sovereignty_log.source_country  IS 'ISO country code resolved from source_ip at request time.';
COMMENT ON COLUMN data_sovereignty_log.is_canadian     IS 'Whether the request originated from a Canadian IP address.';
COMMENT ON COLUMN data_sovereignty_log.was_blocked     IS 'Whether the request was blocked by the sovereignty enforcer.';
COMMENT ON COLUMN data_sovereignty_log.block_reason    IS 'Human-readable reason if the request was blocked (e.g. non-Canadian PII access).';
COMMENT ON COLUMN data_sovereignty_log.tables_accessed IS 'Array of PII-bearing table names accessed during this request.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sovereignty_log_tenant_created
  ON data_sovereignty_log (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sovereignty_log_is_canadian
  ON data_sovereignty_log (is_canadian);

CREATE INDEX IF NOT EXISTS idx_sovereignty_log_was_blocked
  ON data_sovereignty_log (was_blocked);

-- RLS: admin SELECT only
ALTER TABLE data_sovereignty_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_sovereignty_log_admin_select
  ON data_sovereignty_log
  FOR SELECT
  USING (
    tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.auth_user_id = auth.uid()
        AND u2.role = 'admin'
    )
  );

-- Service role can INSERT (middleware writes via service key)
CREATE POLICY data_sovereignty_log_service_insert
  ON data_sovereignty_log
  FOR INSERT
  WITH CHECK (true);

-- Immutability trigger: prevent UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_sovereignty_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'data_sovereignty_log is append-only. UPDATE and DELETE are prohibited under PIPEDA compliance.';
END;
$$;

COMMENT ON FUNCTION prevent_sovereignty_log_mutation()
  IS 'PIPEDA enforcer: blocks any UPDATE or DELETE on data_sovereignty_log to guarantee audit immutability.';

DROP TRIGGER IF EXISTS trg_sovereignty_log_immutable_update ON data_sovereignty_log;
CREATE TRIGGER trg_sovereignty_log_immutable_update
  BEFORE UPDATE ON data_sovereignty_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sovereignty_log_mutation();

DROP TRIGGER IF EXISTS trg_sovereignty_log_immutable_delete ON data_sovereignty_log;
CREATE TRIGGER trg_sovereignty_log_immutable_delete
  BEFORE DELETE ON data_sovereignty_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sovereignty_log_mutation();


-- ===========================================================================
-- 2. pii_access_registry  -  tracks which columns contain PII
-- ===========================================================================

CREATE TABLE IF NOT EXISTS pii_access_registry (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name               TEXT    NOT NULL,
  column_name              TEXT    NOT NULL,
  pii_category             TEXT    NOT NULL CHECK (pii_category IN (
                                     'name', 'email', 'phone', 'address',
                                     'date_of_birth', 'passport', 'sin',
                                     'financial', 'biometric', 'other'
                                   )),
  encryption_status        TEXT    NOT NULL DEFAULT 'plaintext' CHECK (encryption_status IN (
                                     'plaintext', 'dual_write', 'encrypted_only'
                                   )),
  requires_canadian_region BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (table_name, column_name)
);

COMMENT ON TABLE pii_access_registry
  IS 'PIPEDA Pillar 3: registry of all PII-bearing columns across the schema. Used by middleware for runtime sovereignty enforcement.';

COMMENT ON COLUMN pii_access_registry.pii_category             IS 'Classification of the PII type (name, email, phone, address, date_of_birth, passport, sin, financial, biometric, other).';
COMMENT ON COLUMN pii_access_registry.encryption_status        IS 'Current encryption phase: plaintext (unencrypted), dual_write (both columns active), encrypted_only (plaintext dropped).';
COMMENT ON COLUMN pii_access_registry.requires_canadian_region IS 'Whether access to this column requires the request to originate from a Canadian IP.';


-- ===========================================================================
-- 3. Seed pii_access_registry with known PII columns
-- ===========================================================================

-- contacts  -  columns with _encrypted counterparts are dual_write
INSERT INTO pii_access_registry (table_name, column_name, pii_category, encryption_status) VALUES
  ('contacts', 'first_name',      'name',          'dual_write'),
  ('contacts', 'last_name',       'name',          'dual_write'),
  ('contacts', 'email',           'email',         'dual_write'),
  ('contacts', 'phone',           'phone',         'dual_write'),
  ('contacts', 'address',         'address',       'dual_write'),
  ('contacts', 'date_of_birth',   'date_of_birth', 'dual_write'),
  ('contacts', 'passport_number', 'passport',      'dual_write')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- leads  -  columns with _encrypted counterparts are dual_write
INSERT INTO pii_access_registry (table_name, column_name, pii_category, encryption_status) VALUES
  ('leads', 'first_name', 'name',  'dual_write'),
  ('leads', 'last_name',  'name',  'dual_write'),
  ('leads', 'email',      'email', 'dual_write'),
  ('leads', 'phone',      'phone', 'dual_write')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- trust_bank_accounts  -  account_number_encrypted is stored encrypted at rest
INSERT INTO pii_access_registry (table_name, column_name, pii_category, encryption_status) VALUES
  ('trust_bank_accounts', 'account_number_encrypted', 'financial', 'encrypted_only')
ON CONFLICT (table_name, column_name) DO NOTHING;


-- ===========================================================================
-- 4. v_pii_encryption_status  -  encryption coverage dashboard view
-- ===========================================================================

CREATE OR REPLACE VIEW v_pii_encryption_status AS
SELECT
  r.table_name,
  r.column_name,
  r.pii_category,
  r.encryption_status,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = r.table_name
      AND c.column_name  = r.column_name || '_encrypted'
  ) AS has_encrypted_counterpart
FROM pii_access_registry r
JOIN information_schema.columns isc
  ON isc.table_schema = 'public'
 AND isc.table_name   = r.table_name
 AND isc.column_name  = r.column_name
ORDER BY r.table_name, r.column_name;

COMMENT ON VIEW v_pii_encryption_status
  IS 'PIPEDA Pillar 3: shows encryption coverage for every registered PII column. Joins pii_access_registry with information_schema to verify column existence and encrypted counterpart presence.';


-- ===========================================================================
-- 5. pii_decryption_log  -  append-only decryption audit trail
-- ===========================================================================

CREATE TABLE IF NOT EXISTS pii_decryption_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessor_context TEXT        NOT NULL,
  table_hint       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pii_decryption_log
  IS 'PIPEDA Pillar 3: append-only log of every norva_decrypt invocation via the audited wrapper. No UPDATE or DELETE permitted.';

COMMENT ON COLUMN pii_decryption_log.accessor_context IS 'Identifier of who/what triggered decryption (e.g. user email, API route, background job name).';
COMMENT ON COLUMN pii_decryption_log.table_hint       IS 'Optional hint indicating which table the decrypted data came from.';

-- Immutability trigger: prevent UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_decryption_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'pii_decryption_log is append-only. UPDATE and DELETE are prohibited under PIPEDA compliance.';
END;
$$;

COMMENT ON FUNCTION prevent_decryption_log_mutation()
  IS 'PIPEDA enforcer: blocks any UPDATE or DELETE on pii_decryption_log to guarantee audit immutability.';

DROP TRIGGER IF EXISTS trg_decryption_log_immutable_update ON pii_decryption_log;
CREATE TRIGGER trg_decryption_log_immutable_update
  BEFORE UPDATE ON pii_decryption_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_decryption_log_mutation();

DROP TRIGGER IF EXISTS trg_decryption_log_immutable_delete ON pii_decryption_log;
CREATE TRIGGER trg_decryption_log_immutable_delete
  BEFORE DELETE ON pii_decryption_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_decryption_log_mutation();


-- ===========================================================================
-- 6. norva_decrypt_audited  -  audited wrapper around norva_decrypt
-- ===========================================================================

CREATE OR REPLACE FUNCTION norva_decrypt_audited(
  ciphertext       BYTEA,
  key              TEXT,
  accessor_context TEXT DEFAULT 'unknown'
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Perform the actual decryption
  v_result := norva_decrypt(ciphertext, key);

  -- Log the decryption event (fire-and-forget  -  never block the caller)
  INSERT INTO pii_decryption_log (accessor_context, table_hint)
  VALUES (accessor_context, NULL);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION norva_decrypt_audited(BYTEA, TEXT, TEXT)
  IS 'Norva Vault: audited decryption wrapper. Calls norva_decrypt and inserts an append-only record into pii_decryption_log for PIPEDA compliance.';


COMMIT;
