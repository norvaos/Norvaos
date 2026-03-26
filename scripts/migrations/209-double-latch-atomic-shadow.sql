BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 209: Double-Latch Genesis Weld + Atomic Shadow Engine
-- Session B: Performance & Execution  -  Mathematical Finality
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. Double-Latch: Add identity_latch_hash to matter_genesis_metadata ─────

ALTER TABLE matter_genesis_metadata
  ADD COLUMN IF NOT EXISTS identity_latch_hash TEXT;

COMMENT ON COLUMN matter_genesis_metadata.identity_latch_hash IS
  'Session B Double-Latch: SHA-256 of client identity snapshot at microsecond of genesis birth. '
  'Compared against conflict search inputs to detect any drift between scan and seal.';


-- ─── 2. Enhance fn_generate_matter_genesis_block with Double-Latch ───────────

-- Drop old 4-arg signature (Directive 032)  -  replaced with Double-Latch version
DROP FUNCTION IF EXISTS fn_generate_matter_genesis_block(UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION fn_generate_matter_genesis_block(
  p_matter_id            UUID,
  p_tenant_id            UUID,
  p_user_id              UUID,
  p_conflict_search_id   UUID
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
  _contact              RECORD;
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
  _identity_snapshot    TEXT;
  _identity_latch_hash  TEXT;
  _search_identity_hash TEXT;
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

  IF _contact_id IS NULL AND _matter.originating_lead_id IS NOT NULL THEN
    SELECT contact_id INTO _contact_id
      FROM leads
     WHERE id = _matter.originating_lead_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DIRECTIVE 032: Conflict-to-Genesis Weld  -  MANDATORY verification
  -- ═══════════════════════════════════════════════════════════════════════

  SELECT * INTO _conflict_search
    FROM global_conflict_results
   WHERE id = p_conflict_search_id
     AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % not found for tenant %',
      p_conflict_search_id, p_tenant_id;
  END IF;

  IF _conflict_search.status != 'clear' THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % has status "%"  -  must be "clear"',
      p_conflict_search_id, _conflict_search.status;
  END IF;

  IF _contact_id IS NOT NULL AND _conflict_search.source_entity_id != _contact_id THEN
    RAISE EXCEPTION 'WELD FAILURE: Conflict search % belongs to entity % but matter client is %',
      p_conflict_search_id, _conflict_search.source_entity_id, _contact_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SESSION B: DOUBLE-LATCH  -  Microsecond identity verification
  -- Latch 1: Conflict search verified (above)
  -- Latch 2: Current client data hash must match search input hash
  -- ═══════════════════════════════════════════════════════════════════════

  IF _contact_id IS NOT NULL THEN
    SELECT * INTO _contact FROM contacts WHERE id = _contact_id;

    -- Build identity snapshot from CURRENT client data at this microsecond
    _identity_snapshot := concat_ws('|',
      COALESCE(_contact.first_name, ''),
      COALESCE(_contact.last_name, ''),
      COALESCE(_contact.email, ''),
      COALESCE(_contact.date_of_birth::TEXT, ''),
      COALESCE(_contact.phone, '')
    );
    _identity_latch_hash := encode(sha256(_identity_snapshot::bytea), 'hex');

    -- Build identity hash from conflict search inputs for comparison
    _search_identity_hash := encode(sha256(
      concat_ws('|',
        COALESCE(_conflict_search.search_inputs->>'first_name', ''),
        COALESCE(_conflict_search.search_inputs->>'last_name', ''),
        COALESCE(_conflict_search.search_inputs->>'email', ''),
        COALESCE(_conflict_search.search_inputs->>'dob', ''),
        COALESCE(_conflict_search.search_inputs->>'phone', '')
      )::bytea
    ), 'hex');

    -- DOUBLE-LATCH CHECK: identity drift detection
    IF _identity_latch_hash != _search_identity_hash THEN
      RAISE EXCEPTION 'DOUBLE-LATCH FAILURE: Client identity hash (%) does not match conflict search identity hash (%). '
        'Client data may have changed since the conflict search was run. Re-run conflict clearance.',
        LEFT(_identity_latch_hash, 16), LEFT(_search_identity_hash, 16);
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- END Session B Double-Latch
  -- ═══════════════════════════════════════════════════════════════════════

  -- ── 2. Fetch most recent conflict scan ─────────────────────────────────
  IF _contact_id IS NOT NULL THEN
    SELECT * INTO _conflict_scan
      FROM conflict_scans
     WHERE contact_id = _contact_id
       AND tenant_id = p_tenant_id
       AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT 1;

    IF _conflict_scan.id IS NOT NULL THEN
      SELECT * INTO _conflict_dec
        FROM conflict_decisions
       WHERE scan_id = _conflict_scan.id
       ORDER BY decided_at DESC
       LIMIT 1;
    END IF;

    _global_conflict := _conflict_search;
  END IF;

  -- ── 3. Fetch latest KYC ────────────────────────────────────────────────
  IF _contact_id IS NOT NULL THEN
    SELECT * INTO _kyc
      FROM identity_verifications
     WHERE contact_id = _contact_id
       AND tenant_id = p_tenant_id
       AND status = 'verified'
     ORDER BY verified_at DESC
     LIMIT 1;
  END IF;

  -- ── 4. Fetch retainer ──────────────────────────────────────────────────
  SELECT * INTO _retainer
    FROM retainer_agreements
   WHERE matter_id = p_matter_id
     AND tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

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

  -- ── 5. Trust audit anchor ──────────────────────────────────────────────
  SELECT row_hash INTO _last_audit_hash
    FROM trust_audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF _last_audit_hash IS NULL THEN
    _last_audit_hash := 'TRUST_AUDIT_GENESIS_BLOCK_v1';
  END IF;

  -- ── 6. Trust balance ──────────────────────────────────────────────────
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'deposit' THEN amount_cents
         WHEN transaction_type = 'withdrawal' THEN -amount_cents
         ELSE 0
    END
  ), 0) INTO _initial_trust_bal
    FROM trust_transactions
   WHERE matter_id = p_matter_id AND tenant_id = p_tenant_id;

  -- ── 7. Assemble genesis payload ────────────────────────────────────────
  _genesis_payload := jsonb_build_object(
    'matter_id',              p_matter_id::TEXT,
    'matter_number',          _matter.matter_number,
    'matter_title',           _matter.title,
    'tenant_id',              p_tenant_id::TEXT,
    'generated_at',           now()::TEXT,
    'generated_by',           p_user_id::TEXT,
    'identity_latch_hash',    _identity_latch_hash,

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

  -- ── 8. SHA-256 hash ────────────────────────────────────────────────────
  _genesis_hash := encode(digest(_genesis_payload::TEXT, 'sha256'), 'hex');

  -- ── 9. Compliance pillars ──────────────────────────────────────────────
  _compliance_notes := ARRAY[]::TEXT[];
  _is_compliant := TRUE;

  IF _conflict_scan.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No conflict scan on record');
  ELSIF _conflict_dec.decision IS NULL OR _conflict_dec.decision NOT IN ('no_conflict', 'proceed_with_caution', 'waiver_obtained') THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'Conflict check not cleared: ' || COALESCE(_conflict_dec.decision, 'no_decision'));
  END IF;

  IF _kyc.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No KYC identity verification on record');
  END IF;

  IF _retainer.id IS NULL THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'No retainer agreement on record');
  ELSIF _retainer.status != 'signed' THEN
    _is_compliant := FALSE;
    _compliance_notes := array_append(_compliance_notes, 'Retainer agreement not signed: ' || _retainer.status);
  END IF;

  -- ── 9.1 Sequence violation ─────────────────────────────────────────────
  IF _conflict_dec.decided_at IS NOT NULL AND _retainer.signed_at IS NOT NULL THEN
    IF _conflict_dec.decided_at > _retainer.signed_at THEN
      _has_seq_violation := TRUE;
      _is_compliant := FALSE;
      _compliance_notes := array_append(_compliance_notes,
        'SEQUENCE VIOLATION: Conflict check decision (' || _conflict_dec.decided_at::TEXT ||
        ') was recorded AFTER retainer signing (' || _retainer.signed_at::TEXT || ').');
    END IF;
  END IF;

  -- ── 10. Trust audit chain link ─────────────────────────────────────────
  _audit_seq := nextval('trust_audit_chain_seq');

  -- ── 11. Insert genesis block ───────────────────────────────────────────
  INSERT INTO matter_genesis_metadata (
    tenant_id, matter_id, generated_by, generated_at,
    conflict_scan_id, conflict_search_id, conflict_decision, conflict_justification,
    conflict_score, conflict_decided_at, conflict_cleared_at,
    identity_latch_hash,
    kyc_verification_id, kyc_status, kyc_document_type, kyc_document_hash, kyc_verified_at,
    retainer_agreement_id, retainer_status, retainer_signed_at, retainer_total_cents, retainer_hash,
    initial_trust_balance, last_trust_audit_hash,
    genesis_payload, genesis_hash, trust_audit_chain_seq,
    is_compliant, has_sequence_violation, compliance_notes
  ) VALUES (
    p_tenant_id, p_matter_id, p_user_id, now(),
    _conflict_scan.id, p_conflict_search_id,
    COALESCE(_conflict_dec.decision, 'no_decision'),
    COALESCE(_conflict_dec.notes, ''),
    COALESCE(_conflict_scan.score, 0),
    _conflict_dec.decided_at, _conflict_search.created_at,
    _identity_latch_hash,
    _kyc.id, COALESCE(_kyc.status, 'not_started'),
    COALESCE(_kyc.document_type, ''), COALESCE(_kyc.document_number_hash, ''), _kyc.verified_at,
    _retainer.id, COALESCE(_retainer.status, 'none'),
    _retainer.signed_at, COALESCE(_retainer.total_amount_cents, 0), _retainer_hash,
    _initial_trust_bal, _last_audit_hash,
    _genesis_payload, _genesis_hash, _audit_seq,
    _is_compliant, _has_seq_violation,
    CASE WHEN array_length(_compliance_notes, 1) > 0
         THEN array_to_string(_compliance_notes, '; ')
         ELSE 'All compliance pillars met'
    END
  )
  RETURNING * INTO _result;

  -- ── 12. Trust audit log ────────────────────────────────────────────────
  INSERT INTO trust_audit_log (
    tenant_id, matter_id, user_id, action, entity_type, entity_id, metadata, reason_for_change
  ) VALUES (
    p_tenant_id, p_matter_id, p_user_id,
    'genesis_block_created', 'matter_genesis_metadata', _result.id,
    jsonb_build_object(
      'genesis_hash', _genesis_hash,
      'identity_latch_hash', _identity_latch_hash,
      'is_compliant', _is_compliant,
      'has_sequence_violation', _has_seq_violation,
      'conflict_search_id', p_conflict_search_id::TEXT,
      'conflict_cleared_at', _conflict_search.created_at::TEXT
    ),
    'Session B: Genesis block sealed with Double-Latch weld for matter ' || _matter.matter_number
  );

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION fn_generate_matter_genesis_block(UUID, UUID, UUID, UUID) IS
  'Session B Double-Latch: Generates immutable genesis block with microsecond identity verification. '
  'Latch 1: Conflict search must be CLEARED for the correct client. '
  'Latch 2: Current client identity hash must match conflict search input hash (drift detection). '
  'Stores identity_latch_hash for forensic audit.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- ATOMIC SHADOW ENGINE: fn_atomic_lead_to_matter
-- Sub-100ms Lead-to-Matter conversion in a single transaction block.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_atomic_lead_to_matter(
  p_lead_id          UUID,
  p_tenant_id        UUID,
  p_user_id          UUID,
  p_title            TEXT DEFAULT NULL,
  p_practice_area_id UUID DEFAULT NULL,
  p_matter_type_id   UUID DEFAULT NULL,
  p_description      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead               RECORD;
  _contact_id         UUID;
  _matter_id          UUID;
  _matter_number      TEXT;
  _pipeline_id        UUID;
  _win_stage_id       UUID;
  _year               TEXT;
  _seq                INT;
  _cloned_addresses   INT := 0;
  _cloned_personal    INT := 0;
  _pii_fields_scrubbed INT := 0;
  _start_ts           TIMESTAMPTZ := clock_timestamp();
  _elapsed_ms         NUMERIC;
BEGIN
  -- ── 1. Validate lead ───────────────────────────────────────────────────
  SELECT * INTO _lead
    FROM leads
   WHERE id = p_lead_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF _lead.status = 'converted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead already converted',
      'existing_matter_id', _lead.converted_matter_id);
  END IF;

  _contact_id := _lead.contact_id;

  -- ── 2. Generate matter number ──────────────────────────────────────────
  _year := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO _seq FROM matters WHERE tenant_id = p_tenant_id;
  _matter_number := 'MAT-' || _year || '-' || lpad(_seq::TEXT, 4, '0');

  -- ── 3. Resolve pipeline ────────────────────────────────────────────────
  IF p_matter_type_id IS NOT NULL THEN
    SELECT id INTO _pipeline_id
      FROM matter_stage_pipelines
     WHERE matter_type_id = p_matter_type_id AND is_default = true
     LIMIT 1;
  END IF;

  IF _pipeline_id IS NOT NULL THEN
    SELECT id INTO _win_stage_id
      FROM matter_stages
     WHERE pipeline_id = _pipeline_id AND is_terminal = true
     LIMIT 1;
  END IF;

  -- ── 4. Create matter (ATOMIC) ─────────────────────────────────────────
  INSERT INTO matters (
    tenant_id, title, description, matter_number,
    practice_area_id, matter_type_id, status, source,
    responsible_lawyer_id, originating_lead_id, created_by
  ) VALUES (
    p_tenant_id,
    COALESCE(p_title, _lead.first_name || ' ' || _lead.last_name || '  -  ' || COALESCE(_lead.source, 'Conversion')),
    p_description,
    _matter_number,
    COALESCE(p_practice_area_id, _lead.practice_area_id),
    p_matter_type_id,
    'open',
    'lead_conversion',
    COALESCE(_lead.assigned_to, p_user_id),
    p_lead_id,
    p_user_id
  )
  RETURNING id INTO _matter_id;

  -- ── 5. Link contact to matter ─────────────────────────────────────────
  IF _contact_id IS NOT NULL THEN
    INSERT INTO matter_contacts (tenant_id, matter_id, contact_id, role)
    VALUES (p_tenant_id, _matter_id, _contact_id, 'client')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 6. Clone address_history (ATOMIC) ──────────────────────────────────
  IF _contact_id IS NOT NULL THEN
    WITH inserted AS (
      INSERT INTO address_history (
        tenant_id, contact_id, matter_id,
        address_line_1, address_line_2, city, province, postal_code, country,
        start_date, end_date, is_current, address_type
      )
      SELECT
        p_tenant_id, contact_id, _matter_id,
        address_line_1, address_line_2, city, province, postal_code, country,
        start_date, end_date, is_current, address_type
      FROM address_history
      WHERE contact_id = _contact_id AND tenant_id = p_tenant_id
      RETURNING 1
    )
    SELECT COUNT(*) INTO _cloned_addresses FROM inserted;
  END IF;

  -- ── 7. Clone personal_history (ATOMIC) ─────────────────────────────────
  IF _contact_id IS NOT NULL THEN
    WITH inserted AS (
      INSERT INTO personal_history (
        tenant_id, contact_id, matter_id,
        history_type, title, organisation, description,
        start_date, end_date, is_current, country
      )
      SELECT
        p_tenant_id, contact_id, _matter_id,
        history_type, title, organisation, description,
        start_date, end_date, is_current, country
      FROM personal_history
      WHERE contact_id = _contact_id AND tenant_id = p_tenant_id
      RETURNING 1
    )
    SELECT COUNT(*) INTO _cloned_personal FROM inserted;
  END IF;

  -- ── 8. PII SCRUB  -  Nullify Lead data (ATOMIC, same transaction) ───────
  UPDATE leads SET
    first_name = '[REDACTED  -  See Matter Record]',
    last_name = '[REDACTED  -  See Matter Record]',
    email = '[REDACTED  -  See Matter Record]',
    phone = '[REDACTED  -  See Matter Record]',
    notes = '[REDACTED  -  See Matter Record]',
    status = 'converted',
    converted_matter_id = _matter_id,
    converted_at = now(),
    updated_at = now()
  WHERE id = p_lead_id AND tenant_id = p_tenant_id;

  _pii_fields_scrubbed := 5;

  -- ── 9. Compute elapsed time ────────────────────────────────────────────
  _elapsed_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - _start_ts);

  RETURN jsonb_build_object(
    'success', true,
    'matter_id', _matter_id,
    'matter_number', _matter_number,
    'contact_id', _contact_id,
    'cloned_addresses', _cloned_addresses,
    'cloned_personal', _cloned_personal,
    'pii_fields_scrubbed', _pii_fields_scrubbed,
    'elapsed_ms', _elapsed_ms,
    'atomic', true,
    'message', 'Atomic Shadow Transfer complete  -  Lead PII scrubbed in same transaction'
  );
END;
$$;

COMMENT ON FUNCTION fn_atomic_lead_to_matter(UUID, UUID, UUID, TEXT, UUID, UUID, TEXT) IS
  'Session B: Atomic Shadow Engine. Sub-100ms Lead-to-Matter conversion in a single '
  'PostgreSQL transaction. Creates matter, clones address_history + personal_history, '
  'and scrubs Lead PII  -  all atomically. No "soft data" window.';

COMMIT;
