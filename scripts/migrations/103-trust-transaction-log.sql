-- ============================================================================
-- Migration 102: Trust Transaction Log — Append-Only Financial Event Log
-- ============================================================================
-- Creates an immutable, append-only transaction log for trust accounting.
-- Every financial event (deposit, disbursement, transfer, hold, reconciliation)
-- is recorded with before/after balances for complete audit trail.
--
-- This table is SEPARATE from trust_audit_log (which is a general-purpose
-- audit trail). This is a financial-grade event log designed for:
--   - Regulatory compliance (LSO By-Law 9)
--   - Forensic audit trail
--   - Balance reconstruction from any point in time
-- ============================================================================

CREATE TABLE IF NOT EXISTS trust_transaction_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event classification
  event_type              TEXT NOT NULL
    CHECK (event_type IN (
      'deposit_recorded', 'disbursement_recorded', 'transfer_recorded',
      'reversal_recorded', 'hold_created', 'hold_released', 'hold_cancelled',
      'reconciliation_created', 'reconciliation_completed', 'reconciliation_reviewed',
      'disbursement_request_prepared', 'disbursement_request_approved',
      'disbursement_request_rejected', 'balance_warning', 'overdraft_prevented'
    )),

  -- Entity references
  trust_account_id        UUID REFERENCES trust_bank_accounts(id),
  matter_id               UUID REFERENCES matters(id),
  transaction_id          UUID REFERENCES trust_transactions(id),
  related_entity_type     TEXT,  -- e.g. 'trust_disbursement_request', 'trust_hold', 'trust_reconciliation'
  related_entity_id       UUID,

  -- Financial snapshot at time of event
  balance_before_cents    BIGINT,
  balance_after_cents     BIGINT,
  amount_cents            BIGINT,

  -- Who and when
  performed_by            UUID NOT NULL REFERENCES users(id),
  performed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Human-readable description
  description             TEXT NOT NULL,

  -- Structured metadata (JSON for extensibility)
  metadata                JSONB NOT NULL DEFAULT '{}',

  -- Sequence number for ordering within a tenant (monotonically increasing)
  sequence_number         BIGINT NOT NULL,

  -- Hash of previous entry for tamper detection (optional, for future blockchain-style verification)
  previous_hash           TEXT,
  entry_hash              TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE trust_transaction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_transaction_log_tenant_isolation" ON trust_transaction_log
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Immutability triggers — NO UPDATE, NO DELETE
CREATE OR REPLACE FUNCTION trust_transaction_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Trust transaction log entries are immutable. This is an append-only ledger.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_transaction_log_no_update
  BEFORE UPDATE ON trust_transaction_log
  FOR EACH ROW EXECUTE FUNCTION trust_transaction_log_immutable();

CREATE TRIGGER trust_transaction_log_no_delete
  BEFORE DELETE ON trust_transaction_log
  FOR EACH ROW EXECUTE FUNCTION trust_transaction_log_immutable();

-- Auto-increment sequence number per tenant
CREATE OR REPLACE FUNCTION trust_transaction_log_set_sequence()
RETURNS TRIGGER AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO next_seq
  FROM trust_transaction_log
  WHERE tenant_id = NEW.tenant_id;

  NEW.sequence_number := next_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_transaction_log_auto_sequence
  BEFORE INSERT ON trust_transaction_log
  FOR EACH ROW EXECUTE FUNCTION trust_transaction_log_set_sequence();

-- Indexes
CREATE INDEX idx_trust_transaction_log_tenant_seq
  ON trust_transaction_log (tenant_id, sequence_number DESC);

CREATE INDEX idx_trust_transaction_log_account_date
  ON trust_transaction_log (tenant_id, trust_account_id, performed_at DESC);

CREATE INDEX idx_trust_transaction_log_matter
  ON trust_transaction_log (tenant_id, matter_id, performed_at DESC)
  WHERE matter_id IS NOT NULL;

CREATE INDEX idx_trust_transaction_log_event_type
  ON trust_transaction_log (tenant_id, event_type, performed_at DESC);

CREATE INDEX idx_trust_transaction_log_transaction
  ON trust_transaction_log (transaction_id)
  WHERE transaction_id IS NOT NULL;
