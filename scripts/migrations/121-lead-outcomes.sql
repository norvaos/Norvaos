CREATE TABLE IF NOT EXISTS lead_outcomes (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  outcome         TEXT        NOT NULL,
  -- RETAIN | FOLLOW_UP | NOT_QUALIFIED | REFERRED_OUT | NO_SHOW | DECLINED | DUPLICATE
  outcome_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  follow_up_date  DATE,
  referral_target TEXT,
  duplicate_of    UUID        REFERENCES contacts(id),
  actioned_by     UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_outcomes_lead_id   ON lead_outcomes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_outcomes_tenant_id ON lead_outcomes(tenant_id);
ALTER TABLE lead_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_outcomes_tenant" ON lead_outcomes
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
