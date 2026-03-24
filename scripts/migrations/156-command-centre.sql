-- Migration 156: Command Centre — Live Intake Sessions & Compliance Bypass Log
--
-- Supports:
--   1. Live Intake Sessions (AI transcription, entity extraction, stream recommendation)
--   2. Compliance Gate bypass audit trail
--   3. Onboarding factory tracking (portal birth, blueprint injection, fee freeze)

-- ─── 1. Intake Sessions ──────────────────────────────────────────────────────
-- Stores each live intake transcription session. Raw audio is NEVER persisted
-- (privacy-first policy). Only the final transcript text and extracted entities
-- are retained. Linked to a lead for pre-conversion enrichment.

CREATE TABLE IF NOT EXISTS intake_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  lead_id       UUID NOT NULL REFERENCES leads(id),
  user_id       UUID REFERENCES users(id),

  -- Transcript
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'finalised', 'cancelled')),
  transcript    TEXT,                         -- Final transcription text (no raw audio stored)
  summary       TEXT,                         -- AI-generated summary of the session

  -- Entity extraction results (auto-fills lead_metadata fields)
  extracted_entities JSONB DEFAULT '{}',      -- { names: [], dates: [], jobs: [], facts: [] }

  -- AI recommendation
  suggested_stream   TEXT,                    -- e.g. "Spousal Sponsorship"
  suggested_matter_type_id UUID REFERENCES matter_types(id),
  recommendation_confidence DECIMAL(5,2),     -- 0.00–100.00

  -- Timestamps
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalised_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_sessions_tenant_isolation ON intake_sessions
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_intake_sessions_lead ON intake_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_tenant ON intake_sessions(tenant_id);

-- ─── 2. Compliance Bypass Log ────────────────────────────────────────────────
-- When a lawyer bypasses the retainer gate (emergency case), the reason is
-- recorded here for the audit trail. Only 'owner' role can bypass.

CREATE TABLE IF NOT EXISTS compliance_bypass_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  lead_id       UUID NOT NULL REFERENCES leads(id),
  matter_id     UUID REFERENCES matters(id),
  user_id       UUID NOT NULL REFERENCES users(id),

  gate_name     TEXT NOT NULL,                -- e.g. 'retainer_signed'
  bypass_reason TEXT NOT NULL,                -- Required text explanation
  user_role     TEXT NOT NULL,                -- Role at time of bypass (for audit)

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE compliance_bypass_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_bypass_tenant_isolation ON compliance_bypass_log
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_compliance_bypass_lead ON compliance_bypass_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_compliance_bypass_matter ON compliance_bypass_log(matter_id);

-- ─── 3. Onboarding factory tracking ─────────────────────────────────────────
-- Tracks the 3-second onboarding sequence steps for each matter conversion.

CREATE TABLE IF NOT EXISTS onboarding_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  matter_id     UUID NOT NULL REFERENCES matters(id),
  lead_id       UUID REFERENCES leads(id),
  user_id       UUID REFERENCES users(id),

  -- Step statuses
  fee_snapshot_status     TEXT NOT NULL DEFAULT 'pending'
                          CHECK (fee_snapshot_status IN ('pending', 'completed', 'failed', 'skipped')),
  portal_creation_status  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (portal_creation_status IN ('pending', 'completed', 'failed', 'skipped')),
  blueprint_injection_status TEXT NOT NULL DEFAULT 'pending'
                          CHECK (blueprint_injection_status IN ('pending', 'completed', 'failed', 'skipped')),

  -- Results
  portal_link_id          UUID REFERENCES portal_links(id),
  document_slots_created  INTEGER DEFAULT 0,
  fee_snapshot_data       JSONB,
  error_log               JSONB DEFAULT '[]',

  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_runs_tenant_isolation ON onboarding_runs
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_onboarding_runs_matter ON onboarding_runs(matter_id);

-- ─── 4. Add lead_metadata column to leads (for entity extraction target) ────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN leads.lead_metadata IS 'Structured data extracted from intake sessions. Keys: married_date, occupation, employer, children_count, etc.';
