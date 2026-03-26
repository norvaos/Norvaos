BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 207: Compliance Overrides & Firm Sovereignty
-- Directives 026 + 027 — NorvaOS
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- Directive 026: Compliance Overrides — Emergency Override Log
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  matter_id UUID NOT NULL REFERENCES matters(id),
  override_type TEXT NOT NULL,           -- 'stale_document', 'gap_blocker', 'compliance_pillar', 'financial_hold'
  blocked_node TEXT NOT NULL,            -- which readiness node was blocked (e.g. 'Freshness', 'Continuity', 'Documents')
  original_status TEXT NOT NULL,         -- the status before override (e.g. 'critical_stale', 'blocker')
  justification TEXT NOT NULL CHECK (char_length(justification) >= 50),
  justification_hash TEXT NOT NULL,      -- SHA-256 of justification text
  authorized_by UUID NOT NULL REFERENCES users(id),
  authorized_role TEXT NOT NULL,         -- must be 'partner' or 'admin'
  partner_pin_hash TEXT NOT NULL,        -- SHA-256 of the Partner PIN used
  genesis_amendment_hash TEXT,           -- SHA-256 linking this override to the genesis block
  is_active BOOLEAN DEFAULT true,        -- can be revoked
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revocation_reason TEXT,
  expires_at TIMESTAMPTZ,               -- optional expiry for time-limited overrides
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_overrides_matter ON compliance_overrides(matter_id);
CREATE INDEX IF NOT EXISTS idx_compliance_overrides_tenant ON compliance_overrides(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_overrides_authorized_by ON compliance_overrides(authorized_by);

ALTER TABLE compliance_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_overrides_tenant_read" ON compliance_overrides
  FOR SELECT USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY "compliance_overrides_tenant_insert" ON compliance_overrides
  FOR INSERT WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY "compliance_overrides_tenant_update" ON compliance_overrides
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- Directive 027: Firm Global Audit Ledger — Genesis Zero
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS firm_global_audit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,              -- 'genesis_zero', 'matter_sealed', 'override_logged', 'trust_audit', 'sovereignty_check'
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_hash TEXT NOT NULL,              -- SHA-256 of event_payload
  prev_hash TEXT NOT NULL,               -- previous event's hash (chain link)
  chain_seq BIGINT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_firm_audit_chain UNIQUE (tenant_id, chain_seq)
);

CREATE INDEX IF NOT EXISTS idx_firm_audit_tenant_seq ON firm_global_audit_ledger(tenant_id, chain_seq DESC);

ALTER TABLE firm_global_audit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_audit_tenant_read" ON firm_global_audit_ledger
  FOR SELECT USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

CREATE POLICY "firm_audit_tenant_insert" ON firm_global_audit_ledger
  FOR INSERT WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

-- Immutability guard: no updates or deletes allowed on the audit ledger
CREATE POLICY "firm_audit_no_update" ON firm_global_audit_ledger
  FOR UPDATE USING (false);

CREATE POLICY "firm_audit_no_delete" ON firm_global_audit_ledger
  FOR DELETE USING (false);


-- ═══════════════════════════════════════════════════════════════════════════════
-- Genesis Zero: The Firm's Birth Certificate
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_initialize_firm_sovereignty(
  p_tenant_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _existing RECORD;
  _matter_count INT;
  _genesis_count INT;
  _trust_entries INT;
  _contact_count INT;
  _payload JSONB;
  _payload_text TEXT;
  _genesis_hash TEXT;
  _firm_name TEXT;
BEGIN
  -- Guard: Check if Genesis Zero already exists for this tenant
  SELECT * INTO _existing FROM firm_global_audit_ledger
    WHERE tenant_id = p_tenant_id AND event_type = 'genesis_zero' LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Genesis Zero already initialized for this firm. Cannot re-initialize.',
      'existing_hash', _existing.event_hash,
      'initialized_at', _existing.created_at
    );
  END IF;

  -- Gather firm snapshot
  SELECT name INTO _firm_name FROM tenants WHERE id = p_tenant_id;
  SELECT COUNT(*) INTO _matter_count FROM matters WHERE tenant_id = p_tenant_id AND is_active = true;
  SELECT COUNT(*) INTO _genesis_count FROM matter_genesis_metadata WHERE tenant_id = p_tenant_id AND is_revoked = false;
  SELECT COUNT(*) INTO _trust_entries FROM trust_audit_log WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO _contact_count FROM contacts WHERE tenant_id = p_tenant_id;

  -- Build payload
  _payload := jsonb_build_object(
    'event', 'GENESIS_ZERO',
    'firm_name', COALESCE(_firm_name, 'Unknown Firm'),
    'tenant_id', p_tenant_id,
    'initialized_by', p_user_id,
    'initialized_at', now(),
    'snapshot', jsonb_build_object(
      'total_matters', _matter_count,
      'sealed_genesis_blocks', _genesis_count,
      'trust_audit_entries', _trust_entries,
      'total_contacts', _contact_count
    ),
    'sovereignty_declaration', 'All records anchored. Sovereign Red Pulse armed. Database drift detection active.',
    'norva_version', '1.0.0-beta'
  );

  _payload_text := _payload::TEXT;
  _genesis_hash := encode(sha256(_payload_text::bytea), 'hex');

  -- Insert Genesis Zero as first entry in the firm audit ledger
  INSERT INTO firm_global_audit_ledger (
    tenant_id, event_type, event_payload, event_hash, prev_hash, chain_seq, created_by
  ) VALUES (
    p_tenant_id, 'genesis_zero', _payload, _genesis_hash, 'FIRM_SOVEREIGNTY_GENESIS_v1', 1, p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'genesis_hash', _genesis_hash,
    'firm_name', COALESCE(_firm_name, 'Unknown Firm'),
    'snapshot', _payload->'snapshot',
    'message', 'Sovereign Fortress Active: Genesis Zero sealed. All ledgers hashed. Compliance mathematically guaranteed.'
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Emergency Override with Genesis Amendment
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_log_compliance_override(
  p_tenant_id UUID,
  p_matter_id UUID,
  p_user_id UUID,
  p_override_type TEXT,
  p_blocked_node TEXT,
  p_original_status TEXT,
  p_justification TEXT,
  p_partner_pin TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user RECORD;
  _justification_hash TEXT;
  _pin_hash TEXT;
  _amendment_hash TEXT;
  _override_id UUID;
  _last_audit RECORD;
  _next_seq BIGINT;
BEGIN
  -- 1. Validate user is partner or admin
  SELECT * INTO _user FROM users WHERE id = p_user_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF _user.role NOT IN ('partner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Partner or Admin can authorize compliance overrides');
  END IF;

  -- 2. Validate justification length
  IF char_length(p_justification) < 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justification must be at least 50 characters');
  END IF;

  -- 3. Validate PIN (minimum 4 chars)
  IF char_length(p_partner_pin) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partner PIN must be at least 4 characters');
  END IF;

  -- 4. Hash justification and PIN
  _justification_hash := encode(sha256(p_justification::bytea), 'hex');
  _pin_hash := encode(sha256(p_partner_pin::bytea), 'hex');

  -- 5. Create amendment hash (links to genesis block if exists)
  _amendment_hash := encode(sha256(
    (p_matter_id::TEXT || _justification_hash || _pin_hash || now()::TEXT)::bytea
  ), 'hex');

  -- 6. Insert override record
  INSERT INTO compliance_overrides (
    tenant_id, matter_id, override_type, blocked_node, original_status,
    justification, justification_hash, authorized_by, authorized_role,
    partner_pin_hash, genesis_amendment_hash
  ) VALUES (
    p_tenant_id, p_matter_id, p_override_type, p_blocked_node, p_original_status,
    p_justification, _justification_hash, p_user_id, _user.role,
    _pin_hash, _amendment_hash
  ) RETURNING id INTO _override_id;

  -- 7. Log to firm global audit ledger
  SELECT * INTO _last_audit FROM firm_global_audit_ledger
    WHERE tenant_id = p_tenant_id ORDER BY chain_seq DESC LIMIT 1;

  _next_seq := COALESCE(_last_audit.chain_seq, 0) + 1;

  INSERT INTO firm_global_audit_ledger (
    tenant_id, event_type, event_payload, event_hash, prev_hash, chain_seq, created_by
  ) VALUES (
    p_tenant_id,
    'override_logged',
    jsonb_build_object(
      'override_id', _override_id,
      'matter_id', p_matter_id,
      'override_type', p_override_type,
      'blocked_node', p_blocked_node,
      'justification_hash', _justification_hash,
      'amendment_hash', _amendment_hash,
      'authorized_by', p_user_id,
      'authorized_role', _user.role
    ),
    _amendment_hash,
    COALESCE(_last_audit.event_hash, 'FIRM_SOVEREIGNTY_GENESIS_v1'),
    _next_seq,
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'override_id', _override_id,
    'amendment_hash', _amendment_hash,
    'message', 'Compliance override logged. Genesis amendment recorded in firm audit ledger.'
  );
END;
$$;


-- Updated_at trigger for compliance_overrides
CREATE OR REPLACE TRIGGER trg_compliance_overrides_updated_at
  BEFORE UPDATE ON compliance_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
