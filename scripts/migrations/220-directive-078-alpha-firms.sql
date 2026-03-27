-- ============================================================================
-- Migration 220: Directive 078 — Alpha-Firm Designation + Global Config History
-- ============================================================================
-- Dual-Speed Release Pipeline: Shadow → Alpha Test → Global Ignite
-- ============================================================================

-- 1. Alpha-firm flag on tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_internal_test boolean NOT NULL DEFAULT false;

-- 2. Global Config History (snapshot-based rollback)
CREATE TABLE IF NOT EXISTS global_config_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  flag text,
  previous_value jsonb,
  new_value jsonb,
  scope text NOT NULL DEFAULT 'global',
  tenants_affected integer DEFAULT 0,
  snapshot jsonb,
  admin_id text,
  reason text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  ip text,
  user_agent text,
  rolled_back_at timestamptz,
  rolled_back_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE global_config_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_global_config_history_action ON global_config_history(action);
CREATE INDEX IF NOT EXISTS idx_global_config_history_flag ON global_config_history(flag);
CREATE INDEX IF NOT EXISTS idx_global_config_history_created ON global_config_history(created_at DESC);

COMMENT ON COLUMN tenants.is_internal_test IS 'Directive 078: Alpha-firm — receives features before Global Ignite.';
COMMENT ON TABLE global_config_history IS 'Directive 078: Audit trail with pre-change snapshots for 1-click rollback.';
