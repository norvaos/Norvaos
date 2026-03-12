-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 062: Spousal Sponsorship Intake Forms
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Seeds IRCC form definitions, sections, and fields for Spousal Sponsorship.
-- Uses the existing ircc_forms, ircc_form_sections, ircc_form_fields, and
-- ircc_stream_forms tables (created in migration 057).
--
-- Forms seeded:
--   IMM1295E  — Sponsorship Application
--   IMM0008E  — Application for Permanent Residence (Generic)
--   IMM5406E  — Additional Family Information
--   IMM5532E  — Relationship Information & Sponsorship Evaluation
--   IMM5669E  — Schedule A — Background/Declaration
--   IMM5476E  — Use of a Representative
--   IMM1283   — Financial Evaluation
--   IMM5562   — Supplementary Information
--   IMM5533   — Document Checklist (Common-Law)
--   IMM5589   — Document Checklist (Married)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant       RECORD;
  v_mt_id        UUID;

  -- Form IDs
  f_1295         UUID;
  f_0008         UUID;
  f_5406         UUID;
  f_5532         UUID;
  f_5669         UUID;
  f_5476         UUID;
  f_1283         UUID;
  f_5562         UUID;
  f_5533         UUID;
  f_5589         UUID;

  -- Section IDs
  s_sponsor_personal    UUID;
  s_sponsor_status      UUID;
  s_sponsor_eligibility UUID;
  s_applicant_personal  UUID;
  s_applicant_passport  UUID;
  s_applicant_contact   UUID;
  s_applicant_language  UUID;
  s_family_spouse       UUID;
  s_family_children     UUID;
  s_family_parents      UUID;
  s_rel_type            UUID;
  s_rel_history         UUID;
  s_rel_cohabitation    UUID;
  s_bg_education        UUID;
  s_bg_employment       UUID;
  s_bg_security         UUID;
  s_rep_details         UUID;
  s_fin_income          UUID;
  s_fin_assets          UUID;
  s_supp_info           UUID;
  s_checklist_married   UUID;
  s_checklist_commonlaw UUID;

BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM matter_types LOOP

    -- Find Spousal Sponsorship matter type
    SELECT id INTO v_mt_id
    FROM matter_types
    WHERE tenant_id = v_tenant.tenant_id
      AND program_category_key = 'spousal'
      AND is_active = true
    LIMIT 1;

    IF v_mt_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip if already seeded (check for IMM1295E)
    IF EXISTS (
      SELECT 1 FROM ircc_forms
      WHERE tenant_id = v_tenant.tenant_id AND form_code = 'IMM1295E'
    ) THEN
      CONTINUE;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- 1. INSERT FORM RECORDS
    -- ══════════════════════════════════════════════════════════════════════════

    f_1295 := gen_random_uuid();
    f_0008 := gen_random_uuid();
    f_5406 := gen_random_uuid();
    f_5532 := gen_random_uuid();
    f_5669 := gen_random_uuid();
    f_5476 := gen_random_uuid();
    f_1283 := gen_random_uuid();
    f_5562 := gen_random_uuid();
    f_5533 := gen_random_uuid();
    f_5589 := gen_random_uuid();

    INSERT INTO ircc_forms (id, tenant_id, form_code, form_name, description, storage_path, file_name, file_size, checksum_sha256, is_xfa, scan_status) VALUES
      (f_1295, v_tenant.tenant_id, 'IMM1295E', 'Application to Sponsor, Sponsorship Agreement and Undertaking',
       'This form is used by Canadian citizens or permanent residents to sponsor their spouse, common-law partner, or conjugal partner for permanent residence in Canada.',
       'seed/IMM1295E.pdf', 'IMM1295E.pdf', 0, 'seed-placeholder-1295', false, 'scanned'),

      (f_0008, v_tenant.tenant_id, 'IMM0008E', 'Application for Permanent Residence — Generic',
       'Generic application form for permanent residence in Canada. Collects personal details, passport information, contact details, and language abilities of the principal applicant.',
       'seed/IMM0008E.pdf', 'IMM0008E.pdf', 0, 'seed-placeholder-0008', false, 'scanned'),

      (f_5406, v_tenant.tenant_id, 'IMM5406E', 'Additional Family Information',
       'Provides detailed information about family members including spouse/partner, children, parents, and siblings. Required for all immigration applications.',
       'seed/IMM5406E.pdf', 'IMM5406E.pdf', 0, 'seed-placeholder-5406', false, 'scanned'),

      (f_5532, v_tenant.tenant_id, 'IMM5532E', 'Relationship Information and Sponsorship Evaluation',
       'Documents the history and genuineness of the relationship between the sponsor and the applicant. Includes how you met, relationship timeline, and cohabitation details.',
       'seed/IMM5532E.pdf', 'IMM5532E.pdf', 0, 'seed-placeholder-5532', false, 'scanned'),

      (f_5669, v_tenant.tenant_id, 'IMM5669E', 'Schedule A — Background/Declaration',
       'Background questions about education, employment, memberships, military service, and security-related questions. All applicants aged 18+ must complete this form.',
       'seed/IMM5669E.pdf', 'IMM5669E.pdf', 0, 'seed-placeholder-5669', false, 'scanned'),

      (f_5476, v_tenant.tenant_id, 'IMM5476E', 'Use of a Representative',
       'Authorizes an immigration representative (lawyer, consultant, or other representative) to act on your behalf. Complete this form if someone is helping you with your application.',
       'seed/IMM5476E.pdf', 'IMM5476E.pdf', 0, 'seed-placeholder-5476', false, 'scanned'),

      (f_1283, v_tenant.tenant_id, 'IMM1283', 'Financial Evaluation for Sponsorship',
       'Evaluates the sponsor''s financial ability to support the sponsored person. Includes income for the past 3 years, assets, liabilities, and current sponsorship obligations.',
       'seed/IMM1283.pdf', 'IMM1283.pdf', 0, 'seed-placeholder-1283', false, 'scanned'),

      (f_5562, v_tenant.tenant_id, 'IMM5562', 'Supplementary Information — Your Travels',
       'Provides space for additional information that could not be included in other forms, such as travel history and supplementary declarations.',
       'seed/IMM5562.pdf', 'IMM5562.pdf', 0, 'seed-placeholder-5562', false, 'scanned'),

      (f_5533, v_tenant.tenant_id, 'IMM5533', 'Document Checklist — Sponsor and Common-Law Partner',
       'Checklist of required documents for sponsoring a common-law partner. Review this list to ensure your application is complete.',
       'seed/IMM5533.pdf', 'IMM5533.pdf', 0, 'seed-placeholder-5533', false, 'scanned'),

      (f_5589, v_tenant.tenant_id, 'IMM5589', 'Document Checklist — Spouse',
       'Checklist of required documents for sponsoring a married spouse. Review this list to ensure your application is complete.',
       'seed/IMM5589.pdf', 'IMM5589.pdf', 0, 'seed-placeholder-5589', false, 'scanned');


    -- ══════════════════════════════════════════════════════════════════════════
    -- 2. LINK FORMS TO SPOUSAL SPONSORSHIP MATTER TYPE
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO ircc_stream_forms (tenant_id, matter_type_id, form_id, sort_order, is_required) VALUES
      (v_tenant.tenant_id, v_mt_id, f_1295, 1, true),
      (v_tenant.tenant_id, v_mt_id, f_0008, 2, true),
      (v_tenant.tenant_id, v_mt_id, f_5406, 3, true),
      (v_tenant.tenant_id, v_mt_id, f_5532, 4, true),
      (v_tenant.tenant_id, v_mt_id, f_5669, 5, true),
      (v_tenant.tenant_id, v_mt_id, f_5476, 6, false),
      (v_tenant.tenant_id, v_mt_id, f_1283, 7, true),
      (v_tenant.tenant_id, v_mt_id, f_5562, 8, false),
      (v_tenant.tenant_id, v_mt_id, f_5533, 9, false),
      (v_tenant.tenant_id, v_mt_id, f_5589, 10, false);


    -- ══════════════════════════════════════════════════════════════════════════
    -- 3. INSERT FORM SECTIONS (Wizard Steps)
    -- ══════════════════════════════════════════════════════════════════════════

    -- Step 1: Sponsor Information (IMM 1295E)
    s_sponsor_personal := gen_random_uuid();
    s_sponsor_status := gen_random_uuid();
    s_sponsor_eligibility := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_sponsor_personal, v_tenant.tenant_id, f_1295, 'sponsor_personal',
       'Sponsor — Personal Details',
       'Enter the personal information of the sponsor (the Canadian citizen or permanent resident). All fields must match your government-issued ID.',
       1),
      (s_sponsor_status, v_tenant.tenant_id, f_1295, 'sponsor_status',
       'Sponsor — Immigration Status',
       'Provide details about your Canadian citizenship or permanent residence status.',
       2),
      (s_sponsor_eligibility, v_tenant.tenant_id, f_1295, 'sponsor_eligibility',
       'Sponsor — Eligibility & Declaration',
       'Answer these questions honestly. They determine your eligibility to sponsor. Providing false information can lead to your application being refused or criminal charges.',
       3);

    -- Step 2: Applicant Personal Details (IMM 0008E)
    s_applicant_personal := gen_random_uuid();
    s_applicant_passport := gen_random_uuid();
    s_applicant_contact := gen_random_uuid();
    s_applicant_language := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_applicant_personal, v_tenant.tenant_id, f_0008, 'applicant_personal',
       'Applicant — Personal Details',
       'Enter the personal information of the person being sponsored (the applicant). All names must match the passport or travel document exactly.',
       1),
      (s_applicant_passport, v_tenant.tenant_id, f_0008, 'applicant_passport',
       'Applicant — Passport & Travel Document',
       'Provide your passport or travel document details. Make sure all information matches your physical document.',
       2),
      (s_applicant_contact, v_tenant.tenant_id, f_0008, 'applicant_contact',
       'Applicant — Contact Information',
       'Provide your current mailing and residential addresses, phone numbers, and email address. IRCC will use this information to contact you about your application.',
       3),
      (s_applicant_language, v_tenant.tenant_id, f_0008, 'applicant_language',
       'Applicant — Language Abilities',
       'Indicate your ability to communicate in English and/or French.',
       4);

    -- Step 3: Family Information (IMM 5406E)
    s_family_spouse := gen_random_uuid();
    s_family_children := gen_random_uuid();
    s_family_parents := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_family_spouse, v_tenant.tenant_id, f_5406, 'family_spouse',
       'Family — Spouse / Partner',
       'Provide details about your current spouse or common-law partner.',
       1),
      (s_family_children, v_tenant.tenant_id, f_5406, 'family_children',
       'Family — Children & Dependants',
       'List ALL your children (biological, adopted, or stepchildren) whether or not they are accompanying you. Include children from all relationships.',
       2),
      (s_family_parents, v_tenant.tenant_id, f_5406, 'family_parents',
       'Family — Parents & Siblings',
       'Provide details about your parents and siblings.',
       3);

    -- Step 4: Relationship Details (IMM 5532E)
    s_rel_type := gen_random_uuid();
    s_rel_history := gen_random_uuid();
    s_rel_cohabitation := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_rel_type, v_tenant.tenant_id, f_5532, 'relationship_type',
       'Relationship — Type & Status',
       'Indicate the type of relationship between you and the sponsor. This determines which document checklist you need to complete.',
       1),
      (s_rel_history, v_tenant.tenant_id, f_5532, 'relationship_history',
       'Relationship — How You Met & Timeline',
       'Describe how your relationship began and developed. Be specific with dates and details. IRCC uses this to assess the genuineness of your relationship.',
       2),
      (s_rel_cohabitation, v_tenant.tenant_id, f_5532, 'relationship_cohabitation',
       'Relationship — Living Arrangements',
       'Provide details about your current and past living arrangements together. If you are not living together, explain why.',
       3);

    -- Step 5: Background & Declaration (IMM 5669E)
    s_bg_education := gen_random_uuid();
    s_bg_employment := gen_random_uuid();
    s_bg_security := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_bg_education, v_tenant.tenant_id, f_5669, 'background_education',
       'Background — Education History',
       'List all post-secondary education (university, college, trade school) starting with the most recent. Include any education you are currently enrolled in.',
       1),
      (s_bg_employment, v_tenant.tenant_id, f_5669, 'background_employment',
       'Background — Employment History (Past 10 Years)',
       'List all periods of employment, self-employment, unemployment, and study for the past 10 years. Do not leave any gaps in the timeline.',
       2),
      (s_bg_security, v_tenant.tenant_id, f_5669, 'background_security',
       'Background — Security & Declaration',
       'Answer all background questions truthfully. These questions relate to your admissibility to Canada. Answering "Yes" does not automatically disqualify you, but providing false information will.',
       3);

    -- Step 6: Representative (IMM 5476E)
    s_rep_details := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_rep_details, v_tenant.tenant_id, f_5476, 'representative_details',
       'Representative Information',
       'If you are using an immigration representative (lawyer or consultant), provide their details here. If you are completing this application on your own, you may skip this section.',
       1);

    -- Step 7: Financial Information (IMM 1283)
    s_fin_income := gen_random_uuid();
    s_fin_assets := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_fin_income, v_tenant.tenant_id, f_1283, 'financial_income',
       'Financial — Income & Employment',
       'Provide your annual income for the past 3 calendar years. This should match your Notice of Assessment from the Canada Revenue Agency (CRA).',
       1),
      (s_fin_assets, v_tenant.tenant_id, f_1283, 'financial_assets',
       'Financial — Assets, Liabilities & Obligations',
       'List your total assets, liabilities, and any current sponsorship undertaking obligations.',
       2);

    -- Step 8: Supplementary Info (IMM 5562)
    s_supp_info := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_supp_info, v_tenant.tenant_id, f_5562, 'supplementary_info',
       'Supplementary Information',
       'Use this section to provide any additional information that could not be included in the other forms, such as explanations for gaps in employment or additional travel history.',
       1);

    -- Step 9: Document Checklists (conditional)
    s_checklist_married := gen_random_uuid();
    s_checklist_commonlaw := gen_random_uuid();

    INSERT INTO ircc_form_sections (id, tenant_id, form_id, section_key, title, description, sort_order) VALUES
      (s_checklist_married, v_tenant.tenant_id, f_5589, 'checklist_married',
       'Document Checklist — Married Spouse',
       'Review the list of required documents for your spousal sponsorship application. You will need to gather and upload these documents after completing this questionnaire.',
       1),
      (s_checklist_commonlaw, v_tenant.tenant_id, f_5533, 'checklist_commonlaw',
       'Document Checklist — Common-Law Partner',
       'Review the list of required documents for your common-law partner sponsorship application. Common-law partners must provide additional evidence of cohabitation for at least 12 months.',
       1);


    -- ══════════════════════════════════════════════════════════════════════════
    -- 4. INSERT FORM FIELDS
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── STEP 1: Sponsor Personal Details (IMM 1295E) ─────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.family_name', 'text', 'Family Name', 'sponsor.family_name', 'Family Name(s)', 'text', true, 'As it appears on your government-issued ID (passport, citizenship card, or PR card).', 'Enter family name(s)', s_sponsor_personal, 1, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.given_name', 'text', 'Given Name', 'sponsor.given_name', 'Given Name(s)', 'text', true, 'As it appears on your government-issued ID.', 'Enter given name(s)', s_sponsor_personal, 2, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.date_of_birth', 'date', 'Date of Birth', 'sponsor.date_of_birth', 'Date of Birth', 'date', true, 'Your date of birth as shown on your ID.', 'YYYY-MM-DD', s_sponsor_personal, 3, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.sex', 'select', 'Sex', 'sponsor.sex', 'Sex', 'select', true, NULL, NULL, s_sponsor_personal, 4, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.citizenship', 'country', 'Country of Citizenship', 'sponsor.citizenship', 'Country of Citizenship', 'country', true, 'If you are a Canadian citizen, select "Canada".', NULL, s_sponsor_personal, 5, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.address_street', 'text', 'Street Address', 'sponsor.address.street_name', 'Current Residential Address — Street', 'text', true, 'Your current residential address in Canada.', 'Street number and name', s_sponsor_personal, 6, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.address_city', 'text', 'City', 'sponsor.address.city', 'City', 'text', true, NULL, 'City', s_sponsor_personal, 7, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.address_province', 'text', 'Province', 'sponsor.address.province_state', 'Province / Territory', 'text', true, NULL, 'Province', s_sponsor_personal, 8, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.address_postal', 'text', 'Postal Code', 'sponsor.address.postal_code', 'Postal Code', 'text', true, 'Format: A1A 1A1', 'A1A 1A1', s_sponsor_personal, 9, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.telephone', 'text', 'Telephone', 'sponsor.telephone', 'Phone Number', 'phone', true, 'Include area code.', '+1 (___) ___-____', s_sponsor_personal, 10, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.email', 'text', 'Email', 'sponsor.email', 'Email Address', 'email', true, 'IRCC may use this to contact you.', 'email@example.com', s_sponsor_personal, 11, true);

    -- ── Sponsor Immigration Status ───────────────────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, options) VALUES
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.is_citizen_or_pr', 'select', 'Status in Canada', 'sponsor.is_citizen_or_pr', 'Are you a Canadian citizen or permanent resident?', 'select', true, 'You must be a Canadian citizen or permanent resident to sponsor.', s_sponsor_status, 1, true,
       '[{"label":"Canadian Citizen","value":"citizen"},{"label":"Permanent Resident","value":"permanent_resident"}]'::jsonb),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.date_became_citizen_or_pr', 'date', 'Date Became', 'sponsor.date_became_citizen_or_pr', 'Date you became a citizen / permanent resident', 'date', true, 'The date on your citizenship certificate or Confirmation of Permanent Residence (COPR).', s_sponsor_status, 2, true, NULL),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.employer', 'text', 'Current Employer', 'sponsor.employer', 'Current Employer / Occupation', 'text', false, 'If self-employed, enter "Self-Employed" and your type of business.', s_sponsor_status, 3, true, NULL),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.annual_income', 'number', 'Annual Income', 'sponsor.annual_income', 'Annual Income (CAD)', 'number', false, 'Your total annual income before taxes.', s_sponsor_status, 4, true, NULL);

    -- ── Sponsor Eligibility ──────────────────────────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.previous_sponsorships', 'boolean', 'Previous Sponsorships', 'sponsor.previous_sponsorships', 'Have you previously sponsored anyone to come to Canada?', 'boolean', true, 'Include sponsorships that are still in effect or have been completed.', s_sponsor_eligibility, 1, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.defaulted_on_sponsorship', 'boolean', 'Default on Sponsorship', 'sponsor.defaulted_on_sponsorship', 'Have you ever defaulted on a previous sponsorship undertaking?', 'boolean', true, 'This means you or the person you sponsored received government social assistance during the undertaking period.', s_sponsor_eligibility, 2, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.subject_of_removal_order', 'boolean', 'Removal Order', 'sponsor.subject_of_removal_order', 'Are you subject to a removal order?', 'boolean', true, 'A removal order is a legal order to leave Canada.', s_sponsor_eligibility, 3, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.convicted_of_offence', 'boolean', 'Criminal Conviction', 'sponsor.convicted_of_offence', 'Have you been convicted of a violent or sexual offence?', 'boolean', true, 'Certain criminal convictions may prevent you from sponsoring.', s_sponsor_eligibility, 4, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.receiving_social_assistance', 'boolean', 'Social Assistance', 'sponsor.receiving_social_assistance', 'Are you currently receiving social assistance (other than disability)?', 'boolean', true, 'Sponsors cannot be receiving government social assistance other than for disability reasons.', s_sponsor_eligibility, 5, true),
      (v_tenant.tenant_id, f_1295, 'imm1295.sponsor.bankruptcy', 'boolean', 'Bankruptcy', 'sponsor.bankruptcy', 'Are you an undischarged bankrupt?', 'boolean', true, 'An undischarged bankrupt cannot sponsor.', s_sponsor_eligibility, 6, true);


    -- ── STEP 2: Applicant Personal Details (IMM 0008E) ───────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.family_name', 'text', 'Family Name', 'personal.family_name', 'Family Name(s)', 'text', true, 'Exactly as it appears on your passport or travel document.', 'Enter family name(s)', s_applicant_personal, 1, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.given_name', 'text', 'Given Name', 'personal.given_name', 'Given Name(s)', 'text', true, 'Exactly as it appears on your passport.', 'Enter given name(s)', s_applicant_personal, 2, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.uci', 'text', 'UCI', 'personal.uci_number', 'Unique Client Identifier (UCI)', 'text', false, 'If you have previously applied to IRCC, you may have a UCI number. Leave blank if you do not have one.', 'e.g. 1234-5678', s_applicant_personal, 3, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.sex', 'select', 'Sex', 'personal.sex', 'Sex', 'select', true, NULL, NULL, s_applicant_personal, 4, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.dob', 'date', 'Date of Birth', 'personal.date_of_birth', 'Date of Birth', 'date', true, 'Enter your date of birth.', 'YYYY-MM-DD', s_applicant_personal, 5, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.pob_city', 'text', 'Place of Birth City', 'personal.place_of_birth_city', 'Place of Birth — City / Town', 'text', true, NULL, 'City or town', s_applicant_personal, 6, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.pob_country', 'country', 'Place of Birth Country', 'personal.place_of_birth_country', 'Place of Birth — Country', 'country', true, NULL, NULL, s_applicant_personal, 7, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.citizenship', 'country', 'Citizenship', 'personal.citizenship', 'Country of Citizenship', 'country', true, 'The country where you hold citizenship.', NULL, s_applicant_personal, 8, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.cor', 'country', 'Country of Residence', 'personal.current_country_of_residence', 'Current Country of Residence', 'country', true, 'The country where you currently live.', NULL, s_applicant_personal, 9, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.personal.marital_status', 'select', 'Marital Status', 'marital.status', 'Current Marital Status', 'select', true, NULL, NULL, s_applicant_personal, 10, true);

    -- Passport
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_0008, 'imm0008.passport.number', 'text', 'Passport Number', 'passport.number', 'Passport / Travel Document Number', 'text', true, 'Enter the number exactly as it appears on your passport.', 'e.g. AB1234567', s_applicant_passport, 1, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.passport.country', 'country', 'Issuing Country', 'passport.country_of_issue', 'Country of Issue', 'country', true, NULL, NULL, s_applicant_passport, 2, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.passport.issue_date', 'date', 'Issue Date', 'passport.issue_date', 'Issue Date', 'date', true, NULL, 'YYYY-MM-DD', s_applicant_passport, 3, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.passport.expiry_date', 'date', 'Expiry Date', 'passport.expiry_date', 'Expiry Date', 'date', true, 'Your passport must be valid for at least 1 year.', 'YYYY-MM-DD', s_applicant_passport, 4, true);

    -- Contact
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.address_street', 'text', 'Street', 'contact_info.mailing_address.street_name', 'Mailing Address — Street', 'text', true, 'This is where IRCC will send correspondence.', 'Street number and name', s_applicant_contact, 1, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.address_city', 'text', 'City', 'contact_info.mailing_address.city', 'City', 'text', true, NULL, 'City', s_applicant_contact, 2, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.address_country', 'country', 'Country', 'contact_info.mailing_address.country', 'Country', 'country', true, NULL, NULL, s_applicant_contact, 3, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.address_postal', 'text', 'Postal Code', 'contact_info.mailing_address.postal_code', 'Postal / ZIP Code', 'text', false, NULL, 'Postal code', s_applicant_contact, 4, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.telephone', 'text', 'Phone', 'contact_info.telephone', 'Phone Number', 'phone', true, 'Include country and area code.', '+1 (___) ___-____', s_applicant_contact, 5, true),
      (v_tenant.tenant_id, f_0008, 'imm0008.contact.email', 'text', 'Email', 'contact_info.email', 'Email Address', 'email', true, NULL, 'email@example.com', s_applicant_contact, 6, true);

    -- Language
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, options) VALUES
      (v_tenant.tenant_id, f_0008, 'imm0008.language.native', 'text', 'Native Language', 'language.native_language', 'Native Language / Mother Tongue', 'text', true, NULL, s_applicant_language, 1, true, NULL),
      (v_tenant.tenant_id, f_0008, 'imm0008.language.english', 'select', 'English Ability', 'language.english_ability', 'Ability to Communicate in English', 'select', true, NULL, s_applicant_language, 2, true,
       '[{"label":"None","value":"none"},{"label":"Basic","value":"basic"},{"label":"Moderate","value":"moderate"},{"label":"Fluent","value":"fluent"}]'::jsonb),
      (v_tenant.tenant_id, f_0008, 'imm0008.language.french', 'select', 'French Ability', 'language.french_ability', 'Ability to Communicate in French', 'select', true, NULL, s_applicant_language, 3, true,
       '[{"label":"None","value":"none"},{"label":"Basic","value":"basic"},{"label":"Moderate","value":"moderate"},{"label":"Fluent","value":"fluent"}]'::jsonb),
      (v_tenant.tenant_id, f_0008, 'imm0008.language.preferred', 'select', 'Preferred Language', 'language.preferred_language', 'Preferred Language of Correspondence', 'select', true, 'IRCC will communicate with you in this language.', s_applicant_language, 4, true,
       '[{"label":"English","value":"english"},{"label":"French","value":"french"}]'::jsonb);


    -- ── STEP 3: Family Information (IMM 5406E) ───────────────────────────────

    -- Spouse
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5406, 'imm5406.spouse.family_name', 'text', 'Spouse Family Name', 'family.spouse.family_name', 'Spouse — Family Name', 'text', true, NULL, 'Family name', s_family_spouse, 1, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.spouse.given_name', 'text', 'Spouse Given Name', 'family.spouse.given_name', 'Spouse — Given Name', 'text', true, NULL, 'Given name', s_family_spouse, 2, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.spouse.dob', 'date', 'Spouse DOB', 'family.spouse.date_of_birth', 'Spouse — Date of Birth', 'date', true, NULL, 'YYYY-MM-DD', s_family_spouse, 3, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.spouse.country_of_birth', 'country', 'Spouse Country of Birth', 'family.spouse.country_of_birth', 'Spouse — Country of Birth', 'country', false, NULL, NULL, s_family_spouse, 4, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.spouse.relationship', 'text', 'Relationship', 'family.spouse.relationship', 'Relationship to You', 'text', false, 'e.g., Husband, Wife, Common-law Partner', 'Husband / Wife / Common-law Partner', s_family_spouse, 5, true);

    -- Parents
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5406, 'imm5406.mother.family_name', 'text', 'Mother Family Name', 'family.mother.family_name', 'Mother — Family Name', 'text', true, 'As it appears on official documents.', 'Family name', s_family_parents, 1, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.mother.given_name', 'text', 'Mother Given Name', 'family.mother.given_name', 'Mother — Given Name', 'text', true, NULL, 'Given name', s_family_parents, 2, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.mother.dob', 'date', 'Mother DOB', 'family.mother.date_of_birth', 'Mother — Date of Birth', 'date', false, 'If unknown, enter approximate year.', 'YYYY-MM-DD', s_family_parents, 3, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.father.family_name', 'text', 'Father Family Name', 'family.father.family_name', 'Father — Family Name', 'text', true, NULL, 'Family name', s_family_parents, 4, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.father.given_name', 'text', 'Father Given Name', 'family.father.given_name', 'Father — Given Name', 'text', true, NULL, 'Given name', s_family_parents, 5, true),
      (v_tenant.tenant_id, f_5406, 'imm5406.father.dob', 'date', 'Father DOB', 'family.father.date_of_birth', 'Father — Date of Birth', 'date', false, NULL, 'YYYY-MM-DD', s_family_parents, 6, true);


    -- ── STEP 4: Relationship Details (IMM 5532E) ─────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, options) VALUES
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.type', 'select', 'Relationship Type', 'relationship.type', 'What is your relationship to the sponsor?', 'select', true, 'This determines which document checklist you need to complete later.', s_rel_type, 1, true,
       '[{"label":"Married","value":"married"},{"label":"Common-Law Partner (lived together 12+ months)","value":"common_law"},{"label":"Conjugal Partner (unable to live together)","value":"conjugal"}]'::jsonb),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.date', 'date', 'Date of Marriage / Start', 'relationship.date_of_marriage_or_start', 'Date of Marriage or Start of Relationship', 'date', true, 'For marriage: the date on your marriage certificate. For common-law: the date you began living together.', s_rel_type, 2, true, NULL);

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.how_met', 'textarea', 'How Did You Meet', 'relationship.how_met', 'How did you and the sponsor first meet?', 'textarea', true, 'Be specific — include the circumstances, location, and who introduced you if applicable.', 'Describe how you first met...', s_rel_history, 1, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.where_met_city', 'text', 'Where Met City', 'relationship.where_met_city', 'City / Town Where You Met', 'text', true, NULL, 'City or town', s_rel_history, 2, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.where_met_country', 'country', 'Where Met Country', 'relationship.where_met_country', 'Country Where You Met', 'country', true, NULL, NULL, s_rel_history, 3, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.date_first_met', 'date', 'Date First Met', 'relationship.date_first_met', 'Date You First Met in Person', 'date', true, 'The very first time you met face-to-face.', 'YYYY-MM-DD', s_rel_history, 4, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.in_person', 'boolean', 'Met in Person', 'relationship.in_person_meeting', 'Have you met your sponsor in person?', 'boolean', true, 'IRCC requires that you have met in person at least once for most applications.', NULL, s_rel_history, 5, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.communicate_language', 'text', 'Communication Language', 'relationship.communicate_language', 'In what language do you and the sponsor communicate?', 'text', true, NULL, 'e.g., English, French, Arabic', s_rel_history, 6, true);

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.lived_together', 'boolean', 'Lived Together', 'relationship.lived_together', 'Have you and the sponsor ever lived together?', 'boolean', true, 'For common-law partners, you must have lived together for at least 12 continuous months.', NULL, s_rel_cohabitation, 1, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.lived_together_from', 'date', 'Lived Together From', 'relationship.lived_together_from', 'From Date', 'date', false, 'When did you start living together?', 'YYYY-MM-DD', s_rel_cohabitation, 2, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.lived_together_to', 'date', 'Lived Together To', 'relationship.lived_together_to', 'To Date (if applicable)', 'date', false, 'Leave blank if you are still living together.', 'YYYY-MM-DD or leave blank', s_rel_cohabitation, 3, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.currently_living', 'boolean', 'Currently Living Together', 'relationship.currently_living_together', 'Are you currently living together?', 'boolean', true, NULL, NULL, s_rel_cohabitation, 4, true),
      (v_tenant.tenant_id, f_5532, 'imm5532.rel.children_together', 'boolean', 'Children Together', 'relationship.children_together', 'Do you have children together?', 'boolean', true, 'Include biological, adopted, and step-children.', NULL, s_rel_cohabitation, 5, true);


    -- ── STEP 5: Background & Declaration (IMM 5669E) ─────────────────────────

    -- Education
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, options) VALUES
      (v_tenant.tenant_id, f_5669, 'imm5669.education.has_post_secondary', 'boolean', 'Post-Secondary', 'education.has_post_secondary', 'Have you attended any post-secondary education?', 'boolean', true, 'University, college, technical school, or trade school.', s_bg_education, 1, true, NULL),
      (v_tenant.tenant_id, f_5669, 'imm5669.education.highest_level', 'select', 'Highest Level', 'education.highest_level', 'Highest Level of Education Completed', 'select', true, NULL, s_bg_education, 2, true,
       '[{"label":"No formal education","value":"none"},{"label":"Primary school","value":"primary"},{"label":"Secondary / High school","value":"secondary"},{"label":"Trade / Apprenticeship","value":"trade"},{"label":"College diploma","value":"college"},{"label":"Bachelor''s degree","value":"bachelors"},{"label":"Master''s degree","value":"masters"},{"label":"Doctorate (PhD)","value":"doctorate"}]'::jsonb);

    -- Security
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.criminal', 'boolean', 'Criminal Record', 'background.criminal_record', 'Have you ever been convicted of or charged with a criminal offence in any country?', 'boolean', true, 'Include any offence, even if pardoned or expunged.', s_bg_security, 1, true),
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.refused_visa', 'boolean', 'Refused Visa', 'background.refused_visa', 'Have you ever been refused a visa or permit, denied entry, or ordered to leave any country?', 'boolean', true, NULL, s_bg_security, 2, true),
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.military', 'boolean', 'Military Service', 'background.military_service', 'Have you ever served in any military, militia, or civil defence unit?', 'boolean', true, 'Include mandatory military service (conscription).', s_bg_security, 3, true),
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.government', 'boolean', 'Government Position', 'background.government_position', 'Have you ever held a government position or been associated with a political party?', 'boolean', true, NULL, s_bg_security, 4, true),
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.organization', 'boolean', 'Organization Involvement', 'background.organization_involvement', 'Have you been a member of or associated with any organization, group, or movement?', 'boolean', true, 'Include professional, social, cultural, or political organizations.', s_bg_security, 5, true),
      (v_tenant.tenant_id, f_5669, 'imm5669.bg.health_condition', 'boolean', 'Health Condition', 'background.physical_mental_disorder', 'Do you have any physical or mental health condition that may affect your ability to work or require social services?', 'boolean', true, NULL, s_bg_security, 6, true);


    -- ── STEP 6: Representative (IMM 5476E) ───────────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, options) VALUES
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.has_rep', 'boolean', 'Has Representative', 'representative.has_representative', 'Are you using an immigration representative?', 'boolean', true, 'A representative is a person who has your permission to conduct business with IRCC on your behalf.', s_rep_details, 1, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.type', 'select', 'Rep Type', 'representative.rep_type', 'Type of Representative', 'select', false, NULL, s_rep_details, 2, true,
       '[{"label":"Paid representative (lawyer or RCIC)","value":"paid"},{"label":"Unpaid representative (friend, family, NGO)","value":"unpaid"}]'::jsonb),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.family_name', 'text', 'Rep Family Name', 'representative.rep_family_name', 'Representative — Family Name', 'text', false, NULL, s_rep_details, 3, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.given_name', 'text', 'Rep Given Name', 'representative.rep_given_name', 'Representative — Given Name', 'text', false, NULL, s_rep_details, 4, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.organization', 'text', 'Organization', 'representative.rep_organization', 'Organization / Firm Name', 'text', false, NULL, s_rep_details, 5, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.membership_id', 'text', 'RCIC/Law Society #', 'representative.rep_membership_id', 'RCIC / Law Society Membership Number', 'text', false, 'For paid representatives, this number is required.', s_rep_details, 6, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.telephone', 'text', 'Rep Phone', 'representative.rep_telephone', 'Representative — Phone Number', 'phone', false, NULL, s_rep_details, 7, true, NULL),
      (v_tenant.tenant_id, f_5476, 'imm5476.rep.email', 'text', 'Rep Email', 'representative.rep_email', 'Representative — Email', 'email', false, NULL, s_rep_details, 8, true, NULL);


    -- ── STEP 7: Financial (IMM 1283) ─────────────────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_1283, 'imm1283.income.year1', 'number', 'Income Year 1', 'financial.income_year1', 'Total Income — Most Recent Tax Year (CAD)', 'number', true, 'As reported on your Notice of Assessment (NOA) from CRA. This is your Line 15000 (Total Income).', '0.00', s_fin_income, 1, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.income.year2', 'number', 'Income Year 2', 'financial.income_year2', 'Total Income — Second Most Recent Tax Year (CAD)', 'number', true, 'Line 15000 from your NOA for the year before last.', '0.00', s_fin_income, 2, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.income.year3', 'number', 'Income Year 3', 'financial.income_year3', 'Total Income — Third Most Recent Tax Year (CAD)', 'number', true, 'Line 15000 from your NOA for two years ago.', '0.00', s_fin_income, 3, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.fin.dependants', 'number', 'Number of Dependants', 'financial.number_of_dependants', 'Total Number of Dependants', 'number', true, 'Include yourself, your spouse/partner, and any children or other dependants.', '0', s_fin_income, 4, true);

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_1283, 'imm1283.fin.assets', 'number', 'Total Assets', 'financial.total_assets', 'Total Assets (CAD)', 'number', false, 'Include savings, investments, property, vehicles, etc.', '0.00', s_fin_assets, 1, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.fin.liabilities', 'number', 'Total Liabilities', 'financial.total_liabilities', 'Total Liabilities (CAD)', 'number', false, 'Include loans, credit card debt, mortgages, etc.', '0.00', s_fin_assets, 2, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.fin.obligations', 'number', 'Sponsorship Obligations', 'financial.current_sponsorship_obligations', 'Current Sponsorship Undertaking Obligations (CAD)', 'number', false, 'If you have any active sponsorship undertakings, enter the total annual obligation amount.', '0.00', s_fin_assets, 3, true),
      (v_tenant.tenant_id, f_1283, 'imm1283.fin.gov_assistance', 'boolean', 'Government Assistance', 'financial.receiving_government_assistance', 'Are you receiving any government financial assistance?', 'boolean', false, 'Other than disability benefits.', NULL, s_fin_assets, 4, true);


    -- ── STEP 8: Supplementary (IMM 5562) ─────────────────────────────────────

    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, placeholder, section_id, sort_order, is_mapped) VALUES
      (v_tenant.tenant_id, f_5562, 'imm5562.supp.additional', 'textarea', 'Additional Info', 'supplementary.additional_info', 'Additional Information', 'textarea', false, 'Use this space to provide any additional information that you were not able to include in the other forms. For example: explanations for gaps in employment, additional travel history, or clarification of previous answers.', 'Enter any additional information here...', s_supp_info, 1, true);


    -- ── STEP 9: Document Checklists (conditional on relationship type) ────────

    -- Married checklist items (IMM 5589)
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, show_when) VALUES
      (v_tenant.tenant_id, f_5589, 'imm5589.checklist.marriage_cert', 'boolean', 'Marriage Certificate', 'checklist.marriage_certificate', 'Marriage Certificate — Certified true copy', 'boolean', true, 'Must be an official document issued by a civil authority or religious institution.', s_checklist_married, 1, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"married"}'::jsonb),
      (v_tenant.tenant_id, f_5589, 'imm5589.checklist.proof_termination', 'boolean', 'Proof of Termination', 'checklist.proof_termination', 'Proof of termination of previous relationships (if applicable)', 'boolean', false, 'Divorce certificate, death certificate, or annulment documents for any previous marriage(s).', s_checklist_married, 2, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"married"}'::jsonb),
      (v_tenant.tenant_id, f_5589, 'imm5589.checklist.photos', 'boolean', 'Photos Together', 'checklist.photos_together', 'Photos of you and your spouse together', 'boolean', true, 'Include photos from different times during your relationship. Clearly label the dates and occasions.', s_checklist_married, 3, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"married"}'::jsonb),
      (v_tenant.tenant_id, f_5589, 'imm5589.checklist.proof_communication', 'boolean', 'Proof of Communication', 'checklist.proof_communication', 'Proof of ongoing communication', 'boolean', true, 'Call logs, chat screenshots, email correspondence, etc.', s_checklist_married, 4, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"married"}'::jsonb);

    -- Common-law checklist items (IMM 5533)
    INSERT INTO ircc_form_fields (tenant_id, form_id, xfa_path, xfa_field_type, suggested_label, profile_path, label, field_type, is_required, description, section_id, sort_order, is_mapped, show_when) VALUES
      (v_tenant.tenant_id, f_5533, 'imm5533.checklist.cohabitation_proof', 'boolean', 'Cohabitation Proof', 'checklist.cohabitation_proof', 'Proof of cohabitation for at least 12 continuous months', 'boolean', true, 'Shared lease, utility bills, bank statements showing same address, mail addressed to both of you at the same address, etc.', s_checklist_commonlaw, 1, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"common_law"}'::jsonb),
      (v_tenant.tenant_id, f_5533, 'imm5533.checklist.statutory_declaration', 'boolean', 'Statutory Declaration', 'checklist.statutory_declaration', 'Statutory Declaration of Common-Law Union', 'boolean', true, 'A sworn statement declaring your common-law relationship, signed by both partners.', s_checklist_commonlaw, 2, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"common_law"}'::jsonb),
      (v_tenant.tenant_id, f_5533, 'imm5533.checklist.photos', 'boolean', 'Photos Together', 'checklist.cl_photos_together', 'Photos of you and your partner together', 'boolean', true, 'Include photos from different times during your relationship with dates.', s_checklist_commonlaw, 3, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"common_law"}'::jsonb),
      (v_tenant.tenant_id, f_5533, 'imm5533.checklist.proof_communication', 'boolean', 'Proof of Communication', 'checklist.cl_proof_communication', 'Proof of ongoing communication', 'boolean', true, 'Call logs, chat screenshots, email correspondence demonstrating ongoing contact.', s_checklist_commonlaw, 4, true,
       '{"profile_path":"relationship.type","operator":"equals","value":"common_law"}'::jsonb);

  END LOOP;
END $$;
