BEGIN;

-- ═══���════════════════════════════���══════════════════════════════════════════════
-- Migration 208: Conflict-to-Genesis Weld  -  Directive 032
--
-- The "Final Weld": The Genesis Block now REQUIRES a cleared conflict search.
-- No conflict clearance → no birth certificate. Mathematically enforced.
-- ═══════════════════════��═══════════════════════════════════════════════════════


-- ── 1. Add conflict_cleared_at column to matter_genesis_metadata ─────────────

ALTER TABLE matter_genesis_metadata
  ADD COLUMN IF NOT EXISTS conflict_cleared_at TIMESTAMPTZ;

COMMENT ON COLUMN matter_genesis_metadata.conflict_cleared_at IS
  'Directive 032: Timestamp when the conflict search was cleared. Anchored from global_conflict_results.created_at.';


-- ── 2. Refactor fn_generate_matter_genesis_block  -  add p_conflict_search_id ──

-- Drop the old 3-arg signature comment (function will be replaced)
DROP FUNCTION IF EXISTS fn_generate_matter_genesis_block(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION fn_generate_matter_genesis_block(
  p_matter_id            UUID,
  p_tenant_id            UUID,
  p_user_id              UUID,
  p_conflict_search_id   UUID        -- Directive 032: MANDATORY conflict clearance link
)
RETURNS matter_genesis_metadata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _matter               RECORD;
  _conflict_search      RECORD;
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- DIRECTIVE 032: Conflict-to-Genesis Weld  -  MANDATORY verification
  -- ═════════════════���═════════════════════════════════════════════════════

  -- 032.1 Verify the conflict search exists
  SELECT * INTO _conflict_search
    FROM global_conflict_results
   WHERE id = p_conflict_search_id
     AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % not found for tenant %',
      p_conflict_search_id, p_tenant_id;
  END IF;

  -- 032.2 Verify conflict search status is CLEARED
  IF _conflict_search.status != 'clear' THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % has status "%"  -  must be "clear" to seal genesis block',
      p_conflict_search_id, _conflict_search.status;
  END IF;

  -- 032.3 Verify conflict search belongs to the correct client
  IF _contact_id IS NOT NULL AND _conflict_search.source_entity_id != _contact_id THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % belongs to entity % but matter client is %',
      p_conflict_search_id, _conflict_search.source_entity_id, _contact_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- END Directive 032 weld verification
  -- ════════════════════���═══════════════════════════���══════════════════════

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

    -- Use the verified conflict search as the global conflict result
    _global_conflict := _conflict_search;
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

  -- ── 4. Fetch retainer agreement for this matter ──��───────────────────
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
      'search_id',            p_conflict_search_id::TEXT,
      'scan_status',          COALESCE(_conflict_scan.status, 'not_run'),
      'score',                COALESCE(_conflict_scan.score, 0),
      'decision',             COALESCE(_conflict_dec.decision, 'no_decision'),
      'justification',        COALESCE(_conflict_dec.notes, ''),
      'decided_by',           COALESCE(_conflict_dec.decided_by::TEXT, ''),
      'decided_at',           COALESCE(_conflict_dec.decided_at::TEXT, ''),
      'cleared_at',           _conflict_search.created_at::TEXT
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

  -- Pillar 1: Conflict check must be cleared (032: enforced by weld above)
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

  -- ── 10. Link to trust audit chain ─────────��──────────────────────────
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
    conflict_cleared_at,
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
    p_conflict_search_id,
    COALESCE(_conflict_dec.decision, 'no_decision'),
    COALESCE(_conflict_dec.notes, ''),
    COALESCE(_conflict_scan.score, 0),
    _conflict_dec.decided_at,
    _conflict_search.created_at,       -- Directive 032: anchor cleared_at
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
      'conflict_search_id',      p_conflict_search_id::TEXT,
      'conflict_cleared_at',     _conflict_search.created_at::TEXT,
      'kyc_verification_id',     _kyc.id::TEXT,
      'retainer_agreement_id',   _retainer.id::TEXT,
      'retainer_hash',           _retainer_hash,
      'initial_trust_balance',   _initial_trust_bal,
      'last_trust_audit_hash',   _last_audit_hash
    ),
    'Directive 032: Genesis block sealed with conflict-to-genesis weld for matter ' || _matter.matter_number
  );

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION fn_generate_matter_genesis_block(UUID, UUID, UUID, UUID) IS
  'Directive 032: The "Final Weld". Generates an immutable genesis block for a matter. '
  'REQUIRES a cleared conflict search ID (p_conflict_search_id). Verifies: '
  '(1) conflict search exists, (2) status = clear, (3) belongs to the matter''s client. '
  'Stores conflict_cleared_at timestamp. All other 015/015.1 logic preserved.';

COMMIT;
