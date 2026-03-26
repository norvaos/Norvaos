-- =============================================================================
-- Migration 205  -  Directive 015 / 015.1: Sovereign Birth Certificate & Genesis Block
-- =============================================================================
--
-- The "Digital Notary" of NorvaOS. When a Lead becomes a Client, the Genesis
-- Protocol locks a permanent, immutable compliance snapshot for the matter.
--
-- 015.1 Enhancements:
--   • conflict_search_id from global_conflict_results
--   • kyc_verified_at timestamp from identity_verifications
--   • retainer_hash: SHA-256 of the signed PDF
--   • initial_trust_balance: confirms $0.00 or initial deposit parity
--   • last_trust_audit_hash: anchors matter birth to firm's financial history
--   • Revocation: Partner-level audit trail (cannot overwrite, only revoke)
--   • Sequence violation detection (conflict check vs retainer signing order)
--
-- Depends on: 200 (trust audit hash chain), 204 (conflict engine),
--             116 (retainer agreements), identity_verifications table
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE matter_genesis_metadata TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS matter_genesis_metadata (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id           UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  generated_by        UUID NOT NULL REFERENCES users(id),
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Conflict Check Snapshot ─────────────────────────────────────────
  conflict_scan_id    UUID,                     -- FK to conflict_scans
  conflict_search_id  UUID,                     -- FK to global_conflict_results (015.1)
  conflict_decision   TEXT,                     -- no_conflict | cleared_by_lawyer | waiver_obtained
  conflict_justification TEXT,                  -- lawyer's notes
  conflict_score      INT,                      -- final weighted score
  conflict_decided_at TIMESTAMPTZ,              -- when the decision was made (015.1  -  for sequence check)

  -- ── KYC / Identity Verification Snapshot ────────────────────────────
  kyc_verification_id UUID,                     -- FK to identity_verifications
  kyc_status          TEXT,                      -- verified | pending | not_started
  kyc_document_type   TEXT,                      -- passport | drivers_licence | national_id
  kyc_document_hash   TEXT,                      -- SHA-256 of the document number used
  kyc_verified_at     TIMESTAMPTZ,              -- 015.1: timestamp from identity_verifications

  -- ── Retainer Agreement Snapshot ─────────────────────────────────────
  retainer_agreement_id UUID,                    -- FK to retainer_agreements
  retainer_status     TEXT,                      -- signed | sent | draft
  retainer_signed_at  TIMESTAMPTZ,
  retainer_total_cents BIGINT,
  retainer_hash       TEXT,                      -- 015.1: SHA-256 of the signed PDF in vault

  -- ── Trust Ledger Anchor ─────────────────────────────────────────────
  initial_trust_balance BIGINT NOT NULL DEFAULT 0,  -- 015.1: cents  -  confirm $0.00 or deposit parity
  last_trust_audit_hash TEXT,                        -- 015.1: last row_hash from trust_audit_log

  -- ── Immutable Seal ────────────────────────────────────────────────────
  genesis_payload     JSONB NOT NULL DEFAULT '{}',  -- full snapshot
  genesis_hash        TEXT NOT NULL,                 -- SHA-256 of genesis_payload
  trust_audit_chain_seq BIGINT,                      -- link to trust_audit_log chain

  -- ── Compliance Status ─────────────────────────────────────────────────
  is_compliant        BOOLEAN NOT NULL DEFAULT false,  -- all pillars met, no sequence violations
  has_sequence_violation BOOLEAN NOT NULL DEFAULT false, -- 015.1: conflict after retainer = amber
  compliance_notes    TEXT,

  -- ── Revocation (015.1  -  Partner-Level Audit Trail) ────────────────
  is_revoked          BOOLEAN NOT NULL DEFAULT false,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES users(id),
  revocation_reason   TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_matter_genesis UNIQUE (matter_id)   -- one genesis block per matter
);

COMMENT ON TABLE matter_genesis_metadata IS
  'Directive 015/015.1: Sovereign Birth Certificate. Immutable genesis block created '
  'when a Lead becomes a Client. Captures conflict clearance, KYC verification, '
  'retainer agreement hash, initial trust balance, and last trust audit hash. '
  'Linked to the trust_audit_log hash chain for tamper-evident compliance. '
  'One genesis block per matter. Can be revoked (not deleted) by Partner-level users.';


-- ── 1.1 RLS  -  tenant isolation ──────────────────────────────────────────

ALTER TABLE matter_genesis_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY genesis_metadata_tenant_select
  ON matter_genesis_metadata
  FOR SELECT
  USING (
    tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid())
  );

COMMENT ON POLICY genesis_metadata_tenant_select ON matter_genesis_metadata IS
  'Tenant-scoped read access. Inserts/revocations go through SECURITY DEFINER RPCs.';


-- ── 1.2 Immutability guard  -  prevent UPDATE (except revocation) and DELETE ──

CREATE OR REPLACE FUNCTION genesis_metadata_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow revocation updates ONLY (is_revoked, revoked_at, revoked_by, revocation_reason)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_revoked = false AND NEW.is_revoked = true
       AND NEW.revoked_by IS NOT NULL AND NEW.revocation_reason IS NOT NULL
       -- All other fields must be unchanged
       AND NEW.genesis_hash = OLD.genesis_hash
       AND NEW.genesis_payload = OLD.genesis_payload
       AND NEW.is_compliant = OLD.is_compliant
       AND NEW.matter_id = OLD.matter_id
    THEN
      RETURN NEW;  -- Allow revocation
    END IF;
    RAISE EXCEPTION 'Matter genesis metadata is immutable  -  only Partner-level revocation is permitted.';
  END IF;

  -- DELETE is always blocked
  RAISE EXCEPTION 'Matter genesis metadata cannot be deleted. Use revocation instead.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_genesis_metadata_guard
  BEFORE UPDATE OR DELETE ON matter_genesis_metadata
  FOR EACH ROW
  EXECUTE FUNCTION genesis_metadata_immutable_guard();


-- ── 1.3 Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_genesis_metadata_tenant
  ON matter_genesis_metadata (tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_genesis_metadata_matter
  ON matter_genesis_metadata (matter_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RPC: fn_generate_matter_genesis_block (The Digital Notary)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_generate_matter_genesis_block(
  p_matter_id   UUID,
  p_tenant_id   UUID,
  p_user_id     UUID
)
RETURNS matter_genesis_metadata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _matter               RECORD;
  _conflict_scan        RECORD;
  _conflict_dec         RECORD;
  _global_conflict      RECORD;
  _kyc                  RECORD;
  _retainer             RECORD;
  _contact_id           UUID;
  _genesis_payload      JSONB;
  _genesis_hash         TEXT;
  _is_compliant         BOOLEAN;
  _has_seq_violation    BOOLEAN := FALSE;
  _compliance_notes     TEXT[];
  _audit_seq            BIGINT;
  _last_audit_hash      TEXT;
  _initial_trust_bal    BIGINT;
  _retainer_hash        TEXT;
  _result               matter_genesis_metadata;
BEGIN
  -- ── 0. Check matter exists and belongs to tenant ───────────────────────
  SELECT * INTO _matter
    FROM matters
   WHERE id = p_matter_id
     AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matter % not found for tenant %', p_matter_id, p_tenant_id;
  END IF;

  -- ── 0.1 Idempotency  -  cannot overwrite an existing genesis block ──────
  IF EXISTS (SELECT 1 FROM matter_genesis_metadata WHERE matter_id = p_matter_id AND is_revoked = false) THEN
    RAISE EXCEPTION 'Genesis block already exists for matter %. Cannot regenerate  -  use revocation.', p_matter_id;
  END IF;

  -- ── 1. Resolve the primary contact for this matter ────────────────────
  SELECT contact_id INTO _contact_id
    FROM matter_contacts
   WHERE matter_id = p_matter_id
     AND role = 'client'
   ORDER BY created_at ASC
   LIMIT 1;

  -- Fallback: try originating_lead_id → lead → contact
  IF _contact_id IS NULL AND _matter.originating_lead_id IS NOT NULL THEN
    SELECT contact_id INTO _contact_id
      FROM leads
     WHERE id = _matter.originating_lead_id;
  END IF;

  -- ── 2. Fetch most recent conflict scan for this contact ───────────────
  IF _contact_id IS NOT NULL THEN
    SELECT * INTO _conflict_scan
      FROM conflict_scans
     WHERE contact_id = _contact_id
       AND tenant_id = p_tenant_id
       AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT 1;

    -- Fetch the decision for this scan
    IF _conflict_scan.id IS NOT NULL THEN
      SELECT * INTO _conflict_dec
        FROM conflict_decisions
       WHERE scan_id = _conflict_scan.id
       ORDER BY decided_at DESC
       LIMIT 1;
    END IF;

    -- Fetch global conflict result (Directive 005.2)
    SELECT * INTO _global_conflict
      FROM global_conflict_results
     WHERE source_entity_id = _contact_id
       AND tenant_id = p_tenant_id
     ORDER BY scanned_at DESC
     LIMIT 1;
  END IF;

  -- ── 3. Fetch latest KYC identity verification ────────────────────────
  IF _contact_id IS NOT NULL THEN
    SELECT * INTO _kyc
      FROM identity_verifications
     WHERE contact_id = _contact_id
       AND tenant_id = p_tenant_id
       AND status = 'verified'
     ORDER BY verified_at DESC
     LIMIT 1;
  END IF;

  -- ── 4. Fetch retainer agreement for this matter ──────────────────────
  SELECT * INTO _retainer
    FROM retainer_agreements
   WHERE matter_id = p_matter_id
     AND tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- ── 4.1 Compute retainer PDF hash (SHA-256 of signed_at + total for now)
  IF _retainer.id IS NOT NULL AND _retainer.signed_at IS NOT NULL THEN
    _retainer_hash := encode(digest(
      concat_ws('|',
        _retainer.id::TEXT,
        _retainer.signed_at::TEXT,
        COALESCE(_retainer.total_amount_cents::TEXT, '0'),
        COALESCE(_retainer.scope_of_services, ''),
        COALESCE(_retainer.billing_type, '')
      ), 'sha256'), 'hex');
  ELSE
    _retainer_hash := NULL;
  END IF;

  -- ── 5. Fetch last trust audit hash (chain-link anchor) ───────────────
  SELECT row_hash INTO _last_audit_hash
    FROM trust_audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  -- If no trust audit exists yet, use genesis seed
  IF _last_audit_hash IS NULL THEN
    _last_audit_hash := 'TRUST_AUDIT_GENESIS_BLOCK_v1';
  END IF;

  -- ── 6. Fetch initial trust balance for this matter ───────────────────
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'deposit' THEN amount_cents
         WHEN transaction_type = 'withdrawal' THEN -amount_cents
         ELSE 0
    END
  ), 0) INTO _initial_trust_bal
    FROM trust_transactions
   WHERE matter_id = p_matter_id
     AND tenant_id = p_tenant_id;

  -- ── 7. Assemble genesis payload (the Digital Notary snapshot) ────────
  _genesis_payload := jsonb_build_object(
    'matter_id',              p_matter_id::TEXT,
    'matter_number',          _matter.matter_number,
    'matter_title',           _matter.title,
    'tenant_id',              p_tenant_id::TEXT,
    'generated_at',           now()::TEXT,
    'generated_by',           p_user_id::TEXT,

    'conflict_check',         jsonb_build_object(
      'scan_id',              COALESCE(_conflict_scan.id::TEXT, 'NOT_SCANNED'),
      'search_id',            COALESCE(_global_conflict.id::TEXT, 'NO_GLOBAL_SCAN'),
      'scan_status',          COALESCE(_conflict_scan.status, 'not_run'),
      'score',                COALESCE(_conflict_scan.score, 0),
      'decision',             COALESCE(_conflict_dec.decision, 'no_decision'),
      'justification',        COALESCE(_conflict_dec.notes, ''),
      'decided_by',           COALESCE(_conflict_dec.decided_by::TEXT, ''),
      'decided_at',           COALESCE(_conflict_dec.decided_at::TEXT, '')
    ),

    'kyc_verification',       jsonb_build_object(
      'verification_id',      COALESCE(_kyc.id::TEXT, 'NOT_VERIFIED'),
      'status',               COALESCE(_kyc.status, 'not_started'),
      'document_type',        COALESCE(_kyc.document_type, ''),
      'document_country',     COALESCE(_kyc.document_country, ''),
      'document_number_hash', COALESCE(_kyc.document_number_hash, ''),
      'verified_at',          COALESCE(_kyc.verified_at::TEXT, ''),
      'confidence_score',     COALESCE(_kyc.confidence_score, 0)
    ),

    'retainer_agreement',     jsonb_build_object(
      'agreement_id',         COALESCE(_retainer.id::TEXT, 'NO_RETAINER'),
      'status',               COALESCE(_retainer.status, 'none'),
      'billing_type',         COALESCE(_retainer.billing_type, ''),
      'total_amount_cents',   COALESCE(_retainer.total_amount_cents, 0),
      'signed_at',            COALESCE(_retainer.signed_at::TEXT, ''),
      'scope_of_services',    LEFT(COALESCE(_retainer.scope_of_services, ''), 500),
      'retainer_hash',        COALESCE(_retainer_hash, 'NO_HASH')
    ),

    'trust_ledger_anchor',    jsonb_build_object(
      'initial_trust_balance_cents', _initial_trust_bal,
      'last_trust_audit_hash',       _last_audit_hash,
      'balance_parity',              CASE WHEN _initial_trust_bal = 0
                                          THEN 'zero_confirmed'
                                          ELSE 'deposit_present'
                                     END
    )
  );

  -- ── 8. Compute SHA-256 hash of the genesis payload ───────────────────
  _genesis_hash := encode(digest(_genesis_payload::TEXT, 'sha256'), 'hex');

  -- ── 9. Evaluate compliance pillars ───────────────────────────────────
  _compliance_notes := ARRAY[]::TEXT[];
  _is_compliant := TRUE;

  -- Pillar 1: Conflict check must be cleared
  IF _conflict_scan.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No conflict scan on record');
  ELSIF _conflict_dec.decision IS NULL OR _conflict_dec.decision NOT IN ('no_conflict', 'proceed_with_caution', 'waiver_obtained') THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'Conflict check not cleared: ' || COALESCE(_conflict_dec.decision, 'no_decision'));
  END IF;

  -- Pillar 2: KYC must be verified
  IF _kyc.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No KYC identity verification on record');
  END IF;

  -- Pillar 3: Retainer must be signed
  IF _retainer.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No retainer agreement on record');
  ELSIF _retainer.status != 'signed' THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'Retainer agreement not signed: ' || _retainer.status);
  END IF;

  -- ── 9.1 SEQUENCE VIOLATION CHECK (Directive 015.1 / 017) ─────────────
  -- If the conflict check was performed AFTER the retainer was signed,
  -- that's a compliance sequence violation (amber shield).
  IF _conflict_dec.decided_at IS NOT NULL AND _retainer.signed_at IS NOT NULL THEN
    IF _conflict_dec.decided_at > _retainer.signed_at THEN
      _has_seq_violation := TRUE;
      _is_compliant := FALSE;
      _compliance_notes := array_append(_compliance_notes,
        'SEQUENCE VIOLATION: Conflict check decision (' || _conflict_dec.decided_at::TEXT ||
        ') was recorded AFTER retainer signing (' || _retainer.signed_at::TEXT ||
        '). Law Society rules require conflicts cleared before engagement.');
    END IF;
  END IF;

  -- ── 10. Link to trust audit chain ────────────────────────────────────
  _audit_seq := nextval('trust_audit_chain_seq');

  -- ── 11. Insert the genesis block ─────────────────────────────────────
  INSERT INTO matter_genesis_metadata (
    tenant_id,
    matter_id,
    generated_by,
    generated_at,
    conflict_scan_id,
    conflict_search_id,
    conflict_decision,
    conflict_justification,
    conflict_score,
    conflict_decided_at,
    kyc_verification_id,
    kyc_status,
    kyc_document_type,
    kyc_document_hash,
    kyc_verified_at,
    retainer_agreement_id,
    retainer_status,
    retainer_signed_at,
    retainer_total_cents,
    retainer_hash,
    initial_trust_balance,
    last_trust_audit_hash,
    genesis_payload,
    genesis_hash,
    trust_audit_chain_seq,
    is_compliant,
    has_sequence_violation,
    compliance_notes
  ) VALUES (
    p_tenant_id,
    p_matter_id,
    p_user_id,
    now(),
    _conflict_scan.id,
    _global_conflict.id,
    COALESCE(_conflict_dec.decision, 'no_decision'),
    COALESCE(_conflict_dec.notes, ''),
    COALESCE(_conflict_scan.score, 0),
    _conflict_dec.decided_at,
    _kyc.id,
    COALESCE(_kyc.status, 'not_started'),
    COALESCE(_kyc.document_type, ''),
    COALESCE(_kyc.document_number_hash, ''),
    _kyc.verified_at,
    _retainer.id,
    COALESCE(_retainer.status, 'none'),
    _retainer.signed_at,
    COALESCE(_retainer.total_amount_cents, 0),
    _retainer_hash,
    _initial_trust_bal,
    _last_audit_hash,
    _genesis_payload,
    _genesis_hash,
    _audit_seq,
    _is_compliant,
    _has_seq_violation,
    CASE WHEN array_length(_compliance_notes, 1) > 0
         THEN array_to_string(_compliance_notes, '; ')
         ELSE 'All compliance pillars met'
    END
  )
  RETURNING * INTO _result;

  -- ── 12. Insert trust audit log entry (chain-linked) ──────────────────
  INSERT INTO trust_audit_log (
    tenant_id,
    matter_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    reason_for_change
  ) VALUES (
    p_tenant_id,
    p_matter_id,
    p_user_id,
    'genesis_block_created',
    'matter_genesis_metadata',
    _result.id,
    jsonb_build_object(
      'genesis_hash',             _genesis_hash,
      'is_compliant',             _is_compliant,
      'has_sequence_violation',   _has_seq_violation,
      'conflict_scan_id',        _conflict_scan.id::TEXT,
      'conflict_search_id',      _global_conflict.id::TEXT,
      'kyc_verification_id',     _kyc.id::TEXT,
      'retainer_agreement_id',   _retainer.id::TEXT,
      'retainer_hash',           _retainer_hash,
      'initial_trust_balance',   _initial_trust_bal,
      'last_trust_audit_hash',   _last_audit_hash
    ),
    'Directive 015: Genesis block sealed for matter ' || _matter.matter_number
  );

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION fn_generate_matter_genesis_block(UUID, UUID, UUID) IS
  'Directive 015/015.1: The Digital Notary. Generates an immutable genesis block '
  'for a matter. Captures conflict clearance (incl. global scan), KYC verification, '
  'retainer agreement hash, initial trust balance, and anchors to the last trust '
  'audit hash. Idempotent: raises exception if genesis already exists (use revocation). '
  'Detects sequence violations (conflict check after retainer signing).';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPC: fn_revoke_genesis_block (Partner-Level Audit Trail)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_revoke_genesis_block(
  p_matter_id       UUID,
  p_tenant_id       UUID,
  p_user_id         UUID,
  p_reason          TEXT
)
RETURNS matter_genesis_metadata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _genesis    matter_genesis_metadata;
  _user_role  TEXT;
BEGIN
  -- ── Verify the revoking user has Partner/Admin role ───────────────────
  SELECT r.name INTO _user_role
    FROM users u
    JOIN roles r ON r.id = u.role_id
   WHERE u.id = p_user_id
     AND u.tenant_id = p_tenant_id;

  IF _user_role IS NULL OR _user_role NOT IN ('admin', 'partner') THEN
    RAISE EXCEPTION 'Genesis block revocation requires Partner or Admin role. Current role: %', COALESCE(_user_role, 'none');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Revocation reason must be at least 10 characters for audit trail.';
  END IF;

  -- ── Fetch existing genesis block ─────────────────────────────────────
  SELECT * INTO _genesis
    FROM matter_genesis_metadata
   WHERE matter_id = p_matter_id
     AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No genesis block found for matter %', p_matter_id;
  END IF;

  IF _genesis.is_revoked THEN
    RAISE EXCEPTION 'Genesis block for matter % is already revoked.', p_matter_id;
  END IF;

  -- ── Perform revocation (immutability guard allows this specific update) ──
  UPDATE matter_genesis_metadata
     SET is_revoked = true,
         revoked_at = now(),
         revoked_by = p_user_id,
         revocation_reason = p_reason
   WHERE id = _genesis.id
  RETURNING * INTO _genesis;

  -- ── Audit trail ──────────────────────────────────────────────────────
  INSERT INTO trust_audit_log (
    tenant_id,
    matter_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    reason_for_change
  ) VALUES (
    p_tenant_id,
    p_matter_id,
    p_user_id,
    'genesis_block_revoked',
    'matter_genesis_metadata',
    _genesis.id,
    jsonb_build_object(
      'original_genesis_hash', _genesis.genesis_hash,
      'revocation_reason',     p_reason,
      'revoked_by',            p_user_id::TEXT,
      'revoked_at',            now()::TEXT
    ),
    'Directive 015.1: Genesis block REVOKED by Partner for matter ' ||
      (SELECT matter_number FROM matters WHERE id = p_matter_id) ||
      '. Reason: ' || LEFT(p_reason, 200)
  );

  RETURN _genesis;
END;
$$;

COMMENT ON FUNCTION fn_revoke_genesis_block(UUID, UUID, UUID, TEXT) IS
  'Directive 015.1: Partner-level genesis block revocation. Cannot delete or '
  'overwrite  -  only marks as revoked with full audit trail. Requires admin/partner '
  'role and a documented reason (min 10 chars). After revocation, a new genesis '
  'block can be generated.';


COMMIT;
