-- Migration 120: Add evidence (JSONB) and suggested_action (text) to matter_risk_flags
-- Required by the 12-type risk flag auto-detection engine (lib/services/risk-flag-engine.ts)
-- Idempotent  -  safe to run multiple times.

ALTER TABLE matter_risk_flags
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS suggested_action text;

COMMENT ON COLUMN matter_risk_flags.evidence IS
  'Structured evidence JSONB captured by the auto-detection engine at flag creation time.';
COMMENT ON COLUMN matter_risk_flags.suggested_action IS
  'Human-readable suggested remediation action produced by the auto-detection engine.';
