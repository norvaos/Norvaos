-- =============================================================================
-- Migration 110: tenant_onboarding
--
-- Replaces the file-based onboarding tracker (data/onboarding/{tenantId}.json)
-- with a shared, durable DB table suitable for multi-instance and serverless
-- deployments.
--
-- Team 3 / Priority 2  -  DB-backed onboarding tracker
-- Date: 2026-03-16
-- =============================================================================

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_onboarding (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase       text        NOT NULL
                            CHECK (phase IN (
                              'account_creation',
                              'configuration',
                              'user_setup',
                              'integration_setup',
                              'data_migration',
                              'training',
                              'go_live_verification'
                            )),
  status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending',
                              'in_progress',
                              'complete',
                              'skipped'
                            )),
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT tenant_onboarding_tenant_phase_key UNIQUE (tenant_id, phase)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Primary lookup: all phases for a tenant (covers most queries)
CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant_id
  ON tenant_onboarding (tenant_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_onboarding ENABLE ROW LEVEL SECURITY;

-- Service-layer writes use the service-role client (bypasses RLS).
-- This policy protects any user-context reads from crossing tenant boundaries.
CREATE POLICY "tenant_onboarding_tenant_isolation"
  ON tenant_onboarding
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS tenant_onboarding;
--
-- Also revert lib/services/support/onboarding-tracker.ts to the file-based
-- implementation at the same time. The two are coupled.
-- =============================================================================
