CREATE TABLE IF NOT EXISTS matter_billing_milestones (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  amount_cents    INTEGER     NOT NULL DEFAULT 0,
  due_date        DATE,
  status          TEXT        NOT NULL DEFAULT 'pending',
  -- pending | complete | billed | cancelled
  completed_at    TIMESTAMPTZ,
  billed_at       TIMESTAMPTZ,
  invoice_id      UUID        REFERENCES invoices(id),
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mbm_matter_id ON matter_billing_milestones(matter_id);
CREATE INDEX IF NOT EXISTS idx_mbm_tenant_id ON matter_billing_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mbm_status    ON matter_billing_milestones(status);
ALTER TABLE matter_billing_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mbm_tenant_policy" ON matter_billing_milestones
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
