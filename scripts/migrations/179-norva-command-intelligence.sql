/**
 * Migration 179  -  Norva Command Intelligence Suite
 *
 * Tables:
 *   1. norva_ear_sessions    -  Consultation Co-Pilot recordings + transcripts
 *   2. audit_optimizer_scans          -  Audit-Optimizer: Pre-submission IRCC AI-readability audits (table name retained)
 *   3. case_law_alerts        -  Jurisdictional Drift Sentry (CanLII monitoring)
 *
 * All tables: RLS-enabled, tenant-isolated, soft-delete where applicable.
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Norva Ear Sessions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS norva_ear_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT,
  status          TEXT NOT NULL DEFAULT 'recording'
                    CHECK (status IN ('recording', 'processing', 'completed', 'failed')),
  -- Consent Guard: recording cannot proceed without explicit consent
  consent_granted    BOOLEAN NOT NULL DEFAULT false,
  consent_granted_at TIMESTAMPTZ,
  consent_method     TEXT CHECK (consent_method IN ('verbal', 'written', 'digital', 'pre_authorized')),
  participants       TEXT[] DEFAULT '{}',
  duration_seconds   INTEGER,
  transcript         TEXT,
  extracted_facts    JSONB DEFAULT '[]'::jsonb,
  anchored_fields    JSONB DEFAULT '{}'::jsonb,  -- fields auto-populated into matter
  raw_audio_path     TEXT,                        -- Supabase Storage path
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_norva_ear_tenant     ON norva_ear_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_norva_ear_matter     ON norva_ear_sessions (matter_id);
CREATE INDEX IF NOT EXISTS idx_norva_ear_user       ON norva_ear_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_norva_ear_status     ON norva_ear_sessions (status);

ALTER TABLE norva_ear_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY norva_ear_sessions_tenant_isolation ON norva_ear_sessions
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Audit-Optimizer Scans (Pre-Submission IRCC Readability Audit)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_optimizer_scans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  document_id       UUID,  -- optional FK to documents table
  scanned_by        UUID NOT NULL REFERENCES users(id),
  readability_score NUMERIC(5,2),  -- 0.00–100.00
  keyword_coverage  JSONB DEFAULT '{}'::jsonb,
  structure_issues  JSONB DEFAULT '[]'::jsonb,
  recommendations   JSONB DEFAULT '[]'::jsonb,
  metadata_zones    JSONB DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'scanning', 'completed', 'failed')),
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_optimizer_tenant  ON audit_optimizer_scans (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_optimizer_matter  ON audit_optimizer_scans (matter_id);
CREATE INDEX IF NOT EXISTS idx_audit_optimizer_status  ON audit_optimizer_scans (status);

ALTER TABLE audit_optimizer_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_optimizer_scans_tenant_isolation ON audit_optimizer_scans
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Case Law Alerts (Jurisdictional Drift Sentry)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS case_law_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type         TEXT NOT NULL DEFAULT 'case_law_change'
                       CHECK (alert_type IN ('case_law_change', 'policy_update', 'regulation_change')),
  title              TEXT NOT NULL,
  summary            TEXT,
  source_url         TEXT,
  source_citation    TEXT,
  court              TEXT,  -- e.g. 'Federal Court', 'Federal Court of Appeal', 'IRB'
  jurisdiction       TEXT DEFAULT 'federal',
  practice_area_id   UUID REFERENCES practice_areas(id) ON DELETE SET NULL,
  keywords           TEXT[] DEFAULT '{}',
  relevance_score    NUMERIC(5,2),
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by        UUID REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  affected_matter_ids UUID[] DEFAULT '{}',
  raw_data           JSONB DEFAULT '{}'::jsonb,
  decision_date      DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_law_tenant   ON case_law_alerts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_law_status   ON case_law_alerts (status);
CREATE INDEX IF NOT EXISTS idx_case_law_practice ON case_law_alerts (practice_area_id);
CREATE INDEX IF NOT EXISTS idx_case_law_keywords ON case_law_alerts USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_case_law_date     ON case_law_alerts (decision_date DESC);

ALTER TABLE case_law_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_law_alerts_tenant_isolation ON case_law_alerts
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );
