CREATE TABLE IF NOT EXISTS matter_sla_tracking (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id    UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  sla_class    TEXT        NOT NULL,
  -- CLIENT_RESPONSE | DOCUMENT_REVIEW | LAWYER_REVIEW | BILLING_CLEARANCE | FILING | IRCC_RESPONSE
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at       TIMESTAMPTZ NOT NULL,
  breached_at  TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running',
  -- running | completed | breached | cancelled
  completed_at TIMESTAMPTZ,
  context_ref  TEXT,         -- optional reference (e.g. 'stage:Application Submitted')
  created_by   UUID        REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_matter_id ON matter_sla_tracking(matter_id);
CREATE INDEX IF NOT EXISTS idx_sla_tenant_id ON matter_sla_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sla_status    ON matter_sla_tracking(status);
CREATE INDEX IF NOT EXISTS idx_sla_due_at    ON matter_sla_tracking(due_at);
ALTER TABLE matter_sla_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_tracking_tenant" ON matter_sla_tracking
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
