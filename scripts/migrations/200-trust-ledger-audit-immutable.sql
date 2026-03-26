-- ============================================================================
-- Migration 200: Trust Ledger Audit — Immutable Foundation (Directive 005.1)
-- ============================================================================
-- Creates the trust_ledger_audit table: an INSERT-only, tamper-proof audit
-- trail for every trust balance change. A database-level trigger on
-- trust_transactions forces a corresponding audit row on every INSERT.
-- If the audit INSERT fails, the entire trust_transactions INSERT rolls back.
--
-- This is the bedrock of Law Society compliance. No trust balance can change
-- without a permanent, immutable record.
-- ============================================================================

-- ─── 1. Create trust_ledger_audit table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_ledger_audit (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What changed
  transaction_id            UUID NOT NULL,  -- FK added below after table exists
  transaction_type          TEXT NOT NULL,
  trust_account_id          UUID NOT NULL REFERENCES trust_bank_accounts(id),
  matter_id                 UUID NOT NULL REFERENCES matters(id),

  -- Balance snapshot (cents)
  balance_before_cents      BIGINT NOT NULL,
  amount_cents              BIGINT NOT NULL,
  balance_after_cents       BIGINT NOT NULL,

  -- Who
  authorized_by             UUID NOT NULL REFERENCES users(id),
  recorded_by               UUID NOT NULL REFERENCES users(id),

  -- Context
  description               TEXT NOT NULL,
  payment_method            TEXT,
  reference_number          TEXT,
  reversal_of_id            UUID,           -- If this txn reverses another
  metadata                  JSONB NOT NULL DEFAULT '{}',

  -- Tamper detection
  content_hash              TEXT NOT NULL,   -- SHA-256 of critical fields

  -- Timestamp — set by DB, not application
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Foreign key to trust_transactions ────────────────────────────────────

ALTER TABLE trust_ledger_audit
  ADD CONSTRAINT trust_ledger_audit_transaction_id_fk
  FOREIGN KEY (transaction_id) REFERENCES trust_transactions(id);

-- ─── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE trust_ledger_audit ENABLE ROW LEVEL SECURITY;

-- INSERT-only RLS: SELECT for reads, INSERT for writes, no UPDATE/DELETE
CREATE POLICY "trust_ledger_audit_tenant_read" ON trust_ledger_audit
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "trust_ledger_audit_tenant_insert" ON trust_ledger_audit
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Service role needs full INSERT access (used by the trigger via admin context)
-- No UPDATE or DELETE policies exist — RLS blocks them entirely.

-- ─── 4. Immutability triggers — prevent UPDATE and DELETE at DB level ────────

CREATE OR REPLACE FUNCTION trust_ledger_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: trust_ledger_audit entries cannot be modified or deleted. This table is INSERT-only per Law Society compliance requirements.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_ledger_audit_no_update
  BEFORE UPDATE ON trust_ledger_audit
  FOR EACH ROW EXECUTE FUNCTION trust_ledger_audit_immutable();

CREATE TRIGGER trust_ledger_audit_no_delete
  BEFORE DELETE ON trust_ledger_audit
  FOR EACH ROW EXECUTE FUNCTION trust_ledger_audit_immutable();

-- ─── 5. Auto-audit trigger on trust_transactions INSERT ──────────────────────
-- This is the critical piece: every trust_transactions INSERT automatically
-- creates a trust_ledger_audit row in the SAME transaction. If this INSERT
-- fails, the trust_transactions INSERT rolls back too.

CREATE OR REPLACE FUNCTION trust_ledger_audit_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  prev_balance BIGINT;
  hash_input TEXT;
  computed_hash TEXT;
BEGIN
  -- Calculate balance_before from the running balance
  -- NEW.running_balance_cents is already computed by the trust_transactions_before_insert trigger
  prev_balance := NEW.running_balance_cents - NEW.amount_cents;

  -- Build tamper-detection hash: SHA-256 of critical fields
  hash_input := NEW.id::TEXT
    || '|' || NEW.tenant_id::TEXT
    || '|' || NEW.trust_account_id::TEXT
    || '|' || NEW.matter_id::TEXT
    || '|' || prev_balance::TEXT
    || '|' || NEW.amount_cents::TEXT
    || '|' || NEW.running_balance_cents::TEXT
    || '|' || NEW.transaction_type
    || '|' || NEW.authorized_by::TEXT
    || '|' || NEW.recorded_by::TEXT
    || '|' || COALESCE(NEW.description, '')
    || '|' || NEW.created_at::TEXT;

  computed_hash := encode(sha256(hash_input::BYTEA), 'hex');

  -- INSERT the audit row — if this fails, the entire transaction rolls back
  INSERT INTO trust_ledger_audit (
    tenant_id,
    transaction_id,
    transaction_type,
    trust_account_id,
    matter_id,
    balance_before_cents,
    amount_cents,
    balance_after_cents,
    authorized_by,
    recorded_by,
    description,
    payment_method,
    reference_number,
    reversal_of_id,
    metadata,
    content_hash
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    NEW.transaction_type,
    NEW.trust_account_id,
    NEW.matter_id,
    prev_balance,
    NEW.amount_cents,
    NEW.running_balance_cents,
    NEW.authorized_by,
    NEW.recorded_by,
    NEW.description,
    NEW.payment_method,
    NEW.reference_number,
    NEW.reversal_of_id,
    jsonb_build_object(
      'effective_date', NEW.effective_date,
      'contact_id', NEW.contact_id,
      'is_cleared', NEW.is_cleared,
      'hold_release_date', NEW.hold_release_date,
      'notes', NEW.notes,
      'client_description', NEW.client_description
    ),
    computed_hash
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER INSERT: runs after the balance trigger, so running_balance_cents is final
CREATE TRIGGER trust_ledger_audit_after_insert
  AFTER INSERT ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION trust_ledger_audit_on_transaction();

-- ─── 6. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX idx_trust_ledger_audit_transaction
  ON trust_ledger_audit (transaction_id);

CREATE INDEX idx_trust_ledger_audit_matter_date
  ON trust_ledger_audit (tenant_id, matter_id, created_at DESC);

CREATE INDEX idx_trust_ledger_audit_account_date
  ON trust_ledger_audit (tenant_id, trust_account_id, created_at DESC);

CREATE INDEX idx_trust_ledger_audit_hash
  ON trust_ledger_audit (content_hash);

-- ─── 7. Verification function — check audit chain integrity ──────────────────

CREATE OR REPLACE FUNCTION verify_trust_ledger_audit_integrity(
  p_tenant_id UUID,
  p_matter_id UUID DEFAULT NULL
)
RETURNS TABLE (
  audit_id UUID,
  transaction_id UUID,
  is_valid BOOLEAN,
  expected_hash TEXT,
  actual_hash TEXT,
  issue TEXT
) AS $$
DECLARE
  rec RECORD;
  expected_prev_balance BIGINT := 0;
  hash_input TEXT;
  recomputed_hash TEXT;
BEGIN
  FOR rec IN
    SELECT
      tla.*,
      tt.created_at AS txn_created_at
    FROM trust_ledger_audit tla
    JOIN trust_transactions tt ON tt.id = tla.transaction_id
    WHERE tla.tenant_id = p_tenant_id
      AND (p_matter_id IS NULL OR tla.matter_id = p_matter_id)
    ORDER BY tla.created_at ASC
  LOOP
    -- Recompute hash
    hash_input := rec.transaction_id::TEXT
      || '|' || rec.tenant_id::TEXT
      || '|' || rec.trust_account_id::TEXT
      || '|' || rec.matter_id::TEXT
      || '|' || rec.balance_before_cents::TEXT
      || '|' || rec.amount_cents::TEXT
      || '|' || rec.balance_after_cents::TEXT
      || '|' || rec.transaction_type
      || '|' || rec.authorized_by::TEXT
      || '|' || rec.recorded_by::TEXT
      || '|' || COALESCE(rec.description, '')
      || '|' || rec.txn_created_at::TEXT;

    recomputed_hash := encode(sha256(hash_input::BYTEA), 'hex');

    -- Check hash
    IF rec.content_hash != recomputed_hash THEN
      audit_id := rec.id;
      transaction_id := rec.transaction_id;
      is_valid := FALSE;
      expected_hash := recomputed_hash;
      actual_hash := rec.content_hash;
      issue := 'HASH_MISMATCH: Audit record may have been tampered with';
      RETURN NEXT;
    END IF;

    -- Check balance continuity (per-matter)
    IF rec.balance_before_cents != expected_prev_balance THEN
      audit_id := rec.id;
      transaction_id := rec.transaction_id;
      is_valid := FALSE;
      expected_hash := recomputed_hash;
      actual_hash := rec.content_hash;
      issue := 'BALANCE_GAP: Expected balance_before=' || expected_prev_balance || ' but got ' || rec.balance_before_cents;
      RETURN NEXT;
    END IF;

    -- Track running balance for next iteration
    expected_prev_balance := rec.balance_after_cents;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. Unique constraint: one audit per transaction ─────────────────────────

CREATE UNIQUE INDEX trust_ledger_audit_transaction_unique
  ON trust_ledger_audit (transaction_id);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- trust_ledger_audit is now:
--   ✓ INSERT-only (UPDATE/DELETE blocked by trigger + RLS)
--   ✓ Auto-populated on every trust_transactions INSERT (DB trigger)
--   ✓ Transactional: audit failure = transaction rollback
--   ✓ Tamper-detectable via SHA-256 content_hash
--   ✓ Verifiable via verify_trust_ledger_audit_integrity()
--   ✓ Tenant-isolated via RLS
-- ============================================================================
