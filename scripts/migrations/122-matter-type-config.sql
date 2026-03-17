-- ============================================================
-- 122-matter-type-config.sql
-- Adds matter_type_config JSONB column to matter_types for
-- storing SLA configs, billing defaults, and extended settings.
-- ============================================================

BEGIN;

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS matter_type_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN matter_types.matter_type_config IS
  'Stores SLA class overrides per stage, billing defaults (billing_type, '
  'default_flat_fee_amount, default_hourly_rate, default_retainer_amount), '
  'and any other per-matter-type configuration.';

COMMIT;
