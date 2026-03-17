CREATE TABLE IF NOT EXISTS ircc_correspondence (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id      UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  item_type      TEXT        NOT NULL,
  -- AOR | biometrics_request | medical_request | additional_docs_request | decision_notice | refusal | other
  item_date      DATE,
  status         TEXT        NOT NULL DEFAULT 'pending',
  -- pending | received | actioned | archived
  decision_type  TEXT,
  -- approved | refused | returned | withdrawn (for decision_notice items)
  notes          TEXT,
  document_path  TEXT,
  created_by     UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ircc_correspondence_matter_id ON ircc_correspondence(matter_id);
CREATE INDEX IF NOT EXISTS idx_ircc_correspondence_tenant_id ON ircc_correspondence(tenant_id);
ALTER TABLE ircc_correspondence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ircc_correspondence_tenant" ON ircc_correspondence
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
