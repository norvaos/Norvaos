-- =============================================================================
-- Migration 111: tenant_onboarding_wizard
--
-- Stores the full onboarding wizard state for each tenant.
-- Enables: save/resume, idempotent activation, Default vs Custom mode,
-- and a clear audit trail of what was configured at go-live.
--
-- Design decisions:
--   • One row per tenant (UNIQUE tenant_id) — the wizard is a singleton.
--   • answers JSONB — typed by WizardAnswers in lib/types/onboarding.ts.
--   • activation_log JSONB — array of { action, applied_at, ok, error? }.
--     Records every config action applied, enabling idempotency on re-run.
--   • status enum: draft → activated (or default_applied for fast path).
--
-- Idempotency:
--   The activation endpoint reads activation_log before applying each action.
--   If an action key already appears in activation_log with ok:true, it is
--   skipped. This makes re-running activate() safe at any point.
--
-- Team: New-Client Onboarding Stream
-- Date: 2026-03-16
-- =============================================================================

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_onboarding_wizard (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Which path the tenant chose.
  mode              text        NOT NULL DEFAULT 'draft'
                                  CHECK (mode IN ('draft', 'default', 'custom')),

  -- Wizard completion status.
  status            text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN (
                                    'draft',          -- wizard in progress
                                    'activated',      -- custom wizard fully applied
                                    'default_applied' -- default preset applied
                                  )),

  -- Current step index (0-based). Custom wizard has 15 steps (0–14).
  current_step      int         NOT NULL DEFAULT 0,

  -- All collected answers, keyed by step name (see WizardAnswers in database.ts).
  answers           jsonb       NOT NULL DEFAULT '{}',

  -- Idempotency log: array of { action: string, applied_at: string, ok: boolean, error?: string }.
  -- Written by the activation endpoint. Re-activation skips entries where ok = true.
  activation_log    jsonb       NOT NULL DEFAULT '[]',

  -- Who activated and when.
  activated_at      timestamptz,
  activated_by      uuid        REFERENCES users(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_onboarding_wizard_tenant_key UNIQUE (tenant_id)
);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_onboarding_wizard_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_onboarding_wizard_updated_at
  BEFORE UPDATE ON tenant_onboarding_wizard
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_wizard_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onboarding_wizard_tenant_id
  ON tenant_onboarding_wizard (tenant_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_wizard_status
  ON tenant_onboarding_wizard (status);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_onboarding_wizard ENABLE ROW LEVEL SECURITY;

-- Client reads: tenant-scoped users can read their own wizard row.
CREATE POLICY "onboarding_wizard_select"
  ON tenant_onboarding_wizard FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Service-layer writes use the admin client (bypasses RLS).
-- No INSERT/UPDATE policies needed for user-context — all mutations go through
-- the API layer which uses the service-role key.

-- =============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS tenant_onboarding_wizard CASCADE;
--   DROP FUNCTION IF EXISTS set_onboarding_wizard_updated_at CASCADE;
-- =============================================================================
