-- Migration 162: Seed require_retainer_agreement gating rule
-- Appends the retainer agreement gate to all matter_stages with sort_order >= 2
-- (i.e., stages after "Initial Consultation") across all tenants and pipelines.
-- Safe to re-run: the NOT LIKE guard prevents duplicate entries.

DO $$
DECLARE
  _updated_count INTEGER;
BEGIN
  UPDATE matter_stages ms
  SET gating_rules = COALESCE(ms.gating_rules, '[]'::jsonb) || '[{"type": "require_retainer_agreement", "minimum_status": "signed"}]'::jsonb
  FROM matter_stage_pipelines p
  WHERE ms.pipeline_id = p.id
    AND ms.sort_order >= 2
    AND NOT (COALESCE(ms.gating_rules, '[]'::jsonb)::text LIKE '%require_retainer_agreement%');

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  RAISE NOTICE '162-seed-retainer-gating-rules: updated % matter_stages with require_retainer_agreement rule', _updated_count;
END $$;
