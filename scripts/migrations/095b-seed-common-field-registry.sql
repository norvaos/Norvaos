-- 095b: Seed Common Field Registry with Standard IRCC Fields
--
-- Populates common_field_registry with canonical field keys mapped from the
-- IRCCProfile type. These are the standard fields shared across IRCC forms.
--
-- Domains: identity, address, travel, education, employment, immigration,
--          family, sponsor, declarations

-- ═══════════════════════════════════════════════════════════════════════════════
-- Identity Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('family_name', 'Family Name (Surname)', 'text', 'identity', 'applicant',
    '{"required": true, "max_length": 100}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('given_name', 'Given Name(s)', 'text', 'identity', 'applicant',
    '{"required": true, "max_length": 100}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('date_of_birth', 'Date of Birth', 'date', 'identity', 'applicant',
    '{"required": true, "format": "YYYY-MM-DD"}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('sex', 'Sex', 'select', 'identity', 'applicant',
    '{"required": true, "options": ["male", "female", "other"]}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('marital_status', 'Marital Status', 'select', 'identity', 'applicant',
    '{"required": true, "options": ["single", "married", "common_law", "divorced", "widowed", "separated", "annulled"]}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('country_of_birth', 'Country of Birth', 'country', 'identity', 'applicant',
    '{"required": true}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('city_of_birth', 'City/Town of Birth', 'text', 'identity', 'applicant',
    '{"required": true, "max_length": 100}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('citizenship', 'Country of Citizenship', 'country', 'identity', 'applicant',
    '{"required": true}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('second_citizenship', 'Second Citizenship', 'country', 'identity', 'applicant',
    '{"required": false}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('eye_colour', 'Eye Colour', 'text', 'identity', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('height_cm', 'Height (cm)', 'number', 'identity', 'applicant',
    '{"required": false, "min": 50, "max": 250}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('native_language', 'Native Language', 'text', 'identity', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('preferred_language', 'Preferred Language of Service', 'select', 'identity', 'applicant',
    '{"options": ["english", "french"]}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('english_ability', 'English Ability', 'select', 'identity', 'applicant',
    '{"options": ["none", "basic", "moderate", "fluent"]}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('french_ability', 'French Ability', 'select', 'identity', 'applicant',
    '{"options": ["none", "basic", "moderate", "fluent"]}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Address Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('current_address', 'Current Residential Address', 'address', 'address', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('mailing_address', 'Mailing Address', 'address', 'address', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('current_country_of_residence', 'Current Country of Residence', 'country', 'address', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('telephone', 'Telephone Number', 'phone', 'address', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('email', 'Email Address', 'email', 'address', 'applicant',
    '{"required": true, "format": "email"}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true, "case_sensitive": false}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Travel Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('passport_number', 'Passport Number', 'text', 'travel', 'applicant',
    '{"required": true, "max_length": 20}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true, "case_sensitive": false}'),
  ('passport_country', 'Passport Country of Issue', 'country', 'travel', 'applicant',
    '{"required": true}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('passport_issue_date', 'Passport Issue Date', 'date', 'travel', 'applicant',
    '{"required": true, "format": "YYYY-MM-DD"}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('passport_expiry_date', 'Passport Expiry Date', 'date', 'travel', 'applicant',
    '{"required": true, "format": "YYYY-MM-DD"}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('national_id_number', 'National Identity Document Number', 'text', 'travel', 'applicant',
    '{"required": false, "max_length": 30}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('us_pr_card_number', 'U.S. PR Card Number', 'text', 'travel', 'applicant',
    '{"required": false, "max_length": 20}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('previous_countries', 'Previous Countries of Residence', 'repeater', 'travel', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Education Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('highest_education_level', 'Highest Level of Education', 'select', 'education', 'applicant',
    '{"required": false, "options": ["none", "secondary", "trade_certificate", "non_university_diploma", "post_secondary", "bachelors", "masters", "doctorate"]}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('education_details', 'Education History', 'repeater', 'education', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('total_education_years', 'Total Years of Education', 'number', 'education', 'applicant',
    '{"required": false, "min": 0, "max": 30}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Employment Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('current_occupation', 'Current Occupation', 'text', 'employment', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('employer_name', 'Current Employer Name', 'text', 'employment', 'applicant',
    '{"required": false, "max_length": 150}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('employment_history', 'Employment History (Past 10 Years)', 'repeater', 'employment', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Immigration Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('immigration_status', 'Current Immigration Status', 'text', 'immigration', 'applicant',
    '{"required": false}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}'),
  ('uci_number', 'UCI Number (Unique Client Identifier)', 'text', 'immigration', 'applicant',
    '{"required": false, "max_length": 20, "pattern": "^[0-9\\-]+$"}',
    '["extraction", "staff", "client_portal", "import"]',
    '{"exact_match": true}'),
  ('previous_applications', 'Previous IRCC Applications', 'repeater', 'immigration', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('last_entry_canada_date', 'Last Entry to Canada Date', 'date', 'immigration', 'applicant',
    '{"required": false, "format": "YYYY-MM-DD"}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": true}'),
  ('last_entry_canada_place', 'Last Entry to Canada Place', 'text', 'immigration', 'applicant',
    '{"required": false, "max_length": 100}',
    '["extraction", "client_portal", "staff", "import"]',
    '{"exact_match": false}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Family Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('spouse_family_name', 'Spouse Family Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('spouse_given_name', 'Spouse Given Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false, "case_sensitive": false}'),
  ('spouse_dob', 'Spouse Date of Birth', 'date', 'family', 'applicant',
    '{"required": false, "format": "YYYY-MM-DD"}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('dependents', 'Dependants', 'repeater', 'family', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('mother_family_name', 'Mother''s Family Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('mother_given_name', 'Mother''s Given Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('father_family_name', 'Father''s Family Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('father_given_name', 'Father''s Given Name', 'text', 'family', 'applicant',
    '{"required": false, "max_length": 100}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('siblings', 'Siblings', 'repeater', 'family', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('children', 'Children', 'repeater', 'family', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsor Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('sponsor_relationship', 'Sponsor Relationship to Applicant', 'select', 'sponsor', 'sponsor',
    '{"required": false, "options": ["spouse", "common_law_partner", "conjugal_partner", "parent", "grandparent", "child", "other"]}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}'),
  ('sponsor_status', 'Sponsor Immigration Status', 'select', 'sponsor', 'sponsor',
    '{"required": false, "options": ["citizen", "permanent_resident"]}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}'),
  ('sponsor_income', 'Sponsor Annual Income', 'number', 'sponsor', 'sponsor',
    '{"required": false, "min": 0}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('sponsor_family_name', 'Sponsor Family Name', 'text', 'sponsor', 'sponsor',
    '{"required": false, "max_length": 100}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": false}'),
  ('sponsor_given_name', 'Sponsor Given Name', 'text', 'sponsor', 'sponsor',
    '{"required": false, "max_length": 100}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": false}'),
  ('sponsor_date_of_birth', 'Sponsor Date of Birth', 'date', 'sponsor', 'sponsor',
    '{"required": false, "format": "YYYY-MM-DD"}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}'),
  ('sponsor_previous_sponsorships', 'Previous Sponsorships', 'boolean', 'sponsor', 'sponsor',
    '{"required": false}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}'),
  ('sponsor_receiving_social_assistance', 'Receiving Social Assistance', 'boolean', 'sponsor', 'sponsor',
    '{"required": false}',
    '["staff", "client_portal", "extraction", "import"]',
    '{"exact_match": true}')
ON CONFLICT (canonical_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Declarations Domain
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO common_field_registry (canonical_key, label, data_type, domain, participant_scope, validation_rules, source_priority, conflict_detection_rules)
VALUES
  ('criminal_record', 'Criminal Record', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('criminal_record_details', 'Criminal Record Details', 'textarea', 'declarations', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('medical_conditions', 'Physical/Mental Health Conditions', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('medical_conditions_details', 'Medical Condition Details', 'textarea', 'declarations', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('refusals', 'Previous Visa/Permit Refusals', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('refusals_details', 'Refusal Details', 'textarea', 'declarations', 'applicant',
    '{"required": false}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": false}'),
  ('overstayed_visa', 'Overstayed Visa/Permit', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('deported', 'Deported or Removed', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('military_service', 'Military/Militia/Civil Defence Service', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}'),
  ('tuberculosis_contact', 'Close Contact with Tuberculosis', 'boolean', 'declarations', 'applicant',
    '{"required": true}',
    '["client_portal", "staff", "extraction", "import"]',
    '{"exact_match": true}')
ON CONFLICT (canonical_key) DO NOTHING;
