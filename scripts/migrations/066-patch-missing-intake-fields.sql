-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 063: Patch Missing Intake Fields
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds fields for two sections that were created in 062 but had no fields:
--   1. family_children (IMM 5406E)  -  Children & Dependants
--   2. background_employment (IMM 5669E)  -  Employment History (Past 10 Years)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant       RECORD;
  v_section_id   UUID;
  v_form_id      UUID;
BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM matter_types LOOP

    -- ══════════════════════════════════════════════════════════════════════════
    -- 1. CHILDREN & DEPENDANTS (IMM 5406E  -  family_children)
    -- ══════════════════════════════════════════════════════════════════════════

    SELECT s.id, s.form_id INTO v_section_id, v_form_id
    FROM ircc_form_sections s
    JOIN ircc_forms f ON f.id = s.form_id
    WHERE f.tenant_id = v_tenant.tenant_id
      AND f.form_code = 'IMM5406E'
      AND s.section_key = 'family_children'
    LIMIT 1;

    IF v_section_id IS NOT NULL THEN
      -- Skip if already patched
      IF NOT EXISTS (
        SELECT 1 FROM ircc_form_fields
        WHERE section_id = v_section_id AND xfa_path = 'imm5406.children.has_children'
      ) THEN

        INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
          (v_tenant.tenant_id, v_form_id, 'imm5406.children.has_children', 'boolean', 'Has Children', 'family.has_children', 'Do you have any children (biological, adopted, or stepchildren)?', 'boolean', true, 'Include ALL children from all relationships, whether or not they are accompanying you to Canada.', NULL, v_section_id, 1, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.children.count', 'number', 'Number of Children', 'family.number_of_children', 'Total Number of Children', 'number', false, 'Include all children regardless of age or whether they will accompany you.', '0', v_section_id, 2, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.family_name', 'text', 'Child 1 Family Name', 'family.children[0].family_name', 'Child 1  -  Family Name', 'text', false, 'Leave blank if you have no children.', 'Family name', v_section_id, 3, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.given_name', 'text', 'Child 1 Given Name', 'family.children[0].given_name', 'Child 1  -  Given Name', 'text', false, NULL, 'Given name', v_section_id, 4, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.dob', 'date', 'Child 1 DOB', 'family.children[0].date_of_birth', 'Child 1  -  Date of Birth', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 5, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.country_of_birth', 'country', 'Child 1 Country', 'family.children[0].country_of_birth', 'Child 1  -  Country of Birth', 'country', false, NULL, NULL, v_section_id, 6, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.relationship', 'text', 'Child 1 Relationship', 'family.children[0].relationship', 'Child 1  -  Relationship to You', 'text', false, 'e.g., Biological son, Adopted daughter, Stepchild', 'Biological / Adopted / Step', v_section_id, 7, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child1.accompanying', 'boolean', 'Child 1 Accompanying', 'family.children[0].accompanying', 'Will Child 1 accompany you to Canada?', 'boolean', false, 'Indicate whether this child will be included in the application.', NULL, v_section_id, 8, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.family_name', 'text', 'Child 2 Family Name', 'family.children[1].family_name', 'Child 2  -  Family Name', 'text', false, 'Complete only if you have a second child.', 'Family name', v_section_id, 9, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.given_name', 'text', 'Child 2 Given Name', 'family.children[1].given_name', 'Child 2  -  Given Name', 'text', false, NULL, 'Given name', v_section_id, 10, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.dob', 'date', 'Child 2 DOB', 'family.children[1].date_of_birth', 'Child 2  -  Date of Birth', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 11, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.country_of_birth', 'country', 'Child 2 Country', 'family.children[1].country_of_birth', 'Child 2  -  Country of Birth', 'country', false, NULL, NULL, v_section_id, 12, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.relationship', 'text', 'Child 2 Relationship', 'family.children[1].relationship', 'Child 2  -  Relationship to You', 'text', false, NULL, 'Biological / Adopted / Step', v_section_id, 13, true),
          (v_tenant.tenant_id, v_form_id, 'imm5406.child2.accompanying', 'boolean', 'Child 2 Accompanying', 'family.children[1].accompanying', 'Will Child 2 accompany you to Canada?', 'boolean', false, NULL, NULL, v_section_id, 14, true);

      END IF;
    END IF;


    -- ══════════════════════════════════════════════════════════════════════════
    -- 2. EMPLOYMENT HISTORY (IMM 5669E  -  background_employment)
    -- ══════════════════════════════════════════════════════════════════════════

    SELECT s.id, s.form_id INTO v_section_id, v_form_id
    FROM ircc_form_sections s
    JOIN ircc_forms f ON f.id = s.form_id
    WHERE f.tenant_id = v_tenant.tenant_id
      AND f.form_code = 'IMM5669E'
      AND s.section_key = 'background_employment'
    LIMIT 1;

    IF v_section_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM ircc_form_fields
        WHERE section_id = v_section_id AND xfa_path = 'imm5669.emp.current_occupation'
      ) THEN

        INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.current_occupation', 'text', 'Current Occupation', 'employment.current_occupation', 'Current Occupation / Job Title', 'text', true, 'Your current job title. If unemployed, enter "Unemployed". If a student, enter "Student".', 'e.g., Software Engineer, Nurse, Student', v_section_id, 1, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.current_employer', 'text', 'Current Employer', 'employment.current_employer', 'Current Employer / Company Name', 'text', false, 'If self-employed, enter your business name. If unemployed, leave blank.', 'Company or business name', v_section_id, 2, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.current_from', 'date', 'Current Job From', 'employment.current_start_date', 'Current Position  -  Start Date', 'date', true, 'When did you start this position?', 'YYYY-MM-DD', v_section_id, 3, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.current_city', 'text', 'Current Job City', 'employment.current_city', 'City / Town', 'text', false, NULL, 'City', v_section_id, 4, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.current_country', 'country', 'Current Job Country', 'employment.current_country', 'Country', 'country', false, NULL, NULL, v_section_id, 5, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_occupation', 'text', 'Previous Job 1 Title', 'employment.history[0].occupation', 'Previous Position 1  -  Occupation / Title', 'text', false, 'List your most recent previous position. Do not leave gaps in your timeline.', 'Job title', v_section_id, 6, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_employer', 'text', 'Previous Job 1 Employer', 'employment.history[0].employer', 'Previous Position 1  -  Employer', 'text', false, NULL, 'Company or business name', v_section_id, 7, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_from', 'date', 'Previous Job 1 From', 'employment.history[0].start_date', 'Previous Position 1  -  From', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 8, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_to', 'date', 'Previous Job 1 To', 'employment.history[0].end_date', 'Previous Position 1  -  To', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 9, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_city', 'text', 'Previous Job 1 City', 'employment.history[0].city', 'Previous Position 1  -  City', 'text', false, NULL, 'City', v_section_id, 10, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev1_country', 'country', 'Previous Job 1 Country', 'employment.history[0].country', 'Previous Position 1  -  Country', 'country', false, NULL, NULL, v_section_id, 11, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_occupation', 'text', 'Previous Job 2 Title', 'employment.history[1].occupation', 'Previous Position 2  -  Occupation / Title', 'text', false, 'List your second most recent position.', 'Job title', v_section_id, 12, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_employer', 'text', 'Previous Job 2 Employer', 'employment.history[1].employer', 'Previous Position 2  -  Employer', 'text', false, NULL, 'Company or business name', v_section_id, 13, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_from', 'date', 'Previous Job 2 From', 'employment.history[1].start_date', 'Previous Position 2  -  From', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 14, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_to', 'date', 'Previous Job 2 To', 'employment.history[1].end_date', 'Previous Position 2  -  To', 'date', false, NULL, 'YYYY-MM-DD', v_section_id, 15, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_city', 'text', 'Previous Job 2 City', 'employment.history[1].city', 'Previous Position 2  -  City', 'text', false, NULL, 'City', v_section_id, 16, true),
          (v_tenant.tenant_id, v_form_id, 'imm5669.emp.prev2_country', 'country', 'Previous Job 2 Country', 'employment.history[1].country', 'Previous Position 2  -  Country', 'country', false, NULL, NULL, v_section_id, 17, true);

      END IF;
    END IF;

  END LOOP;
END $$;
