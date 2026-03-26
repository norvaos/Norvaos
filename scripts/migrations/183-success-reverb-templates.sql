-- ============================================================================
-- Migration 183 — Success-Reverb Gold Standard Templates
-- ============================================================================
-- Stores reverse-engineered metadata from approved matters as Gold Standard
-- Templates. When a new matter with the same case type is created, the system
-- can suggest: "This structure resulted in a 14-day approval for [Name].
-- Apply these metadata markers?"
-- ============================================================================

-- ── Table: gold_standard_templates ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gold_standard_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  source_matter_id UUID NOT NULL REFERENCES matters(id),
  case_type       TEXT NOT NULL DEFAULT 'general',
  matter_type_name TEXT,
  readability_score NUMERIC(5,2) DEFAULT 0,
  grade           TEXT DEFAULT 'C',
  keyword_density JSONB DEFAULT '{}'::jsonb,
  document_structure JSONB DEFAULT '[]'::jsonb,
  zone_coverage   JSONB DEFAULT '{}'::jsonb,
  days_to_approval INTEGER,
  playbook_id     UUID,
  playbook_title  TEXT,
  applicant_redacted TEXT DEFAULT '[Applicant]',
  approved_at     TIMESTAMPTZ,
  extracted_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  is_active       BOOLEAN DEFAULT true
);

-- ── Add acknowledged_at and acknowledged_by to case_law_alerts ──────────────
-- Required by the Drift-Blocker (Directive 1.5) for alert acknowledgement.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'case_law_alerts' AND column_name = 'acknowledged_at') THEN
    ALTER TABLE case_law_alerts ADD COLUMN acknowledged_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'case_law_alerts' AND column_name = 'acknowledged_by') THEN
    ALTER TABLE case_law_alerts ADD COLUMN acknowledged_by UUID REFERENCES users(id);
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE gold_standard_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY gold_standard_templates_tenant_rls ON gold_standard_templates
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gst_tenant_case_type
  ON gold_standard_templates(tenant_id, case_type);

CREATE INDEX IF NOT EXISTS idx_gst_source_matter
  ON gold_standard_templates(source_matter_id);
