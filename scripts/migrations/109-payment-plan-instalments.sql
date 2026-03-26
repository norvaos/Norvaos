-- ============================================================================
-- Migration 109  -  Payment Plan Instalments
-- ============================================================================
-- Adds:
--   1. payment_plan_instalments table  -  individual instalment schedule records
--   2. payments.instalment_id  -  nullable FK linking a payment to an instalment
--   3. Partial UNIQUE index: one active payment plan per invoice at a time
--   4. invoice_audit_log event_type CHECK extended with payment plan events
--
-- Pre-apply checks (verified 2026-03-16):
--   SELECT COUNT(*) FROM payment_plans;  → 0 rows  -  partial UNIQUE index safe
--   payments.instalment_id is a new column  -  no existing data affected
--
-- Overdue state is query-time only: status='pending' AND due_date < CURRENT_DATE
-- No stored 'overdue' status  -  approved per workstream scope decision.
-- ============================================================================

-- ── 1. payment_plan_instalments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_plan_instalments (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id),
  payment_plan_id     uuid        NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  invoice_id          uuid        NOT NULL REFERENCES invoices(id),
  instalment_number   integer     NOT NULL CHECK (instalment_number > 0),
  due_date            date        NOT NULL,
  amount_cents        bigint      NOT NULL CHECK (amount_cents > 0),
  -- 'overdue' is NOT stored  -  derived at query time: status='pending' AND due_date < CURRENT_DATE
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_id          uuid        REFERENCES payments(id),   -- set when status becomes 'paid'
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_plan_id, instalment_number)
);

ALTER TABLE payment_plan_instalments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_plan_instalments_tenant_isolation
  ON payment_plan_instalments FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ppi_plan
  ON payment_plan_instalments(payment_plan_id);

CREATE INDEX IF NOT EXISTS idx_ppi_invoice
  ON payment_plan_instalments(invoice_id);

-- Partial index for efficient pending/overdue lookups
CREATE INDEX IF NOT EXISTS idx_ppi_due_pending
  ON payment_plan_instalments(due_date)
  WHERE status = 'pending';

CREATE TRIGGER set_payment_plan_instalments_updated_at
  BEFORE UPDATE ON payment_plan_instalments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. payments.instalment_id ─────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS instalment_id uuid REFERENCES payment_plan_instalments(id);

CREATE INDEX IF NOT EXISTS idx_payments_instalment_id
  ON payments(instalment_id)
  WHERE instalment_id IS NOT NULL;

-- ── 3. One active plan per invoice ────────────────────────────────────────────
-- Prevents creating a second active payment plan while one already exists.
-- A new plan may be created once the prior plan reaches 'cancelled' or 'completed'.

CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_one_active_per_invoice
  ON payment_plans(invoice_id)
  WHERE (status = 'active');

-- ── 4. Extend invoice_audit_log event_type CHECK ──────────────────────────────
-- Drop and recreate  -  PostgreSQL does not support ALTER CONSTRAINT on CHECK.
-- Adds: payment_plan_created, payment_plan_approved, payment_plan_cancelled,
--       payment_plan_completed, instalment_paid

ALTER TABLE invoice_audit_log
  DROP CONSTRAINT IF EXISTS invoice_audit_log_event_type_check;

ALTER TABLE invoice_audit_log
  ADD CONSTRAINT invoice_audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'created', 'draft_saved', 'line_added', 'line_edited', 'line_deleted',
    'adjustment_added', 'adjustment_approved', 'adjustment_rejected',
    'finalized', 'sent', 'resent', 'delivery_failed',
    'payment_recorded', 'payment_voided',
    'trust_applied', 'trust_confirmed', 'trust_rejected', 'trust_cancelled',
    'voided', 'status_changed', 'pdf_downloaded', 'viewed', 'template_applied',
    'payment_plan_created', 'payment_plan_approved',
    'payment_plan_cancelled', 'payment_plan_completed',
    'instalment_paid'
  ]));
