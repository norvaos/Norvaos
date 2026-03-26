-- ============================================================================
-- Migration 201: Compliance Lockdown  -  Three-Way Trust Reconciliation
-- ============================================================================
-- Directive 004, Pillar 2: Automated Three-Way Trust Reconciliation with
-- Disbursement Lockdown.
--
-- Adds:
--   1. Disbursement lockdown columns to trust_bank_accounts
--   2. reconciliation_discrepancies table
--   3. auto_lock_on_discrepancy() trigger
--   4. auto_unlock_on_resolution() trigger
--   5. rpc_auto_reconcile() RPC function
--   6. reconciliation_schedule table
--
-- All amounts stored as BIGINT (cents).
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. DISBURSEMENT LOCKDOWN COLUMNS ON trust_bank_accounts
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trust_bank_accounts
  ADD COLUMN IF NOT EXISTS disbursements_locked    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_reason             TEXT,
  ADD COLUMN IF NOT EXISTS locked_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by               UUID         REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_reconciliation_id  UUID         REFERENCES trust_reconciliations(id),
  ADD COLUMN IF NOT EXISTS last_reconciled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_reconcile_enabled  BOOLEAN      NOT NULL DEFAULT true;

COMMENT ON COLUMN trust_bank_accounts.disbursements_locked   IS 'When true, all disbursement requests against this account are blocked until discrepancies are resolved.';
COMMENT ON COLUMN trust_bank_accounts.lock_reason            IS 'Human-readable reason for the disbursement lockdown.';
COMMENT ON COLUMN trust_bank_accounts.locked_at              IS 'Timestamp when disbursements were locked.';
COMMENT ON COLUMN trust_bank_accounts.locked_by              IS 'User who manually locked disbursements (NULL if auto-locked by trigger).';
COMMENT ON COLUMN trust_bank_accounts.last_reconciliation_id IS 'FK to the most recent completed reconciliation for this account.';
COMMENT ON COLUMN trust_bank_accounts.last_reconciled_at     IS 'Timestamp of the most recent completed reconciliation.';
COMMENT ON COLUMN trust_bank_accounts.auto_reconcile_enabled IS 'When true, scheduled auto-reconciliation is active for this account.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. reconciliation_discrepancies TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_account_id    UUID        NOT NULL REFERENCES trust_bank_accounts(id),
  reconciliation_id   UUID        REFERENCES trust_reconciliations(id),
  discrepancy_type    TEXT        NOT NULL
    CHECK (discrepancy_type IN ('bank_vs_book', 'book_vs_client', 'bank_vs_client', 'three_way_mismatch')),
  bank_balance_cents  BIGINT,
  book_balance_cents  BIGINT,
  client_listing_cents BIGINT,
  delta_cents         BIGINT      NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'escalated')),
  resolved_by         UUID        REFERENCES users(id),
  resolved_at         TIMESTAMPTZ,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reconciliation_discrepancies IS 'Records three-way reconciliation discrepancies. Open discrepancies trigger automatic disbursement lockdown on the associated trust account.';

ALTER TABLE reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_discrepancies_tenant_isolation" ON reconciliation_discrepancies
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_account
  ON reconciliation_discrepancies (tenant_id, trust_account_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_status
  ON reconciliation_discrepancies (status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_created
  ON reconciliation_discrepancies (created_at);

CREATE TRIGGER set_reconciliation_discrepancies_updated_at
  BEFORE UPDATE ON reconciliation_discrepancies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TRIGGER: auto_lock_on_discrepancy
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_lock_on_discrepancy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'open' THEN
    UPDATE trust_bank_accounts
    SET disbursements_locked = true,
        lock_reason = 'Three-way reconciliation discrepancy detected  -  disbursements frozen until resolved. Discrepancy ID: ' || NEW.id::text,
        locked_at = now()
    WHERE id = NEW.trust_account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_lock_on_discrepancy() IS 'Automatically locks disbursements on a trust account when a new open discrepancy is inserted.';

CREATE TRIGGER trg_auto_lock_on_discrepancy
  AFTER INSERT ON reconciliation_discrepancies
  FOR EACH ROW EXECUTE FUNCTION auto_lock_on_discrepancy();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER: auto_unlock_on_resolution
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_unlock_on_resolution()
RETURNS TRIGGER AS $$
DECLARE
  remaining_count INT;
BEGIN
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    SELECT COUNT(*) INTO remaining_count
    FROM reconciliation_discrepancies
    WHERE trust_account_id = NEW.trust_account_id
      AND id != NEW.id
      AND status IN ('open', 'investigating');

    IF remaining_count = 0 THEN
      UPDATE trust_bank_accounts
      SET disbursements_locked = false,
          lock_reason = NULL,
          locked_at = NULL,
          locked_by = NULL
      WHERE id = NEW.trust_account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_unlock_on_resolution() IS 'Automatically unlocks disbursements when all discrepancies for a trust account are resolved.';

CREATE TRIGGER trg_auto_unlock_on_resolution
  AFTER UPDATE ON reconciliation_discrepancies
  FOR EACH ROW EXECUTE FUNCTION auto_unlock_on_resolution();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC: rpc_auto_reconcile
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_auto_reconcile(
  p_tenant_id        UUID,
  p_trust_account_id UUID,
  p_period_start     DATE,
  p_period_end       DATE,
  p_user_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reconciliation_id    UUID;
  v_book_balance         BIGINT;
  v_outstanding_deposits BIGINT;
  v_outstanding_cheques  BIGINT;
  v_adjusted_bank        BIGINT;
  v_bank_balance         BIGINT;
  v_client_listing       BIGINT;
  v_is_balanced          BOOLEAN;
  v_discrepancy_id       UUID;
  v_discrepancy_type     TEXT;
  v_delta                BIGINT;
  v_bank_vs_book         BOOLEAN;
  v_book_vs_client       BOOLEAN;
  v_bank_vs_client       BOOLEAN;
BEGIN
  -- ── Step 1: Create draft reconciliation ───────────────────────────────
  INSERT INTO trust_reconciliations (
    tenant_id, trust_account_id, period_start, period_end, status
  ) VALUES (
    p_tenant_id, p_trust_account_id, p_period_start, p_period_end, 'draft'
  )
  RETURNING id INTO v_reconciliation_id;

  -- ── Step 2: Compute book balance (sum of all transactions in period) ──
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_book_balance
  FROM trust_transactions
  WHERE tenant_id = p_tenant_id
    AND trust_account_id = p_trust_account_id
    AND effective_date <= p_period_end;

  -- ── Step 3: Identify outstanding items ────────────────────────────────
  -- Outstanding deposits (deposits not yet cleared)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_outstanding_deposits
  FROM trust_transactions
  WHERE tenant_id = p_tenant_id
    AND trust_account_id = p_trust_account_id
    AND is_cleared = false
    AND amount_cents > 0
    AND effective_date <= p_period_end;

  -- Outstanding cheques / disbursements (not yet cleared)
  SELECT COALESCE(ABS(SUM(amount_cents)), 0) INTO v_outstanding_cheques
  FROM trust_transactions
  WHERE tenant_id = p_tenant_id
    AND trust_account_id = p_trust_account_id
    AND is_cleared = false
    AND amount_cents < 0
    AND effective_date <= p_period_end;

  -- ── Step 4: Compute adjusted bank balance ─────────────────────────────
  -- Bank balance = book balance - outstanding deposits + outstanding cheques
  -- (adjusted bank = what the bank statement should show given outstanding items)
  v_bank_balance := v_book_balance - v_outstanding_deposits + v_outstanding_cheques;
  v_adjusted_bank := v_bank_balance;

  -- ── Step 5: Compute client trust listing ──────────────────────────────
  -- Latest running_balance_cents per matter on this trust account
  SELECT COALESCE(SUM(latest_balance), 0) INTO v_client_listing
  FROM (
    SELECT DISTINCT ON (matter_id) running_balance_cents AS latest_balance
    FROM trust_transactions
    WHERE tenant_id = p_tenant_id
      AND trust_account_id = p_trust_account_id
      AND effective_date <= p_period_end
    ORDER BY matter_id, created_at DESC
  ) sub;

  -- ── Step 6: Three-way balance check ───────────────────────────────────
  v_bank_vs_book   := (v_adjusted_bank = v_book_balance);
  v_book_vs_client := (v_book_balance = v_client_listing);
  v_bank_vs_client := (v_adjusted_bank = v_client_listing);
  v_is_balanced    := v_bank_vs_book AND v_book_vs_client AND v_bank_vs_client;

  -- Update the reconciliation record with computed values
  UPDATE trust_reconciliations
  SET bank_statement_balance_cents = v_bank_balance,
      book_balance_cents           = v_book_balance,
      client_listing_total_cents   = v_client_listing,
      outstanding_deposits_cents   = v_outstanding_deposits,
      outstanding_cheques_cents    = v_outstanding_cheques,
      adjusted_bank_balance_cents  = v_adjusted_bank,
      is_balanced                  = v_is_balanced
  WHERE id = v_reconciliation_id;

  -- ── Step 7: Complete or flag ──────────────────────────────────────────
  IF v_is_balanced THEN
    -- Balanced: complete the reconciliation
    UPDATE trust_reconciliations
    SET status       = 'completed',
        completed_by = p_user_id,
        completed_at = now()
    WHERE id = v_reconciliation_id;

    -- Update trust account with last reconciliation reference
    UPDATE trust_bank_accounts
    SET last_reconciliation_id = v_reconciliation_id,
        last_reconciled_at     = now()
    WHERE id = p_trust_account_id;
  ELSE
    -- Not balanced: flag the reconciliation
    UPDATE trust_reconciliations
    SET status = 'flagged'
    WHERE id = v_reconciliation_id;

    -- Determine discrepancy type
    IF NOT v_bank_vs_book AND NOT v_book_vs_client AND NOT v_bank_vs_client THEN
      v_discrepancy_type := 'three_way_mismatch';
      v_delta := GREATEST(
        ABS(v_adjusted_bank - v_book_balance),
        ABS(v_book_balance - v_client_listing),
        ABS(v_adjusted_bank - v_client_listing)
      );
    ELSIF NOT v_bank_vs_book THEN
      v_discrepancy_type := 'bank_vs_book';
      v_delta := ABS(v_adjusted_bank - v_book_balance);
    ELSIF NOT v_book_vs_client THEN
      v_discrepancy_type := 'book_vs_client';
      v_delta := ABS(v_book_balance - v_client_listing);
    ELSE
      v_discrepancy_type := 'bank_vs_client';
      v_delta := ABS(v_adjusted_bank - v_client_listing);
    END IF;

    -- Insert discrepancy (triggers auto-lock)
    INSERT INTO reconciliation_discrepancies (
      tenant_id, trust_account_id, reconciliation_id,
      discrepancy_type, bank_balance_cents, book_balance_cents,
      client_listing_cents, delta_cents, status
    ) VALUES (
      p_tenant_id, p_trust_account_id, v_reconciliation_id,
      v_discrepancy_type, v_adjusted_bank, v_book_balance,
      v_client_listing, v_delta, 'open'
    )
    RETURNING id INTO v_discrepancy_id;
  END IF;

  -- ── Return result ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'reconciliation_id', v_reconciliation_id,
    'is_balanced',       v_is_balanced,
    'bank_balance',      v_adjusted_bank,
    'book_balance',      v_book_balance,
    'client_listing',    v_client_listing,
    'delta',             COALESCE(v_delta, 0),
    'discrepancy_id',    v_discrepancy_id
  );
END;
$$;

COMMENT ON FUNCTION rpc_auto_reconcile(UUID, UUID, DATE, DATE, UUID) IS 'Performs automated three-way trust reconciliation (bank vs book vs client listing). Flags discrepancies and triggers disbursement lockdown when imbalanced. Returns JSONB result with reconciliation details.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. reconciliation_schedule TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reconciliation_schedule (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_account_id UUID    NOT NULL REFERENCES trust_bank_accounts(id),
  frequency        TEXT    NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  next_run_date    DATE    NOT NULL,
  last_run_date    DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, trust_account_id)
);

COMMENT ON TABLE reconciliation_schedule IS 'Defines the automated reconciliation schedule per trust account. Used by the cron/edge function to trigger rpc_auto_reconcile at the configured frequency.';

ALTER TABLE reconciliation_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_schedule_tenant_isolation" ON reconciliation_schedule
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

COMMIT;
