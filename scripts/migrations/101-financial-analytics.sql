-- ============================================================================
-- Migration 101: Financial Analytics & Firm Intelligence (Phase 8)
-- ============================================================================
--
-- New tables:
--   1. collection_actions      -  follow-up actions on overdue invoices
--   2. payment_plans           -  instalment plans for overdue invoices
--   3. revenue_snapshots       -  daily materialized metric snapshots
--
-- Amended tables:
--   users  -  add cost_rate_cents, utilization_target_hours
--   invoices  -  add aging_bucket, aging_updated_at
--
-- ============================================================================

-- ─── 1. collection_actions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_actions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  matter_id         UUID REFERENCES matters(id),
  action_type       VARCHAR(50) NOT NULL
                    CHECK (action_type IN (
                      'reminder_sent','phone_call','email_sent',
                      'demand_letter','payment_plan_offered',
                      'write_off_requested','write_off_approved','write_off_rejected',
                      'escalated','note'
                    )),
  notes             TEXT,
  performed_by      UUID NOT NULL REFERENCES users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_follow_up_date DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE collection_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection_actions_tenant_isolation" ON collection_actions
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX idx_collection_actions_invoice ON collection_actions(invoice_id);
CREATE INDEX idx_collection_actions_tenant_date ON collection_actions(tenant_id, performed_at DESC);
CREATE INDEX idx_collection_actions_follow_up ON collection_actions(next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL AND is_active = true;

-- ─── 2. payment_plans ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_plans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  invoice_id            UUID NOT NULL REFERENCES invoices(id),
  matter_id             UUID REFERENCES matters(id),
  client_contact_id     UUID NOT NULL REFERENCES contacts(id),
  total_amount_cents    BIGINT NOT NULL CHECK (total_amount_cents > 0),
  instalment_amount_cents BIGINT NOT NULL CHECK (instalment_amount_cents > 0),
  frequency             VARCHAR(20) NOT NULL
                        CHECK (frequency IN ('weekly','biweekly','monthly')),
  start_date            DATE NOT NULL,
  next_due_date         DATE NOT NULL,
  instalments_paid      INTEGER NOT NULL DEFAULT 0,
  instalments_total     INTEGER NOT NULL CHECK (instalments_total > 0),
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','defaulted','cancelled')),
  created_by            UUID NOT NULL REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_plans_tenant_isolation" ON payment_plans
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX idx_payment_plans_invoice ON payment_plans(invoice_id);
CREATE INDEX idx_payment_plans_tenant_status ON payment_plans(tenant_id, status);
CREATE INDEX idx_payment_plans_next_due ON payment_plans(next_due_date)
  WHERE status = 'active';

-- ─── 3. revenue_snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  snapshot_date         DATE NOT NULL,
  practice_area_id      UUID REFERENCES practice_areas(id),
  total_billed_cents    BIGINT NOT NULL DEFAULT 0,
  total_collected_cents BIGINT NOT NULL DEFAULT 0,
  total_wip_cents       BIGINT NOT NULL DEFAULT 0,
  total_outstanding_cents BIGINT NOT NULL DEFAULT 0,
  matter_count          INTEGER NOT NULL DEFAULT 0,
  active_matter_count   INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_snapshots_tenant_isolation" ON revenue_snapshots
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Unique constraint: one snapshot per tenant + date + practice area
CREATE UNIQUE INDEX idx_revenue_snapshots_unique
  ON revenue_snapshots(tenant_id, snapshot_date, COALESCE(practice_area_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX idx_revenue_snapshots_tenant_date ON revenue_snapshots(tenant_id, snapshot_date DESC);

-- Immutability trigger: snapshots cannot be updated or deleted
CREATE OR REPLACE FUNCTION revenue_snapshots_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Revenue snapshots are immutable. Corrections appear as next-day snapshots.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_revenue_snapshots_no_update
  BEFORE UPDATE ON revenue_snapshots
  FOR EACH ROW EXECUTE FUNCTION revenue_snapshots_immutable();

CREATE TRIGGER trg_revenue_snapshots_no_delete
  BEFORE DELETE ON revenue_snapshots
  FOR EACH ROW EXECUTE FUNCTION revenue_snapshots_immutable();

-- ─── 4. Amend users  -  cost rate + utilization target ───────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS cost_rate_cents BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utilization_target_hours NUMERIC(5,1) DEFAULT 0;

-- ─── 5. Amend invoices  -  aging classification ──────────────────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS aging_bucket VARCHAR(20) DEFAULT 'current'
  CHECK (aging_bucket IN ('current','31_60','61_90','91_120','120_plus'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS aging_updated_at TIMESTAMPTZ;

-- Index for aging queries
CREATE INDEX IF NOT EXISTS idx_invoices_aging ON invoices(tenant_id, aging_bucket)
  WHERE status NOT IN ('paid','cancelled','draft');

-- ─── 6. Write-off approval trigger ─────────────────────────────────────────
-- Write-offs require partner approval (preparer != approver pattern)
-- This is enforced at the service/API layer (same as trust disbursements)
-- No DB trigger needed  -  the collection_actions table logs both
-- write_off_requested and write_off_approved as separate entries

-- ============================================================================
-- Done. 3 new tables, 2 amended tables, 3 RLS policies, 7 indexes,
-- 1 trigger function (immutability), 2 triggers.
-- ============================================================================
