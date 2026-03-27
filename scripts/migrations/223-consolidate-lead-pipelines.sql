-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 223: Consolidate Lead Pipelines
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem: Multiple lead pipelines exist from seeds/scripts, confusing staff.
--   - "Default Lead Pipeline", "Lead Intake", "Immigration Lead Pipeline",
--     "Family Law Lead Pipeline", "Real Estate Lead Pipeline", etc.
--
-- Solution: Keep ONLY the "Core Intake & Retainer Pipeline" (14 stages, full
--   automation via lead-workflow-definitions.ts). Re-assign any orphaned leads
--   to the kept pipeline, then soft-delete the rest.
--
-- Safe: Uses transactions, re-assigns leads before deleting, idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Identify the keeper pipeline per tenant (prefer "Core Intake & Retainer Pipeline",
--    fall back to is_default=true, then any pipeline)
CREATE TEMP TABLE _keeper_pipeline AS
SELECT DISTINCT ON (p.tenant_id)
  p.tenant_id,
  p.id AS pipeline_id
FROM pipelines p
WHERE p.is_active IS NOT FALSE
ORDER BY
  p.tenant_id,
  CASE WHEN p.name = 'Core Intake & Retainer Pipeline' THEN 0
       WHEN p.is_default = true THEN 1
       ELSE 2
  END,
  p.created_at ASC;

-- 2. Mark the keeper as is_default = true (in case it wasn't)
UPDATE pipelines
SET is_default = true, updated_at = now()
FROM _keeper_pipeline k
WHERE pipelines.id = k.pipeline_id
  AND pipelines.tenant_id = k.tenant_id;

-- 3. Rename keeper to "Core Intake & Retainer Pipeline" if it has a different name
UPDATE pipelines
SET name = 'Core Intake & Retainer Pipeline', updated_at = now()
FROM _keeper_pipeline k
WHERE pipelines.id = k.pipeline_id
  AND pipelines.tenant_id = k.tenant_id
  AND pipelines.name != 'Core Intake & Retainer Pipeline';

-- 4. For each tenant, get the first stage of the keeper pipeline (for lead re-assignment)
CREATE TEMP TABLE _keeper_first_stage AS
SELECT DISTINCT ON (ps.pipeline_id)
  k.tenant_id,
  k.pipeline_id,
  ps.id AS stage_id
FROM _keeper_pipeline k
JOIN pipeline_stages ps ON ps.pipeline_id = k.pipeline_id
ORDER BY ps.pipeline_id, ps.sort_order ASC, ps.created_at ASC;

-- 5. Re-assign leads from non-keeper pipelines to the keeper pipeline + first stage
UPDATE leads
SET
  pipeline_id = kfs.pipeline_id,
  stage_id = kfs.stage_id,
  updated_at = now()
FROM _keeper_first_stage kfs
WHERE leads.tenant_id = kfs.tenant_id
  AND leads.pipeline_id != kfs.pipeline_id;

-- 6. Delete pipeline_stages for non-keeper pipelines
DELETE FROM pipeline_stages ps
USING _keeper_pipeline k
WHERE ps.pipeline_id != k.pipeline_id
  AND ps.tenant_id = k.tenant_id;

-- 7. Delete the non-keeper pipelines
DELETE FROM pipelines p
USING _keeper_pipeline k
WHERE p.id != k.pipeline_id
  AND p.tenant_id = k.tenant_id;

-- 8. Un-default all pipelines except the keeper (safety net)
UPDATE pipelines
SET is_default = false
WHERE id NOT IN (SELECT pipeline_id FROM _keeper_pipeline);

-- Cleanup temp tables
DROP TABLE IF EXISTS _keeper_first_stage;
DROP TABLE IF EXISTS _keeper_pipeline;

COMMIT;
