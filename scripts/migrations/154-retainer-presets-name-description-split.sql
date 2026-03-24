-- Migration 154: Split retainer_presets description into name + description
--
-- Previously the `description` column served as the short name for fee presets.
-- This migration renames it to `name` (the short label) and adds a new
-- `description` column for an optional detailed explanation.

-- 1. Drop the unique index that references lower(description)
DROP INDEX IF EXISTS idx_retainer_presets_unique_active;

-- 2. Rename description → name
ALTER TABLE retainer_presets RENAME COLUMN description TO name;

-- 3. Make name NOT NULL (it already was as description)
-- (no-op since the column was already NOT NULL)

-- 4. Add new description column for detailed text (nullable)
ALTER TABLE retainer_presets ADD COLUMN IF NOT EXISTS description TEXT;

-- 5. Recreate the unique index on the new `name` column
CREATE UNIQUE INDEX IF NOT EXISTS idx_retainer_presets_unique_active
  ON retainer_presets (tenant_id, category, lower(name))
  WHERE is_active = TRUE;
