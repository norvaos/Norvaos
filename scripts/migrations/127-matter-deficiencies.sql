-- Migration 127: matter_deficiencies
-- Implements full deficiency workflow for legal review cycle.
-- Sprint 6, Week 1 — 2026-03-17

CREATE TABLE IF NOT EXISTS matter_deficiencies (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id               UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  stage_id                UUID        REFERENCES matter_stages(id) ON DELETE SET NULL,
  created_by              UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to_user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  severity                TEXT        NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  category                TEXT        NOT NULL,
  -- e.g. 'document_quality', 'questionnaire_inconsistency', 'missing_information',
  --      'legal_review_issue', 'compliance_failure', 'other'
  description             TEXT        NOT NULL CHECK (char_length(description) >= 50),
  status                  TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'reopened')),
  reopen_count            INTEGER     NOT NULL DEFAULT 0,
  chronic_flag            BOOLEAN     NOT NULL DEFAULT false,
  resolution_notes        TEXT,
  resolution_evidence_path TEXT,       -- storage path to uploaded evidence
  resolved_at             TIMESTAMPTZ,
  resolved_by             UUID        REFERENCES users(id) ON DELETE SET NULL,
  reopened_at             TIMESTAMPTZ,
  reopened_by             UUID        REFERENCES users(id) ON DELETE SET NULL,
  chronic_escalated_at    TIMESTAMPTZ,
  chronic_escalated_to    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_md_matter_id   ON matter_deficiencies(matter_id);
CREATE INDEX IF NOT EXISTS idx_md_tenant_id   ON matter_deficiencies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_md_status      ON matter_deficiencies(status) WHERE status IN ('open', 'in_progress', 'reopened');
CREATE INDEX IF NOT EXISTS idx_md_severity    ON matter_deficiencies(severity);
CREATE INDEX IF NOT EXISTS idx_md_chronic     ON matter_deficiencies(chronic_flag) WHERE chronic_flag = true;
CREATE INDEX IF NOT EXISTS idx_md_assigned    ON matter_deficiencies(assigned_to_user_id);

-- RLS
ALTER TABLE matter_deficiencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "md_tenant_select" ON matter_deficiencies
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "md_tenant_insert" ON matter_deficiencies
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "md_tenant_update" ON matter_deficiencies
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION update_matter_deficiencies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_md_updated_at
  BEFORE UPDATE ON matter_deficiencies
  FOR EACH ROW EXECUTE FUNCTION update_matter_deficiencies_updated_at();

COMMENT ON TABLE matter_deficiencies IS
  'Tracks legal review deficiencies raised against matters. Supports full lifecycle: open → in_progress → resolved → closed. Reopen tracking and chronic escalation built in. Sprint 6 remediation.';
