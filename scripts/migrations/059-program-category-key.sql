-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 059: Add program_category_key to matter_types
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Maps each matter type to its legacy program_category value so that:
--   1. The "Program Category" dropdown in Strategic Variables can be replaced
--      with a read-only display of the matter type name
--   2. matter_intake.program_category is auto-derived from the matter type
--   3. All services (risk-engine, intake-revalidate, etc.) keep working
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Add column ──────────────────────────────────────────────────────────────

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS program_category_key TEXT;


-- ── 2. Seed keys for existing immigration matter types ─────────────────────────
-- Uses a DO block to handle per-tenant updates (multi-tenant safe)

DO $$
DECLARE
  v_tenant RECORD;
  v_imm_pa_id UUID;
BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM matter_types LOOP
    -- Find the Immigration practice area for this tenant
    SELECT id INTO v_imm_pa_id
    FROM practice_areas
    WHERE tenant_id = v_tenant.tenant_id
      AND LOWER(name) = 'immigration'
    LIMIT 1;

    IF v_imm_pa_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Map existing matter type names to program_category_key values
    UPDATE matter_types SET program_category_key = 'spousal'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%spousal%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'work_permit'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%work permit%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'study_permit'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%study permit%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'express_entry'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%permanent resid%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'refugee'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%refugee%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'visitor_visa'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%visitor%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'citizenship'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%citizenship%' AND program_category_key IS NULL;

    UPDATE matter_types SET program_category_key = 'lmia'
    WHERE tenant_id = v_tenant.tenant_id AND practice_area_id = v_imm_pa_id
      AND LOWER(name) LIKE '%lmia%' AND program_category_key IS NULL;
  END LOOP;
END $$;


-- ── 3. Backfill matter_intake.program_category from matter type ────────────────
-- For existing matters that have a matter_type_id set, sync program_category

UPDATE matter_intake mi
SET program_category = mt.program_category_key
FROM matters m
JOIN matter_types mt ON m.matter_type_id = mt.id
WHERE mi.matter_id = m.id
  AND mt.program_category_key IS NOT NULL
  AND (mi.program_category IS NULL OR mi.program_category != mt.program_category_key);
