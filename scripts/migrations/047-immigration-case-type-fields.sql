-- ============================================================================
-- 047: Immigration Case-Type Specific Fields
-- Adds program_category and case-type-specific columns to matter_immigration.
-- ============================================================================

-- Program category for high-level grouping
ALTER TABLE matter_immigration
  ADD COLUMN IF NOT EXISTS program_category TEXT,
  -- Study Permit fields
  ADD COLUMN IF NOT EXISTS study_program TEXT,
  ADD COLUMN IF NOT EXISTS dli_number TEXT,
  ADD COLUMN IF NOT EXISTS study_level TEXT,
  ADD COLUMN IF NOT EXISTS study_duration_months INT,
  ADD COLUMN IF NOT EXISTS letter_of_acceptance BOOLEAN DEFAULT FALSE,
  -- Work Permit fields
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS work_permit_type TEXT,
  -- Family / Spousal fields
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_relationship TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_status TEXT,
  ADD COLUMN IF NOT EXISTS relationship_start_date DATE,
  -- Second language test (for CRS bilingual bonus)
  ADD COLUMN IF NOT EXISTS second_language_test_type TEXT,
  ADD COLUMN IF NOT EXISTS second_language_test_scores JSONB;

-- Constraints
ALTER TABLE matter_immigration
  ADD CONSTRAINT chk_program_category
    CHECK (program_category IS NULL OR program_category IN ('temp_resident','perm_resident','citizenship','other')),
  ADD CONSTRAINT chk_work_permit_type
    CHECK (work_permit_type IS NULL OR work_permit_type IN ('lmia','lmia_exempt','open','closed','pgwp','bridging')),
  ADD CONSTRAINT chk_study_level
    CHECK (study_level IS NULL OR study_level IN ('language','secondary','diploma','bachelors','masters','doctorate','postdoc')),
  ADD CONSTRAINT chk_sponsor_relationship
    CHECK (sponsor_relationship IS NULL OR sponsor_relationship IN ('spouse','common_law','parent','child','grandparent','other')),
  ADD CONSTRAINT chk_sponsor_status
    CHECK (sponsor_status IS NULL OR sponsor_status IN ('citizen','permanent_resident','other'));
