-- ============================================================================
-- Migration 026: UEE Phase B  -  Seed Gating Rules (Enforcement-Enabled Only)
-- ============================================================================
-- Seeds progressive gating rules on matter_stages that belong to pipelines
-- associated with enforcement_enabled matter types.
--
-- Strategy:
--   - sort_order 0-2: No explicit rules (default baseline applies at runtime)
--   - sort_order 3-4: Require intake complete
--   - sort_order 5+:  Require intake validated + risk review for critical
--
-- Safeguards:
--   - Only touches enforcement_enabled = true matter types
--   - Never overwrites manually configured rules (IS NULL or = '[]')
--   - JOINs through matter_stage_pipelines → matter_types for scoping
-- ============================================================================

-- ─── Mid-stages (sort_order 3-4): require intake complete ──────────────────

UPDATE matter_stages ms
SET gating_rules = '[{"type": "require_intake_complete", "minimum_status": "complete"}]'::jsonb
FROM matter_stage_pipelines p
JOIN matter_types mt ON mt.id = p.matter_type_id
WHERE ms.pipeline_id = p.id
  AND mt.enforcement_enabled = true
  AND ms.sort_order >= 3 AND ms.sort_order < 5
  AND (ms.gating_rules IS NULL OR ms.gating_rules = '[]'::jsonb);

-- ─── Late stages (sort_order 5+): require validated + risk review ──────────

UPDATE matter_stages ms
SET gating_rules = '[{"type": "require_intake_complete", "minimum_status": "validated"}, {"type": "require_risk_review", "block_levels": ["critical"]}]'::jsonb
FROM matter_stage_pipelines p
JOIN matter_types mt ON mt.id = p.matter_type_id
WHERE ms.pipeline_id = p.id
  AND mt.enforcement_enabled = true
  AND ms.sort_order >= 5
  AND (ms.gating_rules IS NULL OR ms.gating_rules = '[]'::jsonb);

-- ============================================================================
-- END Migration 026
-- ============================================================================
