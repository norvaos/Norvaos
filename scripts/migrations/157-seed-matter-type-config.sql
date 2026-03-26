-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 157  -  Seed matter_type_config with processing stream + program category
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Populates the `matter_type_config` JSONB and `program_category_key` columns on
-- `matter_types` so the Command Centre can auto-populate the Processing Stream,
-- Client Location, and Immigration Intelligence fields when a matter type is selected.
--
-- Keys stored in matter_type_config:
--   default_processing_stream   -  'inland' | 'outland' | 'hybrid' | null
--   default_client_location     -  'inland' | 'outside' | null
--   program_category            -  human-readable label (e.g. "Temporary Residence")
--   eligibility_summary         -  short text describing who qualifies
--   typical_processing_time     -  e.g. "4–8 weeks"

-- Study Permit
UPDATE matter_types SET
  program_category_key = 'temporary_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'outland',
    'default_client_location', 'outside',
    'program_category', 'Temporary Residence',
    'eligibility_summary', 'Accepted to a DLI; proof of funds; no inadmissibility',
    'typical_processing_time', '4–16 weeks (varies by country)'
  )
WHERE name = 'Study Permit' AND matter_type_config = '{}'::jsonb;

-- Work Permit
UPDATE matter_types SET
  program_category_key = 'temporary_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'hybrid',
    'default_client_location', NULL,
    'program_category', 'Temporary Residence',
    'eligibility_summary', 'Valid job offer or LMIA; meets program requirements',
    'typical_processing_time', '4–12 weeks'
  )
WHERE name = 'Work Permit' AND matter_type_config = '{}'::jsonb;

-- Express Entry
UPDATE matter_types SET
  program_category_key = 'economic_immigration',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'hybrid',
    'default_client_location', NULL,
    'program_category', 'Economic Immigration',
    'eligibility_summary', 'CRS score-based; FSW, CEC, or FST eligible; language + education + work experience',
    'typical_processing_time', '6–8 months'
  )
WHERE name = 'Express Entry' AND matter_type_config = '{}'::jsonb;

-- PR Application
UPDATE matter_types SET
  program_category_key = 'permanent_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'hybrid',
    'default_client_location', NULL,
    'program_category', 'Permanent Residence',
    'eligibility_summary', 'Pathway-dependent: Express Entry, PNP, family class, or other PR stream',
    'typical_processing_time', '6–18 months'
  )
WHERE name = 'PR Application' AND matter_type_config = '{}'::jsonb;

-- Visitor Visa  -  Inside Canada
UPDATE matter_types SET
  program_category_key = 'temporary_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'inland',
    'default_client_location', 'inland',
    'program_category', 'Temporary Residence',
    'eligibility_summary', 'Extension or change of status; currently in Canada with valid status',
    'typical_processing_time', '4–12 weeks'
  )
WHERE name = 'Visitor Visa  -  Inside Canada' AND matter_type_config = '{}'::jsonb;

-- Visitor Visa  -  Outside Canada
UPDATE matter_types SET
  program_category_key = 'temporary_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'outland',
    'default_client_location', 'outside',
    'program_category', 'Temporary Residence',
    'eligibility_summary', 'Purpose of visit; ties to home country; financial means; no inadmissibility',
    'typical_processing_time', '2–8 weeks (varies by country)'
  )
WHERE name = 'Visitor Visa  -  Outside Canada' AND matter_type_config = '{}'::jsonb;

-- Post-Graduate Work Permit (PGWP)
UPDATE matter_types SET
  program_category_key = 'temporary_residence',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'inland',
    'default_client_location', 'inland',
    'program_category', 'Temporary Residence',
    'eligibility_summary', 'Graduated from eligible DLI; applied within 180 days of program completion',
    'typical_processing_time', '4–12 weeks'
  )
WHERE name = 'Post-Graduate Work Permit (PGWP)' AND matter_type_config = '{}'::jsonb;

-- Spousal Sponsorship  -  Inside Canada
UPDATE matter_types SET
  program_category_key = 'family_sponsorship',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'inland',
    'default_client_location', 'inland',
    'program_category', 'Family Sponsorship',
    'eligibility_summary', 'Sponsor is citizen/PR; genuine relationship; spouse is in Canada',
    'typical_processing_time', '12–16 months'
  )
WHERE name = 'Spousal Sponsorship  -  Inside Canada' AND matter_type_config = '{}'::jsonb;

-- Spousal Sponsorship  -  Outside Canada
UPDATE matter_types SET
  program_category_key = 'family_sponsorship',
  matter_type_config = jsonb_build_object(
    'default_processing_stream', 'outland',
    'default_client_location', 'outside',
    'program_category', 'Family Sponsorship',
    'eligibility_summary', 'Sponsor is citizen/PR; genuine relationship; spouse is outside Canada',
    'typical_processing_time', '12–18 months'
  )
WHERE name = 'Spousal Sponsorship  -  Outside Canada' AND matter_type_config = '{}'::jsonb;

-- General Matter  -  no immigration-specific defaults
UPDATE matter_types SET
  program_category_key = 'general',
  matter_type_config = jsonb_build_object(
    'program_category', 'General',
    'eligibility_summary', NULL,
    'typical_processing_time', NULL
  )
WHERE name = 'General Matter' AND matter_type_config = '{}'::jsonb;
