-- =============================================================================
-- Migration 159 — Retainer Agreement Gating Rule for Stage Engine
-- =============================================================================
--
-- Adds a new gating rule type `require_retainer_agreement` to matter_stages.
--
-- When enabled on a stage, the stage engine will block advancement until the
-- matter has a retainer agreement matching the configured minimum status.
--
-- The gating_rules JSONB on matter_stages already supports rule objects:
--   [{"type": "require_retainer_agreement", "minimum_status": "signed"}]
--
-- This migration adds dedicated columns for convenience and discoverability,
-- plus a JSONB config column for fine-grained control over which retainer
-- statuses satisfy the gate.
--
-- Retainer status progression (for evaluator reference):
--   draft → sent → viewed → signed → countersigned
--
-- Stage-engine evaluator TODO:
--   When evaluating gating_rules, handle type = 'require_retainer_agreement':
--     1. Look up retainer_agreements for the matter
--     2. Compare retainer status against retainer_gate_config->>'minimum_status'
--     3. Block stage transition if no retainer meets the minimum status
-- =============================================================================

BEGIN;

-- ── 1. Add require_retainer_agreement flag ──────────────────────────────────
-- Boolean convenience column: when true, the stage requires a retainer
-- agreement before the matter can advance past this stage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matter_stages'
      AND column_name = 'require_retainer_agreement'
  ) THEN
    ALTER TABLE matter_stages
      ADD COLUMN require_retainer_agreement BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN matter_stages.require_retainer_agreement IS
  'When true, the stage engine blocks advancement until a retainer agreement '
  'meeting the configured minimum status exists for the matter. '
  'See retainer_gate_config for status threshold configuration.';

-- ── 2. Add retainer_gate_config JSONB ───────────────────────────────────────
-- Configuration for the retainer gating rule. Schema:
--   {
--     "minimum_status": "signed",          -- minimum retainer status required
--     "allow_expired": false,              -- whether expired retainers count
--     "retainer_types": ["standard"]       -- optional: restrict to specific types
--   }

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matter_stages'
      AND column_name = 'retainer_gate_config'
  ) THEN
    ALTER TABLE matter_stages
      ADD COLUMN retainer_gate_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN matter_stages.retainer_gate_config IS
  'JSONB configuration for the require_retainer_agreement gating rule. '
  'Keys: "minimum_status" (draft|sent|viewed|signed|countersigned), '
  '"allow_expired" (boolean), "retainer_types" (text[]). '
  'Example: {"minimum_status": "signed"}';

-- ── 3. RLS — matter_stages already has RLS enabled from migration 009. ──────
-- Verify the existing policy covers the new columns (it does, since column-
-- level RLS is not a thing in PostgreSQL — row policies apply to all columns).
-- For safety, ensure the policy exists:

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'matter_stages'
      AND policyname = 'matter_stages_tenant_isolation'
  ) THEN
    CREATE POLICY matter_stages_tenant_isolation ON matter_stages
      USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

-- ── 4. Table-level comment update ───────────────────────────────────────────

COMMENT ON TABLE matter_stages IS
  'Defines ordered stages within a matter_stage_pipeline. Each stage can have '
  'gating rules (via gating_rules JSONB or dedicated columns like '
  'require_retainer_agreement) that the stage engine evaluates before allowing '
  'a matter to advance. Supported gating rule types: '
  'require_retainer_agreement, require_documents, require_payment.';

COMMIT;
