-- ============================================================
-- 113-workplace-shell-tables.sql
-- Creates stage_transition_log and matter_risk_flags tables
-- per NorvaOS spec Sections 8 and 14
-- ============================================================

-- ── stage_transition_log ─────────────────────────────────────
-- Immutable record of every stage change on every matter.
-- Written by the advance-stage API route on each transition.

CREATE TABLE IF NOT EXISTS stage_transition_log (
  id                uuid        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  from_stage_id     uuid        REFERENCES matter_stages(id),
  to_stage_id       uuid        REFERENCES matter_stages(id),
  from_stage_name   text,
  to_stage_name     text,
  transition_type   text        NOT NULL DEFAULT 'advance',
  -- 'advance' | 'return_for_correction' | 'override' | 'reassignment'
  override_reason   text,
  gate_snapshot     jsonb       NOT NULL DEFAULT '{}',
  transitioned_by   uuid        REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stage_transition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stl_tenant_select" ON stage_transition_log
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "stl_tenant_insert" ON stage_transition_log
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stl_matter_id  ON stage_transition_log(matter_id);
CREATE INDEX IF NOT EXISTS idx_stl_created_at ON stage_transition_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stl_tenant_id  ON stage_transition_log(tenant_id);

-- ── matter_risk_flags ───────────────────────────────────────
-- Named risk flags per spec Section 14.
-- 12 flag types, explicit owner, severity, and resolution lifecycle.

CREATE TABLE IF NOT EXISTS matter_risk_flags (
  id               uuid        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  matter_id        uuid        NOT NULL REFERENCES matters(id)  ON DELETE CASCADE,
  flag_type        text        NOT NULL,
  severity         text        NOT NULL DEFAULT 'advisory',
  detected_at      timestamptz NOT NULL DEFAULT now(),
  detected_by      text        NOT NULL DEFAULT 'system',
  status           text        NOT NULL DEFAULT 'open',
  resolution_note  text,
  resolved_by      uuid        REFERENCES users(id),
  resolved_at      timestamptz,
  override_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE matter_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mrf_tenant_select" ON matter_risk_flags
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "mrf_tenant_insert" ON matter_risk_flags
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "mrf_tenant_update" ON matter_risk_flags
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_mrf_matter_id ON matter_risk_flags(matter_id);
CREATE INDEX IF NOT EXISTS idx_mrf_status    ON matter_risk_flags(status);
CREATE INDEX IF NOT EXISTS idx_mrf_severity  ON matter_risk_flags(severity);
