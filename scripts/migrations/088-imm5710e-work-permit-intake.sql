-- ── Migration 088: IMM5710E Work Permit Intake Configuration ──────────────────
--
-- This migration:
--   1. Creates ircc_form_sections for IMM5710E (Personal Details, Marital
--      Status, Languages, Passport, National ID, US Green Card, Contact
--      Information, Details of Visit, Details of Intended Work, Education,
--      Employment History, Background Information, Consent & Declaration)
--   2. Assigns ircc_form_fields to their sections by XFA path pattern
--   3. Links IMM5710E to the "Work Permit" matter type in ircc_stream_forms
--
-- Safe to run multiple times (upsert / INSERT … ON CONFLICT DO NOTHING).
-- Run in Supabase SQL editor after IMM5710E has been uploaded and seeded
-- via scripts/seed-imm5710e.ts.

DO $$
DECLARE
  v_tenant      RECORD;
  v_form_id     UUID;
  v_mt_id       UUID;

  -- Section UUIDs
  s_personal    UUID;
  s_marital     UUID;
  s_languages   UUID;
  s_passport    UUID;
  s_national_id UUID;
  s_us_card     UUID;
  s_contact     UUID;
  s_visit       UUID;
  s_work        UUID;
  s_education   UUID;
  s_employment  UUID;
  s_background  UUID;
  s_consent     UUID;

BEGIN
  -- ── Iterate over every tenant ──────────────────────────────────────────────
  FOR v_tenant IN
    SELECT tenant_id FROM tenants
  LOOP

    -- ── 1. Look up the IMM5710E form for this tenant ───────────────────────
    SELECT id INTO v_form_id
    FROM ircc_forms
    WHERE tenant_id = v_tenant.tenant_id
      AND form_code  = 'IMM5710E'
    LIMIT 1;

    IF v_form_id IS NULL THEN
      RAISE NOTICE '[088] Tenant %: IMM5710E not found  -  skipping', v_tenant.tenant_id;
      CONTINUE;
    END IF;

    -- ── 2. Insert sections (ON CONFLICT by form_id + section_key) ─────────

    -- 2.1  Personal Details
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'personal_details', 'Personal Details',
       'Your name, date of birth, citizenship, and application type', 10)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_personal;

    IF s_personal IS NULL THEN
      SELECT id INTO s_personal FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'personal_details';
    END IF;

    -- 2.2  Marital Status
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'marital_status', 'Marital Status',
       'Your current marital status and spouse/partner details', 20)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_marital;

    IF s_marital IS NULL THEN
      SELECT id INTO s_marital FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'marital_status';
    END IF;

    -- 2.3  Languages
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'languages', 'Languages',
       'Your native language and ability to communicate in English or French', 30)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_languages;

    IF s_languages IS NULL THEN
      SELECT id INTO s_languages FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'languages';
    END IF;

    -- 2.4  Passport
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'passport', 'Passport',
       'Current passport number, country of issue, and validity dates', 40)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_passport;

    IF s_passport IS NULL THEN
      SELECT id INTO s_passport FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'passport';
    END IF;

    -- 2.5  National Identity Document
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'national_id', 'National Identity Document',
       'National ID card details (if applicable)', 50)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_national_id;

    IF s_national_id IS NULL THEN
      SELECT id INTO s_national_id FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'national_id';
    END IF;

    -- 2.6  U.S. Green Card
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'us_green_card', 'U.S. Green Card',
       'U.S. lawful permanent resident card (if applicable)', 60)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_us_card;

    IF s_us_card IS NULL THEN
      SELECT id INTO s_us_card FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'us_green_card';
    END IF;

    -- 2.7  Contact Information
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'contact_information', 'Contact Information',
       'Your current address, mailing address, and how to reach you', 70)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_contact;

    IF s_contact IS NULL THEN
      SELECT id INTO s_contact FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'contact_information';
    END IF;

    -- 2.8  Details of Visit to Canada
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'details_of_visit', 'Details of Visit to Canada',
       'Purpose of visit, entry dates, and immigration history', 80)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_visit;

    IF s_visit IS NULL THEN
      SELECT id INTO s_visit FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'details_of_visit';
    END IF;

    -- 2.9  Details of Intended Work
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'details_of_work', 'Details of Intended Work',
       'Employer, occupation, LMIA number, and work period', 90)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_work;

    IF s_work IS NULL THEN
      SELECT id INTO s_work FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'details_of_work';
    END IF;

    -- 2.10  Education
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'education', 'Education',
       'Your highest level of education completed', 100)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_education;

    IF s_education IS NULL THEN
      SELECT id INTO s_education FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'education';
    END IF;

    -- 2.11  Employment History
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'employment_history', 'Employment History',
       'Your employment history for the past ten years', 110)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_employment;

    IF s_employment IS NULL THEN
      SELECT id INTO s_employment FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'employment_history';
    END IF;

    -- 2.12  Background Information
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'background_information', 'Background Information',
       'Security, medical, and admissibility declarations', 120)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_background;

    IF s_background IS NULL THEN
      SELECT id INTO s_background FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'background_information';
    END IF;

    -- 2.13  Consent & Declaration
    INSERT INTO ircc_form_sections
      (id, tenant_id, form_id, section_key, title, description, sort_order)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_form_id,
       'consent_declaration', 'Consent & Declaration',
       'Your signature and consent to disclose personal information', 130)
    ON CONFLICT (form_id, section_key) DO NOTHING
    RETURNING id INTO s_consent;

    IF s_consent IS NULL THEN
      SELECT id INTO s_consent FROM ircc_form_sections
      WHERE form_id = v_form_id AND section_key = 'consent_declaration';
    END IF;

    -- ── 3. Assign fields to sections by XFA path prefix ───────────────────

    -- Personal Details: Page1.PersonalDetails.*
    UPDATE ircc_form_fields
    SET section_id = s_personal
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page1.PersonalDetails.%';

    -- Marital Status: Page1.MaritalStatus.*, Page2.MaritalStatus.*
    UPDATE ircc_form_fields
    SET section_id = s_marital
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND (xfa_path LIKE 'Page1.MaritalStatus.%' OR xfa_path LIKE 'Page2.MaritalStatus.%');

    -- Languages: Page2.Languages.*
    UPDATE ircc_form_fields
    SET section_id = s_languages
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page2.Languages.%';

    -- Passport: Page2.Passport.*
    UPDATE ircc_form_fields
    SET section_id = s_passport
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page2.Passport.%';

    -- National Identity Document: Page2.natID.*
    UPDATE ircc_form_fields
    SET section_id = s_national_id
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page2.natID.%';

    -- U.S. Green Card: Page2.USCard.*
    UPDATE ircc_form_fields
    SET section_id = s_us_card
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page2.USCard.%';

    -- Contact Information: Page2.ContactInformation.*
    UPDATE ircc_form_fields
    SET section_id = s_contact
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page2.ContactInformation.%';

    -- Details of Visit to Canada: Page3.ComingIntoCda.*
    UPDATE ircc_form_fields
    SET section_id = s_visit
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page3.ComingIntoCda.%';

    -- Details of Intended Work: Page3.DetailsOfWork.*
    UPDATE ircc_form_fields
    SET section_id = s_work
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page3.DetailsOfWork.%';

    -- Education: Page3.Education.*
    UPDATE ircc_form_fields
    SET section_id = s_education
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page3.Education.%';

    -- Employment History: Page3.Employment.*, Page4.EmpRec2.*, Page4.EmpRec3.*
    UPDATE ircc_form_fields
    SET section_id = s_employment
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND (
        xfa_path LIKE 'Page3.Employment.%'
        OR xfa_path LIKE 'Page4.EmpRec2.%'
        OR xfa_path LIKE 'Page4.EmpRec3.%'
      );

    -- Background Information: Page4.BackgroundInfo.*
    UPDATE ircc_form_fields
    SET section_id = s_background
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page4.BackgroundInfo.%';

    -- Consent & Declaration: Page4.Consent1.*
    UPDATE ircc_form_fields
    SET section_id = s_consent
    WHERE form_id = v_form_id
      AND section_id IS NULL
      AND xfa_path LIKE 'Page4.Consent1.%';

    RAISE NOTICE '[088] Tenant %: IMM5710E sections created and fields assigned', v_tenant.tenant_id;

    -- ── 4. Link IMM5710E to the "Work Permit" matter type ─────────────────

    SELECT id INTO v_mt_id
    FROM matter_types
    WHERE tenant_id   = v_tenant.tenant_id
      AND LOWER(name) LIKE '%work permit%'
    ORDER BY created_at
    LIMIT 1;

    IF v_mt_id IS NULL THEN
      RAISE NOTICE '[088] Tenant %: No "Work Permit" matter type found  -  skipping stream form link', v_tenant.tenant_id;
      CONTINUE;
    END IF;

    INSERT INTO ircc_stream_forms
      (id, tenant_id, matter_type_id, form_id, sort_order, is_required)
    VALUES
      (gen_random_uuid(), v_tenant.tenant_id, v_mt_id, v_form_id, 1, true)
    ON CONFLICT (matter_type_id, form_id) WHERE matter_type_id IS NOT NULL DO NOTHING;

    RAISE NOTICE '[088] Tenant %: IMM5710E linked to matter type % (Work Permit)', v_tenant.tenant_id, v_mt_id;

  END LOOP;

  RAISE NOTICE '[088] Migration complete';
END $$;
