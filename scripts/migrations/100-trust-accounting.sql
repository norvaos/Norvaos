-- ============================================================================
-- Migration 100: Trust Accounting & IOLTA Compliance  -  Phase 7
-- ============================================================================
-- Creates 12 new tables + amends 2 existing tables for the trust accounting
-- subsystem. Compliant with LSO By-Law 9 (Ontario baseline).
--
-- New tables:
--   1.  operating_bank_accounts
--   2.  trust_bank_accounts
--   3.  trust_transactions  (append-only, running balance trigger)
--   4.  trust_reconciliations
--   5.  trust_reconciliation_items
--   6.  trust_holds
--   7.  trust_audit_log  (immutable)
--   8.  trust_disbursement_requests
--   9.  cheques
--  10.  bank_feed_transactions  (future-compat, created empty)
--  11.  qbo_sync_mappings  (future-compat, created empty)
--  12.  qbo_sync_log  (future-compat, created empty)
--
-- Amended tables:
--   - matters: +is_trust_admin
--   - payments: +trust_transaction_id
--
-- All amounts stored as BIGINT (cents).
-- ============================================================================

-- ─── 0. Amend existing tables ───────────────────────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS is_trust_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS trust_transaction_id UUID DEFAULT NULL;

-- FK for trust_transaction_id added after trust_transactions table is created.

-- ─── 1. operating_bank_accounts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operating_bank_accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_name              TEXT NOT NULL,
  bank_name                 TEXT NOT NULL,
  account_number_encrypted  TEXT NOT NULL,
  transit_number            TEXT,
  institution_number        TEXT,
  currency                  TEXT NOT NULL DEFAULT 'CAD',
  is_default                BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  next_cheque_number        INT NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operating_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operating_bank_accounts_tenant_isolation" ON operating_bank_accounts
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER set_operating_bank_accounts_updated_at
  BEFORE UPDATE ON operating_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. trust_bank_accounts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_bank_accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_name              TEXT NOT NULL,
  account_type              TEXT NOT NULL DEFAULT 'general'
    CHECK (account_type IN ('general', 'specific')),
  bank_name                 TEXT NOT NULL,
  account_number_encrypted  TEXT NOT NULL,
  transit_number            TEXT,
  institution_number        TEXT,
  currency                  TEXT NOT NULL DEFAULT 'CAD',
  jurisdiction_code         TEXT NOT NULL DEFAULT 'CA-ON',
  matter_id                 UUID REFERENCES matters(id) ON DELETE SET NULL,
  admin_matter_id           UUID REFERENCES matters(id) ON DELETE SET NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  opened_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_date               DATE,
  default_hold_days_cheque  INT NOT NULL DEFAULT 5,
  default_hold_days_eft     INT NOT NULL DEFAULT 0,
  next_cheque_number        INT NOT NULL DEFAULT 1,
  created_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_bank_accounts_tenant_isolation" ON trust_bank_accounts
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER set_trust_bank_accounts_updated_at
  BEFORE UPDATE ON trust_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 3. trust_transactions (append-only) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_account_id      UUID NOT NULL REFERENCES trust_bank_accounts(id),
  matter_id             UUID NOT NULL REFERENCES matters(id),
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  transaction_type      TEXT NOT NULL
    CHECK (transaction_type IN (
      'deposit', 'disbursement', 'transfer_in', 'transfer_out',
      'refund', 'reversal', 'interest', 'bank_fee', 'adjustment',
      'opening_balance'
    )),
  amount_cents          BIGINT NOT NULL CHECK (amount_cents != 0),
  running_balance_cents BIGINT NOT NULL DEFAULT 0,
  description           TEXT NOT NULL,
  client_description    TEXT DEFAULT NULL,
  reference_number      TEXT,
  payment_method        TEXT
    CHECK (payment_method IS NULL OR payment_method IN (
      'cheque', 'wire', 'eft', 'cash', 'bank_draft', 'interac', 'credit_card'
    )),
  invoice_id            UUID REFERENCES invoices(id) ON DELETE SET NULL,
  operating_account_id  UUID REFERENCES operating_bank_accounts(id) ON DELETE SET NULL,
  reversal_of_id        UUID REFERENCES trust_transactions(id),
  hold_release_date     DATE,
  is_cleared            BOOLEAN NOT NULL DEFAULT true,
  authorized_by         UUID NOT NULL REFERENCES users(id),
  recorded_by           UUID NOT NULL REFERENCES users(id),
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_transactions_tenant_isolation" ON trust_transactions
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Now add the FK from payments to trust_transactions
ALTER TABLE payments
  ADD CONSTRAINT payments_trust_transaction_id_fk
  FOREIGN KEY (trust_transaction_id) REFERENCES trust_transactions(id);

-- ─── 4. trust_reconciliations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_reconciliations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_account_id              UUID NOT NULL REFERENCES trust_bank_accounts(id),
  period_start                  DATE NOT NULL,
  period_end                    DATE NOT NULL,
  bank_statement_balance_cents  BIGINT,
  book_balance_cents            BIGINT,
  client_listing_total_cents    BIGINT,
  outstanding_deposits_cents    BIGINT DEFAULT 0,
  outstanding_cheques_cents     BIGINT DEFAULT 0,
  adjusted_bank_balance_cents   BIGINT,
  is_balanced                   BOOLEAN,
  status                        TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'reviewed', 'flagged')),
  completed_by                  UUID REFERENCES users(id),
  completed_at                  TIMESTAMPTZ,
  reviewed_by                   UUID REFERENCES users(id),
  reviewed_at                   TIMESTAMPTZ,
  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trust_account_id, period_start)
);

ALTER TABLE trust_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_reconciliations_tenant_isolation" ON trust_reconciliations
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER set_trust_reconciliations_updated_at
  BEFORE UPDATE ON trust_reconciliations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 5. trust_reconciliation_items ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_reconciliation_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reconciliation_id   UUID NOT NULL REFERENCES trust_reconciliations(id) ON DELETE CASCADE,
  item_type           TEXT NOT NULL
    CHECK (item_type IN (
      'outstanding_cheque', 'deposit_in_transit', 'bank_error',
      'book_error', 'unmatched_bank_item', 'unmatched_book_item', 'other'
    )),
  description         TEXT NOT NULL,
  amount_cents        BIGINT NOT NULL,
  transaction_id      UUID REFERENCES trust_transactions(id),
  resolved            BOOLEAN NOT NULL DEFAULT false,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_reconciliation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_reconciliation_items_tenant_isolation" ON trust_reconciliation_items
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 6. trust_holds ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_holds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_id      UUID NOT NULL UNIQUE REFERENCES trust_transactions(id),
  matter_id           UUID NOT NULL REFERENCES matters(id),
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  hold_start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hold_release_date   DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'released', 'cancelled')),
  released_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_holds_tenant_isolation" ON trust_holds
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 7. trust_audit_log (immutable) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  matter_id       UUID REFERENCES matters(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_audit_log_tenant_isolation" ON trust_audit_log
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 8. trust_disbursement_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_disbursement_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_account_id        UUID NOT NULL REFERENCES trust_bank_accounts(id),
  matter_id               UUID NOT NULL REFERENCES matters(id),
  amount_cents            BIGINT NOT NULL CHECK (amount_cents > 0),
  payee_name              TEXT NOT NULL,
  description             TEXT NOT NULL,
  client_description      TEXT,
  payment_method          TEXT NOT NULL
    CHECK (payment_method IN (
      'cheque', 'wire', 'eft', 'cash', 'bank_draft', 'interac', 'credit_card'
    )),
  reference_number        TEXT,
  invoice_id              UUID REFERENCES invoices(id),
  request_type            TEXT NOT NULL DEFAULT 'disbursement'
    CHECK (request_type IN ('disbursement', 'transfer', 'refund')),
  status                  TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'cancelled')),
  prepared_by             UUID NOT NULL REFERENCES users(id),
  prepared_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by             UUID REFERENCES users(id),
  approved_at             TIMESTAMPTZ,
  rejected_by             UUID REFERENCES users(id),
  rejection_reason        TEXT,
  trust_transaction_id    UUID REFERENCES trust_transactions(id),
  authorization_type      TEXT
    CHECK (authorization_type IS NULL OR authorization_type IN (
      'engagement_letter', 'settlement_direction', 'written_instruction', 'verbal_confirmed'
    )),
  authorization_ref       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_disbursement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_disbursement_requests_tenant_isolation" ON trust_disbursement_requests
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER set_trust_disbursement_requests_updated_at
  BEFORE UPDATE ON trust_disbursement_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 9. cheques (unified trust + operating) ────────────────────────────────

CREATE TABLE IF NOT EXISTS cheques (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_type                    TEXT NOT NULL
    CHECK (account_type IN ('trust', 'operating')),
  trust_account_id                UUID REFERENCES trust_bank_accounts(id),
  operating_account_id            UUID REFERENCES operating_bank_accounts(id),
  cheque_number                   INT NOT NULL,
  matter_id                       UUID REFERENCES matters(id),
  payee_name                      TEXT NOT NULL,
  amount_cents                    BIGINT NOT NULL,
  memo                            TEXT,
  status                          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'cleared', 'void', 'stale_dated', 'stop_payment')),
  issued_date                     DATE,
  cleared_date                    DATE,
  void_reason                     TEXT,
  voided_at                       TIMESTAMPTZ,
  voided_by                       UUID REFERENCES users(id),
  trust_transaction_id            UUID REFERENCES trust_transactions(id),
  trust_disbursement_request_id   UUID REFERENCES trust_disbursement_requests(id),
  prepared_by                     UUID NOT NULL REFERENCES users(id),
  approved_by                     UUID REFERENCES users(id),
  printed_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cheques_tenant_isolation" ON cheques
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER set_cheques_updated_at
  BEFORE UPDATE ON cheques
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Partial unique indexes for per-account cheque numbering
CREATE UNIQUE INDEX cheques_trust_account_number_unique
  ON cheques (tenant_id, trust_account_id, cheque_number)
  WHERE account_type = 'trust';

CREATE UNIQUE INDEX cheques_operating_account_number_unique
  ON cheques (tenant_id, operating_account_id, cheque_number)
  WHERE account_type = 'operating';

-- ─── 10. bank_feed_transactions (future-compat) ───────────────────────────

CREATE TABLE IF NOT EXISTS bank_feed_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id         UUID NOT NULL REFERENCES trust_bank_accounts(id),
  feed_source             TEXT NOT NULL
    CHECK (feed_source IN ('plaid', 'ofx_import', 'csv_import', 'manual')),
  external_txn_id         TEXT,
  amount_cents            BIGINT NOT NULL,
  txn_date                DATE NOT NULL,
  posted_date             DATE,
  description             TEXT,
  payee_name              TEXT,
  bank_reference          TEXT,
  raw_data                JSONB,
  import_batch_id         UUID,
  match_status            TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'auto_matched', 'manually_matched', 'excluded', 'duplicate')),
  matched_transaction_id  UUID REFERENCES trust_transactions(id),
  matched_at              TIMESTAMPTZ,
  matched_by              UUID REFERENCES users(id),
  excluded_reason         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bank_feed_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_feed_transactions_tenant_isolation" ON bank_feed_transactions
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE UNIQUE INDEX bank_feed_transactions_dedup
  ON bank_feed_transactions (tenant_id, bank_account_id, external_txn_id)
  WHERE external_txn_id IS NOT NULL;

-- ─── 11. qbo_sync_mappings (future-compat) ────────────────────────────────

CREATE TABLE IF NOT EXISTS qbo_sync_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  norva_entity_type   TEXT NOT NULL,
  norva_entity_id     UUID NOT NULL,
  qbo_entity_type     TEXT NOT NULL,
  qbo_entity_id       TEXT,
  sync_direction      TEXT NOT NULL DEFAULT 'push'
    CHECK (sync_direction IN ('push', 'pull', 'bidirectional')),
  sync_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'error', 'stale')),
  last_synced_at      TIMESTAMPTZ,
  sync_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qbo_sync_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbo_sync_mappings_tenant_isolation" ON qbo_sync_mappings
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 12. qbo_sync_log (future-compat) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS qbo_sync_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_id          UUID REFERENCES qbo_sync_mappings(id) ON DELETE SET NULL,
  action              TEXT NOT NULL,
  status              TEXT NOT NULL,
  error               TEXT,
  request_payload     JSONB,
  response_payload    JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qbo_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbo_sync_log_tenant_isolation" ON qbo_sync_log
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Trigger: trust_transactions  -  compute running balance + overdraft check

CREATE OR REPLACE FUNCTION trust_transactions_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  prev_balance BIGINT;
  new_balance BIGINT;
  is_admin BOOLEAN;
BEGIN
  -- Get the previous running balance for this matter on this account
  -- Use FOR UPDATE to serialize concurrent inserts for the same matter
  SELECT running_balance_cents INTO prev_balance
  FROM trust_transactions
  WHERE tenant_id = NEW.tenant_id
    AND matter_id = NEW.matter_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF prev_balance IS NULL THEN
    prev_balance := 0;
  END IF;

  new_balance := prev_balance + NEW.amount_cents;

  -- Check if this is an admin matter (allowed to go negative)
  SELECT m.is_trust_admin INTO is_admin
  FROM matters m
  WHERE m.id = NEW.matter_id;

  -- Overdraft prevention: client matters cannot go negative
  IF is_admin IS NOT TRUE AND new_balance < 0 THEN
    RAISE EXCEPTION 'Trust ledger balance cannot go negative for client matter %. Current balance: % cents, attempted: % cents.',
      NEW.matter_id, prev_balance, NEW.amount_cents;
  END IF;

  NEW.running_balance_cents := new_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_transactions_compute_balance
  BEFORE INSERT ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION trust_transactions_before_insert();

-- ─── Trigger: trust_transactions  -  immutability (no UPDATE or DELETE)

CREATE OR REPLACE FUNCTION trust_transactions_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Trust transactions are immutable. Use reversal entries for corrections.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_transactions_no_update
  BEFORE UPDATE ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION trust_transactions_immutable();

CREATE TRIGGER trust_transactions_no_delete
  BEFORE DELETE ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION trust_transactions_immutable();

-- ─── Trigger: trust_transactions  -  sync matters.trust_balance

CREATE OR REPLACE FUNCTION trust_transactions_sync_matter_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE matters
  SET trust_balance = NEW.running_balance_cents / 100.0
  WHERE id = NEW.matter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_transactions_after_insert_sync
  AFTER INSERT ON trust_transactions
  FOR EACH ROW EXECUTE FUNCTION trust_transactions_sync_matter_balance();

-- ─── Trigger: trust_audit_log  -  immutability

CREATE OR REPLACE FUNCTION trust_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Trust audit log entries are immutable.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_audit_log_no_update
  BEFORE UPDATE ON trust_audit_log
  FOR EACH ROW EXECUTE FUNCTION trust_audit_log_immutable();

CREATE TRIGGER trust_audit_log_no_delete
  BEFORE DELETE ON trust_audit_log
  FOR EACH ROW EXECUTE FUNCTION trust_audit_log_immutable();

-- ─── Trigger: trust_reconciliations  -  reviewed reconciliations are immutable

CREATE OR REPLACE FUNCTION trust_reconciliations_protect_reviewed()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'reviewed' THEN
    RAISE EXCEPTION 'Reviewed reconciliations cannot be deleted.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'reviewed' THEN
    RAISE EXCEPTION 'Reviewed reconciliations cannot be modified.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_reconciliations_protect
  BEFORE UPDATE OR DELETE ON trust_reconciliations
  FOR EACH ROW EXECUTE FUNCTION trust_reconciliations_protect_reviewed();

-- ─── Trigger: trust_bank_accounts  -  auto-create admin matter

CREATE OR REPLACE FUNCTION trust_bank_accounts_create_admin_matter()
RETURNS TRIGGER AS $$
DECLARE
  admin_id UUID;
BEGIN
  INSERT INTO matters (
    tenant_id, title, status, is_trust_admin, billing_type
  ) VALUES (
    NEW.tenant_id,
    'Trust Admin  -  ' || NEW.account_name,
    'active',
    true,
    'flat_fee'
  )
  RETURNING id INTO admin_id;

  -- Update the trust bank account with the admin matter id
  NEW.admin_matter_id := admin_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Use BEFORE INSERT so we can set admin_matter_id on the NEW row
CREATE TRIGGER trust_bank_accounts_auto_admin_matter
  BEFORE INSERT ON trust_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION trust_bank_accounts_create_admin_matter();

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_trust_transactions_matter_date
  ON trust_transactions (tenant_id, matter_id, effective_date DESC);

CREATE INDEX idx_trust_transactions_account_date
  ON trust_transactions (tenant_id, trust_account_id, effective_date);

CREATE INDEX idx_trust_transactions_matter_created
  ON trust_transactions (matter_id, created_at DESC);

CREATE INDEX idx_trust_transactions_uncleared
  ON trust_transactions (hold_release_date)
  WHERE is_cleared = false;

CREATE INDEX idx_trust_holds_active
  ON trust_holds (tenant_id, status)
  WHERE status = 'held';

CREATE INDEX idx_trust_audit_log_entity
  ON trust_audit_log (tenant_id, entity_type, entity_id);

CREATE INDEX idx_trust_disbursement_requests_matter
  ON trust_disbursement_requests (tenant_id, matter_id, status);

CREATE INDEX idx_cheques_account_status
  ON cheques (tenant_id, trust_account_id, status)
  WHERE account_type = 'trust';

CREATE INDEX idx_trust_reconciliations_account
  ON trust_reconciliations (tenant_id, trust_account_id, period_start DESC);
