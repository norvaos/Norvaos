-- ============================================================================
-- Migration 136: Seed default matter types for tenants with no matter types
-- ============================================================================
-- Migration 009 seeded data using hardcoded practice area IDs that only
-- matched the first tenant's data. Any tenant that signed up afterward (or
-- whose practice area UUIDs differ) ended up with an empty matter_types table.
--
-- This migration dynamically resolves each tenant's actual practice area IDs
-- and seeds sensible defaults (Immigration + Real Estate) for any tenant that
-- currently has zero matter types.
--
-- Idempotent: ON CONFLICT DO NOTHING means re-running is always safe.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  rec           RECORD;
  v_imm_pa_id   UUID;
  v_re_pa_id    UUID;
  v_mt_count    INTEGER;
BEGIN

  FOR rec IN SELECT id AS tenant_id FROM tenants ORDER BY created_at
  LOOP

    -- Skip tenants that already have matter types configured
    SELECT COUNT(*) INTO v_mt_count
      FROM matter_types
     WHERE tenant_id = rec.tenant_id;

    IF v_mt_count > 0 THEN
      RAISE NOTICE '[136] Tenant % already has % matter type(s) — skipping.', rec.tenant_id, v_mt_count;
      CONTINUE;
    END IF;

    RAISE NOTICE '[136] Seeding matter types for tenant %', rec.tenant_id;

    -- ── Ensure Immigration practice area exists ─────────────────────────────
    INSERT INTO practice_areas (tenant_id, name, color, is_active, is_enabled)
    VALUES (rec.tenant_id, 'Immigration', '#6366f1', TRUE, TRUE)
    ON CONFLICT (tenant_id, name) DO UPDATE
      SET is_enabled = TRUE, is_active = TRUE
    RETURNING id INTO v_imm_pa_id;

    IF v_imm_pa_id IS NULL THEN
      SELECT id INTO v_imm_pa_id
        FROM practice_areas
       WHERE tenant_id = rec.tenant_id AND name = 'Immigration';
    END IF;

    -- ── Ensure Real Estate practice area exists ─────────────────────────────
    INSERT INTO practice_areas (tenant_id, name, color, is_active, is_enabled)
    VALUES (rec.tenant_id, 'Real Estate', '#10b981', TRUE, TRUE)
    ON CONFLICT (tenant_id, name) DO UPDATE
      SET is_enabled = TRUE, is_active = TRUE
    RETURNING id INTO v_re_pa_id;

    IF v_re_pa_id IS NULL THEN
      SELECT id INTO v_re_pa_id
        FROM practice_areas
       WHERE tenant_id = rec.tenant_id AND name = 'Real Estate';
    END IF;

    -- ── Immigration matter types ────────────────────────────────────────────
    INSERT INTO matter_types
      (tenant_id, practice_area_id, name, description, color, sort_order, is_active)
    VALUES
      (rec.tenant_id, v_imm_pa_id, 'Spousal Sponsorship',
       'Spousal and common-law partner sponsorship applications',          '#6366f1', 1, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Work Permit',
       'Temporary work permit applications (LMIA-exempt and LMIA-based)', '#3b82f6', 2, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Study Permit',
       'Student visa and study permit applications',                       '#8b5cf6', 3, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Permanent Residence',
       'Express Entry, PNP, and other PR pathways',                       '#10b981', 4, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Visitor Visa',
       'Temporary resident visas and electronic travel authorizations',    '#f59e0b', 5, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Citizenship',
       'Canadian citizenship applications and grant ceremonies',           '#ec4899', 6, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'Refugee Claim',
       'Convention refugee and PRRA applications',                         '#ef4444', 7, TRUE),
      (rec.tenant_id, v_imm_pa_id, 'IRCC Appeals',
       'Immigration Appeal Division and Judicial Review',                  '#6b7280', 8, TRUE)
    ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

    -- ── Real Estate matter types ────────────────────────────────────────────
    INSERT INTO matter_types
      (tenant_id, practice_area_id, name, description, color, sort_order, is_active)
    VALUES
      (rec.tenant_id, v_re_pa_id, 'Purchase',
       'Residential or commercial property purchase transaction', '#10b981', 1, TRUE),
      (rec.tenant_id, v_re_pa_id, 'Sale',
       'Residential or commercial property sale transaction',     '#f59e0b', 2, TRUE),
      (rec.tenant_id, v_re_pa_id, 'Refinance',
       'Mortgage refinancing transaction',                        '#3b82f6', 3, TRUE),
      (rec.tenant_id, v_re_pa_id, 'Lease Review',
       'Lease agreement review and negotiation',                  '#8b5cf6', 4, TRUE)
    ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

    RAISE NOTICE '[136] Done seeding tenant %.', rec.tenant_id;

  END LOOP;

END $$;

COMMIT;
