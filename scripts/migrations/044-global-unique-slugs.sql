-- ============================================================================
-- Migration 044: Global Unique Slugs
-- ============================================================================
-- Phase 7 Fix 3: Cross-tenant booking slug collision.
--
-- Problem: booking_pages and intake_forms have UNIQUE(tenant_id, slug) which
-- allows two tenants to share the same slug. Public routes query by slug alone
-- without tenant context, so `.single()` returns an arbitrary tenant's page.
--
-- Fix: Make slugs globally unique. De-duplicate any existing conflicts first.
-- ============================================================================

-- ── De-duplicate booking_pages slugs ──────────────────────────────────────────
-- If two tenants have the same slug, append a numeric suffix to the later one.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, slug,
      ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
    FROM booking_pages
  LOOP
    IF r.rn > 1 THEN
      UPDATE booking_pages SET slug = r.slug || '-' || r.rn WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Drop old per-tenant constraint and index
ALTER TABLE booking_pages DROP CONSTRAINT IF EXISTS booking_pages_tenant_id_slug_key;
DROP INDEX IF EXISTS idx_booking_pages_slug;

-- Add global unique constraint
ALTER TABLE booking_pages ADD CONSTRAINT booking_pages_slug_unique UNIQUE (slug);
CREATE INDEX IF NOT EXISTS idx_booking_pages_slug ON booking_pages(slug);

-- ── De-duplicate intake_forms slugs ───────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, slug,
      ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
    FROM intake_forms
  LOOP
    IF r.rn > 1 THEN
      UPDATE intake_forms SET slug = r.slug || '-' || r.rn WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Drop old per-tenant constraint
ALTER TABLE intake_forms DROP CONSTRAINT IF EXISTS intake_forms_tenant_slug_unique;

-- Add global unique constraint
ALTER TABLE intake_forms ADD CONSTRAINT intake_forms_slug_unique UNIQUE (slug);
