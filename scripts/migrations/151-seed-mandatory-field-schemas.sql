-- Migration 151: Seed mandatory field schemas for immigration matter types
-- Drives the "Missing Fields" tooltip and readiness score from the database
--
-- The schema uses a JSON structure:
--   { sections: [{ name, label, fields: [{ key, label, required }] }] }
--
-- For ALL immigration matter types in ALL tenants

INSERT INTO matter_type_schema (tenant_id, matter_type_id, json_schema, is_active)
SELECT
  mt.tenant_id,
  mt.id,
  jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object(
      'name', 'case_info',
      'label', 'Case Information',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'case_type_id', 'label', 'Case Type', 'required', true),
        jsonb_build_object('key', 'application_number', 'label', 'Application Number', 'required', true),
        jsonb_build_object('key', 'uci_number', 'label', 'UCI Number', 'required', true),
        jsonb_build_object('key', 'program_category', 'label', 'Programme Category', 'required', true)
      )
    ),
    jsonb_build_object(
      'name', 'profile',
      'label', 'Client Immigration Profile',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'country_of_citizenship', 'label', 'Country of Citizenship', 'required', true),
        jsonb_build_object('key', 'country_of_residence', 'label', 'Country of Residence', 'required', true),
        jsonb_build_object('key', 'current_visa_status', 'label', 'Current Visa Status', 'required', true),
        jsonb_build_object('key', 'current_visa_expiry', 'label', 'Visa Expiry', 'required', true),
        jsonb_build_object('key', 'passport_number', 'label', 'Passport Number', 'required', true),
        jsonb_build_object('key', 'passport_expiry', 'label', 'Passport Expiry', 'required', true)
      )
    ),
    jsonb_build_object(
      'name', 'dates',
      'label', 'Key Dates',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'date_filed', 'label', 'Date Filed', 'required', true),
        jsonb_build_object('key', 'date_biometrics', 'label', 'Biometrics Date', 'required', false),
        jsonb_build_object('key', 'date_medical', 'label', 'Medical Exam Date', 'required', false),
        jsonb_build_object('key', 'date_interview', 'label', 'Interview Date', 'required', false),
        jsonb_build_object('key', 'date_decision', 'label', 'Decision Date', 'required', false),
        jsonb_build_object('key', 'date_landing', 'label', 'Landing Date', 'required', false)
      )
    ),
    jsonb_build_object(
      'name', 'language',
      'label', 'Language & Education',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'language_test_type', 'label', 'Language Test Type', 'required', true),
        jsonb_build_object('key', 'language_test_scores', 'label', 'Language Test Scores', 'required', true),
        jsonb_build_object('key', 'education_credential', 'label', 'Education Credential', 'required', true),
        jsonb_build_object('key', 'eca_status', 'label', 'ECA Status', 'required', true)
      )
    ),
    jsonb_build_object(
      'name', 'employment',
      'label', 'Employment',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'work_experience_years', 'label', 'Work Experience (Years)', 'required', true),
        jsonb_build_object('key', 'canadian_work_experience_years', 'label', 'Canadian Work Experience (Years)', 'required', true),
        jsonb_build_object('key', 'employer_name', 'label', 'Employer Name', 'required', false)
      )
    )
  )),
  true
FROM matter_types mt
JOIN practice_areas pa ON pa.id = mt.practice_area_id
WHERE LOWER(pa.name) LIKE '%immigration%'
  AND mt.is_active = true
ON CONFLICT DO NOTHING;
