-- Migration 016: Smart Immigration Intake Forms
-- Creates 5 comprehensive multi-step intake forms for immigration practice:
--   1. Express Entry Assessment — CRS scoring questionnaire
--   2. Spousal Sponsorship Intake — Relationship & eligibility info
--   3. Work Permit Application Intake — Employer & work details
--   4. Study Permit Application Intake — School & study plan
--   5. Family Reunification Intake — Parent/grandparent sponsorship
--
-- Each form uses multi-step wizard sections, conditional fields, file uploads,
-- contact mapping, and auto-lead creation via the Immigration Lead Pipeline.

DO $$
DECLARE
  v_tenant_id UUID := 'db2d622e-8e75-4c17-91eb-184075e5ae57';
  v_user_id UUID;
  v_pa_id UUID;
  v_pipeline_id UUID;
  v_stage_id UUID;
BEGIN
  -- Get a user for created_by
  SELECT id INTO v_user_id FROM users WHERE tenant_id = v_tenant_id LIMIT 1;

  -- Get Immigration practice area
  SELECT id INTO v_pa_id FROM practice_areas
    WHERE tenant_id = v_tenant_id AND name ILIKE '%immigration%' AND is_active = true
    LIMIT 1;

  -- Get Immigration lead pipeline + first stage
  SELECT p.id, ps.id INTO v_pipeline_id, v_stage_id
    FROM pipelines p
    JOIN pipeline_stages ps ON ps.pipeline_id = p.id
    WHERE p.tenant_id = v_tenant_id
      AND p.pipeline_type = 'lead'
      AND p.is_active = true
      AND (p.practice_area ILIKE '%immigration%' OR p.is_default = true)
    ORDER BY
      CASE WHEN p.practice_area ILIKE '%immigration%' THEN 0 ELSE 1 END,
      p.is_default DESC,
      ps.sort_order ASC
    LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found for tenant — skipping seed';
    RETURN;
  END IF;

  -- =========================================================================
  -- FORM 1: Express Entry Assessment
  -- A comprehensive CRS-style eligibility questionnaire
  -- =========================================================================
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  ) VALUES (
    v_tenant_id,
    'Express Entry Assessment',
    'express-entry-assessment',
    'Complete this assessment to determine your eligibility for Express Entry immigration to Canada. Our team will review your profile and provide a CRS score estimate.',
    '[
      {"id":"ee_first_name","field_type":"text","label":"First Name","placeholder":"As shown on passport","is_required":true,"sort_order":0,"mapping":"first_name","section_id":"sec_ee_personal"},
      {"id":"ee_last_name","field_type":"text","label":"Last Name","placeholder":"As shown on passport","is_required":true,"sort_order":1,"mapping":"last_name","section_id":"sec_ee_personal"},
      {"id":"ee_email","field_type":"email","label":"Email Address","is_required":true,"sort_order":2,"mapping":"email_primary","section_id":"sec_ee_personal"},
      {"id":"ee_phone","field_type":"phone","label":"Phone Number","sort_order":3,"mapping":"phone_primary","section_id":"sec_ee_personal"},
      {"id":"ee_dob","field_type":"date","label":"Date of Birth","is_required":true,"sort_order":4,"section_id":"sec_ee_personal"},
      {"id":"ee_citizenship","field_type":"select","label":"Country of Citizenship","is_required":true,"sort_order":5,"allow_other":true,"section_id":"sec_ee_personal","options":[{"label":"India","value":"india"},{"label":"China","value":"china"},{"label":"Philippines","value":"philippines"},{"label":"Nigeria","value":"nigeria"},{"label":"Pakistan","value":"pakistan"},{"label":"Iran","value":"iran"},{"label":"Brazil","value":"brazil"},{"label":"Mexico","value":"mexico"},{"label":"South Korea","value":"south_korea"},{"label":"United States","value":"usa"}]},
      {"id":"ee_marital_status","field_type":"select","label":"Marital Status","is_required":true,"sort_order":6,"section_id":"sec_ee_personal","options":[{"label":"Single","value":"single"},{"label":"Married","value":"married"},{"label":"Common-Law","value":"common_law"},{"label":"Separated","value":"separated"},{"label":"Divorced","value":"divorced"},{"label":"Widowed","value":"widowed"}]},
      {"id":"ee_spouse_canadian","field_type":"select","label":"Is your spouse/partner a Canadian citizen or PR?","is_required":true,"sort_order":7,"section_id":"sec_ee_personal","condition":{"field_id":"ee_marital_status","operator":"in","value":["married","common_law"]},"options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]},
      {"id":"ee_spouse_coming","field_type":"select","label":"Will your spouse/partner accompany you to Canada?","is_required":true,"sort_order":8,"section_id":"sec_ee_personal","condition":{"field_id":"ee_spouse_canadian","operator":"equals","value":"no"},"options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]},

      {"id":"ee_education_level","field_type":"select","label":"Highest Level of Education","is_required":true,"sort_order":9,"section_id":"sec_ee_education","options":[{"label":"Less than High School","value":"less_than_hs"},{"label":"High School Diploma","value":"high_school"},{"label":"One-Year Post-Secondary","value":"one_year_post"},{"label":"Two-Year Post-Secondary","value":"two_year_post"},{"label":"Three-Year or More Post-Secondary (Bachelor''s)","value":"bachelors"},{"label":"Two or More Post-Secondary Credentials","value":"two_or_more"},{"label":"Master''s Degree","value":"masters"},{"label":"Doctoral Degree (PhD)","value":"phd"}]},
      {"id":"ee_education_canada","field_type":"select","label":"Was any of your education completed in Canada?","is_required":true,"sort_order":10,"section_id":"sec_ee_education","options":[{"label":"No","value":"no"},{"label":"Yes — 1-year credential","value":"1_year"},{"label":"Yes — 2-year credential","value":"2_year"},{"label":"Yes — 3+ year credential or Master''s/PhD","value":"3_plus_year"}]},
      {"id":"ee_eca_completed","field_type":"select","label":"Have you completed an Educational Credential Assessment (ECA)?","is_required":true,"sort_order":11,"section_id":"sec_ee_education","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"In Progress","value":"in_progress"}]},
      {"id":"ee_eca_organization","field_type":"select","label":"ECA Assessing Organization","sort_order":12,"section_id":"sec_ee_education","condition":{"field_id":"ee_eca_completed","operator":"equals","value":"yes"},"options":[{"label":"WES","value":"wes"},{"label":"IQAS","value":"iqas"},{"label":"CES","value":"ces"},{"label":"MCC","value":"mcc"},{"label":"PEBC","value":"pebc"}]},

      {"id":"ee_first_lang","field_type":"select","label":"First Official Language","is_required":true,"sort_order":13,"section_id":"sec_ee_language","options":[{"label":"English","value":"english"},{"label":"French","value":"french"}]},
      {"id":"ee_english_test","field_type":"select","label":"English Language Test Taken","is_required":true,"sort_order":14,"section_id":"sec_ee_language","condition":{"field_id":"ee_first_lang","operator":"equals","value":"english"},"options":[{"label":"IELTS General","value":"ielts"},{"label":"CELPIP General","value":"celpip"},{"label":"PTE Core","value":"pte_core"},{"label":"Not Yet Taken","value":"not_taken"}]},
      {"id":"ee_ielts_listening","field_type":"number","label":"IELTS Listening Score","placeholder":"e.g. 8.0","sort_order":15,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"ielts"}},
      {"id":"ee_ielts_reading","field_type":"number","label":"IELTS Reading Score","placeholder":"e.g. 7.5","sort_order":16,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"ielts"}},
      {"id":"ee_ielts_writing","field_type":"number","label":"IELTS Writing Score","placeholder":"e.g. 7.0","sort_order":17,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"ielts"}},
      {"id":"ee_ielts_speaking","field_type":"number","label":"IELTS Speaking Score","placeholder":"e.g. 7.5","sort_order":18,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"ielts"}},
      {"id":"ee_celpip_listening","field_type":"number","label":"CELPIP Listening Score","placeholder":"e.g. 10","sort_order":19,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"celpip"}},
      {"id":"ee_celpip_reading","field_type":"number","label":"CELPIP Reading Score","placeholder":"e.g. 9","sort_order":20,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"celpip"}},
      {"id":"ee_celpip_writing","field_type":"number","label":"CELPIP Writing Score","placeholder":"e.g. 10","sort_order":21,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"celpip"}},
      {"id":"ee_celpip_speaking","field_type":"number","label":"CELPIP Speaking Score","placeholder":"e.g. 10","sort_order":22,"section_id":"sec_ee_language","condition":{"field_id":"ee_english_test","operator":"equals","value":"celpip"}},
      {"id":"ee_second_lang","field_type":"select","label":"Do you have second official language test scores?","sort_order":23,"section_id":"sec_ee_language","options":[{"label":"No","value":"no"},{"label":"Yes — French (TEF/TCF)","value":"french"},{"label":"Yes — English","value":"english"}]},

      {"id":"ee_work_experience_canada","field_type":"select","label":"Years of Skilled Work Experience in Canada","is_required":true,"sort_order":24,"section_id":"sec_ee_work","options":[{"label":"None","value":"0"},{"label":"1 year","value":"1"},{"label":"2 years","value":"2"},{"label":"3 years","value":"3"},{"label":"4 years","value":"4"},{"label":"5+ years","value":"5_plus"}]},
      {"id":"ee_work_experience_foreign","field_type":"select","label":"Years of Skilled Work Experience Outside Canada","is_required":true,"sort_order":25,"section_id":"sec_ee_work","options":[{"label":"None","value":"0"},{"label":"1-2 years","value":"1_2"},{"label":"3-4 years","value":"3_4"},{"label":"5+ years","value":"5_plus"}]},
      {"id":"ee_noc_code","field_type":"text","label":"Primary Occupation NOC Code (if known)","placeholder":"e.g. 21232 — Software Developer","sort_order":26,"section_id":"sec_ee_work"},
      {"id":"ee_job_offer","field_type":"select","label":"Do you have a valid Canadian job offer?","is_required":true,"sort_order":27,"section_id":"sec_ee_work","options":[{"label":"No","value":"no"},{"label":"Yes — TEER 0 (Senior Management)","value":"teer_0"},{"label":"Yes — TEER 1/2/3","value":"teer_123"},{"label":"Yes — LMIA supported","value":"lmia"}]},
      {"id":"ee_pnp_nomination","field_type":"select","label":"Do you have a Provincial Nominee Program (PNP) nomination?","is_required":true,"sort_order":28,"section_id":"sec_ee_work","options":[{"label":"No","value":"no"},{"label":"Yes","value":"yes"},{"label":"Applied — Awaiting","value":"applied"}]},
      {"id":"ee_pnp_province","field_type":"select","label":"Which province nominated you?","sort_order":29,"section_id":"sec_ee_work","condition":{"field_id":"ee_pnp_nomination","operator":"equals","value":"yes"},"allow_other":true,"options":[{"label":"Ontario (OINP)","value":"ontario"},{"label":"British Columbia (BCPNP)","value":"bc"},{"label":"Alberta (AINP)","value":"alberta"},{"label":"Saskatchewan (SINP)","value":"sask"},{"label":"Manitoba (MPNP)","value":"manitoba"},{"label":"Nova Scotia (NSNP)","value":"nova_scotia"},{"label":"New Brunswick (NBPNP)","value":"new_brunswick"}]},

      {"id":"ee_canadian_relative","field_type":"select","label":"Do you have a sibling who is a Canadian citizen or PR?","sort_order":30,"section_id":"sec_ee_additional","options":[{"label":"No","value":"no"},{"label":"Yes","value":"yes"}]},
      {"id":"ee_previous_refusal","field_type":"boolean","label":"Have you ever been refused a Canadian visa or immigration application?","sort_order":31,"section_id":"sec_ee_additional"},
      {"id":"ee_refusal_details","field_type":"textarea","label":"Refusal Details","placeholder":"Date, type of application, and reason if known","sort_order":32,"section_id":"sec_ee_additional","condition":{"field_id":"ee_previous_refusal","operator":"is_truthy"}},
      {"id":"ee_current_status_canada","field_type":"select","label":"Are you currently in Canada?","is_required":true,"sort_order":33,"section_id":"sec_ee_additional","options":[{"label":"No — Outside Canada","value":"outside"},{"label":"Yes — On Work Permit","value":"work_permit"},{"label":"Yes — On Study Permit","value":"study_permit"},{"label":"Yes — On Visitor Status","value":"visitor"},{"label":"Yes — PR / Citizen","value":"pr_citizen"}]},
      {"id":"ee_passport_copy","field_type":"file","label":"Passport Bio Page (optional)","description":"Upload a scan of your passport bio page for our assessment","sort_order":34,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_ee_additional"},
      {"id":"ee_additional_notes","field_type":"textarea","label":"Anything else you''d like us to know?","placeholder":"Additional details about your case, timeline, or questions...","sort_order":35,"mapping":"notes","section_id":"sec_ee_additional"},
      {"id":"ee_consent","field_type":"boolean","label":"I confirm the above information is accurate and I consent to being contacted about my assessment","is_required":true,"sort_order":36,"section_id":"sec_ee_additional"}
    ]'::jsonb,
    jsonb_build_object(
      'success_message', 'Thank you for completing your Express Entry assessment! Our immigration consultant will review your profile and contact you within 24-48 hours with a CRS score estimate and recommended pathway.',
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sec_ee_personal', 'title', 'Personal Information', 'description', 'Basic details about you and your family situation.', 'sort_order', 0),
        jsonb_build_object('id', 'sec_ee_education', 'title', 'Education', 'description', 'Tell us about your educational background.', 'sort_order', 1),
        jsonb_build_object('id', 'sec_ee_language', 'title', 'Language Proficiency', 'description', 'Official language test scores for English and/or French.', 'sort_order', 2),
        jsonb_build_object('id', 'sec_ee_work', 'title', 'Work Experience & Offers', 'description', 'Your skilled work experience and any Canadian job offers or nominations.', 'sort_order', 3),
        jsonb_build_object('id', 'sec_ee_additional', 'title', 'Additional Information', 'description', 'Final details and document uploads.', 'sort_order', 4)
      )
    ),
    v_pa_id, v_pipeline_id, v_stage_id,
    'published', true, v_user_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;


  -- =========================================================================
  -- FORM 2: Spousal Sponsorship Intake
  -- =========================================================================
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  ) VALUES (
    v_tenant_id,
    'Spousal Sponsorship Intake',
    'spousal-sponsorship-intake',
    'Begin the process for sponsoring your spouse or common-law partner for Canadian permanent residence. Please provide complete and accurate information.',
    '[
      {"id":"sp_sponsor_first","field_type":"text","label":"Sponsor''s First Name","is_required":true,"sort_order":0,"mapping":"first_name","section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_last","field_type":"text","label":"Sponsor''s Last Name","is_required":true,"sort_order":1,"mapping":"last_name","section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_email","field_type":"email","label":"Sponsor''s Email","is_required":true,"sort_order":2,"mapping":"email_primary","section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_phone","field_type":"phone","label":"Sponsor''s Phone Number","sort_order":3,"mapping":"phone_primary","section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_dob","field_type":"date","label":"Sponsor''s Date of Birth","is_required":true,"sort_order":4,"section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_status","field_type":"select","label":"Sponsor''s Immigration Status","is_required":true,"sort_order":5,"section_id":"sec_sp_sponsor","options":[{"label":"Canadian Citizen","value":"citizen"},{"label":"Permanent Resident","value":"pr"},{"label":"Registered Indian under the Indian Act","value":"registered_indian"}]},
      {"id":"sp_sponsor_address","field_type":"textarea","label":"Sponsor''s Current Address in Canada","placeholder":"Full address including city and province","is_required":true,"sort_order":6,"section_id":"sec_sp_sponsor"},
      {"id":"sp_sponsor_income","field_type":"select","label":"Sponsor''s Annual Income Range (CAD)","is_required":true,"sort_order":7,"section_id":"sec_sp_sponsor","options":[{"label":"Under $30,000","value":"under_30k"},{"label":"$30,000 – $50,000","value":"30k_50k"},{"label":"$50,000 – $80,000","value":"50k_80k"},{"label":"$80,000 – $120,000","value":"80k_120k"},{"label":"Over $120,000","value":"over_120k"}]},
      {"id":"sp_sponsor_previous_sponsor","field_type":"boolean","label":"Have you previously sponsored someone for immigration?","sort_order":8,"section_id":"sec_sp_sponsor"},
      {"id":"sp_previous_sponsor_details","field_type":"textarea","label":"Previous Sponsorship Details","placeholder":"Who did you sponsor, when, and what was the outcome?","sort_order":9,"section_id":"sec_sp_sponsor","condition":{"field_id":"sp_sponsor_previous_sponsor","operator":"is_truthy"}},

      {"id":"sp_applicant_first","field_type":"text","label":"Applicant''s First Name","is_required":true,"sort_order":10,"section_id":"sec_sp_applicant"},
      {"id":"sp_applicant_last","field_type":"text","label":"Applicant''s Last Name","is_required":true,"sort_order":11,"section_id":"sec_sp_applicant"},
      {"id":"sp_applicant_dob","field_type":"date","label":"Applicant''s Date of Birth","is_required":true,"sort_order":12,"section_id":"sec_sp_applicant"},
      {"id":"sp_applicant_citizenship","field_type":"select","label":"Applicant''s Country of Citizenship","is_required":true,"sort_order":13,"allow_other":true,"section_id":"sec_sp_applicant","options":[{"label":"India","value":"india"},{"label":"Philippines","value":"philippines"},{"label":"China","value":"china"},{"label":"Pakistan","value":"pakistan"},{"label":"Nigeria","value":"nigeria"},{"label":"Mexico","value":"mexico"},{"label":"Brazil","value":"brazil"}]},
      {"id":"sp_applicant_country","field_type":"select","label":"Applicant''s Country of Residence","is_required":true,"sort_order":14,"allow_other":true,"section_id":"sec_sp_applicant","options":[{"label":"Same as citizenship","value":"same"},{"label":"Canada","value":"canada"},{"label":"United States","value":"usa"},{"label":"United Kingdom","value":"uk"},{"label":"UAE","value":"uae"}]},
      {"id":"sp_applicant_in_canada","field_type":"select","label":"Is the applicant currently in Canada?","is_required":true,"sort_order":15,"section_id":"sec_sp_applicant","options":[{"label":"No — Apply Outland","value":"outland"},{"label":"Yes — Apply Inland","value":"inland"}]},
      {"id":"sp_applicant_status_canada","field_type":"select","label":"Applicant''s current status in Canada","sort_order":16,"section_id":"sec_sp_applicant","condition":{"field_id":"sp_applicant_in_canada","operator":"equals","value":"inland"},"options":[{"label":"Visitor","value":"visitor"},{"label":"Worker","value":"worker"},{"label":"Student","value":"student"},{"label":"Status expired / undocumented","value":"expired"}]},

      {"id":"sp_relationship_type","field_type":"select","label":"Relationship Type","is_required":true,"sort_order":17,"section_id":"sec_sp_relationship","options":[{"label":"Legally Married","value":"married"},{"label":"Common-Law Partner (12+ months cohabitation)","value":"common_law"},{"label":"Conjugal Partner (unable to live together)","value":"conjugal"}]},
      {"id":"sp_marriage_date","field_type":"date","label":"Date of Marriage or Start of Common-Law","is_required":true,"sort_order":18,"section_id":"sec_sp_relationship"},
      {"id":"sp_how_met","field_type":"select","label":"How Did You Meet?","is_required":true,"sort_order":19,"allow_other":true,"section_id":"sec_sp_relationship","options":[{"label":"In Person","value":"in_person"},{"label":"Online Dating","value":"online"},{"label":"Through Family/Friends","value":"family_friends"},{"label":"Social Media","value":"social_media"},{"label":"Work/School","value":"work_school"}]},
      {"id":"sp_met_in_person","field_type":"boolean","label":"Have you met in person?","is_required":true,"sort_order":20,"section_id":"sec_sp_relationship"},
      {"id":"sp_times_met","field_type":"text","label":"How many times and where have you met in person?","placeholder":"e.g. 5 times — visited India in 2023, 2024; spouse visited Canada in 2024","sort_order":21,"section_id":"sec_sp_relationship","condition":{"field_id":"sp_met_in_person","operator":"is_truthy"}},
      {"id":"sp_children_together","field_type":"select","label":"Do you have children together?","sort_order":22,"section_id":"sec_sp_relationship","options":[{"label":"No","value":"no"},{"label":"Yes — 1 child","value":"1"},{"label":"Yes — 2 children","value":"2"},{"label":"Yes — 3+ children","value":"3_plus"}]},
      {"id":"sp_relationship_summary","field_type":"textarea","label":"Brief Relationship Timeline","placeholder":"Describe your relationship from how you met to the present...","is_required":true,"sort_order":23,"section_id":"sec_sp_relationship"},

      {"id":"sp_marriage_cert","field_type":"file","label":"Marriage Certificate / Common-Law Declaration","description":"Upload your marriage certificate or statutory declaration of common-law union","is_required":true,"sort_order":24,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_sp_documents"},
      {"id":"sp_sponsor_id","field_type":"file","label":"Sponsor''s ID (Passport or PR Card)","description":"Clear copy of sponsor''s passport bio page or PR card (both sides)","is_required":true,"sort_order":25,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_sp_documents"},
      {"id":"sp_applicant_passport","field_type":"file","label":"Applicant''s Passport","description":"Clear copy of applicant''s passport bio page","is_required":true,"sort_order":26,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_sp_documents"},
      {"id":"sp_relationship_evidence","field_type":"file","label":"Relationship Evidence (Photos, Chat Logs, etc.)","description":"A compilation of photos, screenshots of communication, travel records, etc.","sort_order":27,"accept":".pdf,.jpg,.jpeg,.png,.zip","section_id":"sec_sp_documents"},

      {"id":"sp_additional_notes","field_type":"textarea","label":"Additional Information or Questions","placeholder":"Anything else relevant to your sponsorship case...","sort_order":28,"mapping":"notes","section_id":"sec_sp_documents"},
      {"id":"sp_consent","field_type":"boolean","label":"I confirm the above information is accurate and I consent to being contacted regarding this sponsorship application","is_required":true,"sort_order":29,"section_id":"sec_sp_documents"}
    ]'::jsonb,
    jsonb_build_object(
      'success_message', 'Thank you for submitting your spousal sponsorship intake! Our team will review your information and schedule a consultation within 2-3 business days.',
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sec_sp_sponsor', 'title', 'Sponsor Information', 'description', 'Details about the Canadian citizen or permanent resident who will be sponsoring.', 'sort_order', 0),
        jsonb_build_object('id', 'sec_sp_applicant', 'title', 'Applicant Information', 'description', 'Details about the person being sponsored (the foreign national).', 'sort_order', 1),
        jsonb_build_object('id', 'sec_sp_relationship', 'title', 'Relationship Details', 'description', 'Information about your relationship — genuineness is a key factor in sponsorship applications.', 'sort_order', 2),
        jsonb_build_object('id', 'sec_sp_documents', 'title', 'Documents & Final Details', 'description', 'Upload key documents and provide any additional information.', 'sort_order', 3)
      )
    ),
    v_pa_id, v_pipeline_id, v_stage_id,
    'published', true, v_user_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;


  -- =========================================================================
  -- FORM 3: Work Permit Application Intake
  -- =========================================================================
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  ) VALUES (
    v_tenant_id,
    'Work Permit Application Intake',
    'work-permit-intake',
    'Apply for a Canadian work permit. This form covers LMIA-based, LMIA-exempt, open work permits, and post-graduation work permits.',
    '[
      {"id":"wp_first_name","field_type":"text","label":"First Name","is_required":true,"sort_order":0,"mapping":"first_name","section_id":"sec_wp_personal"},
      {"id":"wp_last_name","field_type":"text","label":"Last Name","is_required":true,"sort_order":1,"mapping":"last_name","section_id":"sec_wp_personal"},
      {"id":"wp_email","field_type":"email","label":"Email Address","is_required":true,"sort_order":2,"mapping":"email_primary","section_id":"sec_wp_personal"},
      {"id":"wp_phone","field_type":"phone","label":"Phone Number","sort_order":3,"mapping":"phone_primary","section_id":"sec_wp_personal"},
      {"id":"wp_dob","field_type":"date","label":"Date of Birth","is_required":true,"sort_order":4,"section_id":"sec_wp_personal"},
      {"id":"wp_citizenship","field_type":"select","label":"Country of Citizenship","is_required":true,"sort_order":5,"allow_other":true,"section_id":"sec_wp_personal","options":[{"label":"India","value":"india"},{"label":"China","value":"china"},{"label":"Philippines","value":"philippines"},{"label":"Nigeria","value":"nigeria"},{"label":"Brazil","value":"brazil"},{"label":"Mexico","value":"mexico"},{"label":"United States","value":"usa"},{"label":"United Kingdom","value":"uk"},{"label":"France","value":"france"}]},
      {"id":"wp_current_location","field_type":"select","label":"Where are you currently located?","is_required":true,"sort_order":6,"section_id":"sec_wp_personal","options":[{"label":"In Canada","value":"in_canada"},{"label":"Outside Canada","value":"outside_canada"}]},
      {"id":"wp_current_status","field_type":"select","label":"Current Immigration Status in Canada","sort_order":7,"section_id":"sec_wp_personal","condition":{"field_id":"wp_current_location","operator":"equals","value":"in_canada"},"options":[{"label":"Study Permit","value":"study_permit"},{"label":"Work Permit","value":"work_permit"},{"label":"Visitor","value":"visitor"},{"label":"Implied Status","value":"implied"},{"label":"No Valid Status","value":"no_status"}]},
      {"id":"wp_status_expiry","field_type":"date","label":"Current Status Expiry Date","sort_order":8,"section_id":"sec_wp_personal","condition":{"field_id":"wp_current_location","operator":"equals","value":"in_canada"}},

      {"id":"wp_permit_type","field_type":"select","label":"Type of Work Permit Needed","is_required":true,"sort_order":9,"section_id":"sec_wp_work","options":[{"label":"Employer-Specific (LMIA-Based)","value":"lmia_based"},{"label":"Employer-Specific (LMIA-Exempt)","value":"lmia_exempt"},{"label":"Open Work Permit","value":"open"},{"label":"Post-Graduation Work Permit (PGWP)","value":"pgwp"},{"label":"Intra-Company Transfer","value":"ict"},{"label":"Not Sure — Need Consultation","value":"not_sure"}]},
      {"id":"wp_employer_name","field_type":"text","label":"Canadian Employer Name","placeholder":"Name of the company offering employment","is_required":true,"sort_order":10,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_employer_address","field_type":"textarea","label":"Employer''s Address","placeholder":"Full business address in Canada","sort_order":11,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_job_title","field_type":"text","label":"Job Title","placeholder":"e.g. Software Developer, Marketing Manager","is_required":true,"sort_order":12,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_noc_code","field_type":"text","label":"NOC Code (if known)","placeholder":"e.g. 21232","sort_order":13,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_salary","field_type":"text","label":"Annual Salary (CAD)","placeholder":"e.g. $85,000","sort_order":14,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_lmia_number","field_type":"text","label":"LMIA Number (if already obtained)","placeholder":"e.g. A1234567","sort_order":15,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"equals","value":"lmia_based"}},
      {"id":"wp_open_wp_reason","field_type":"select","label":"Reason for Open Work Permit","is_required":true,"sort_order":16,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"equals","value":"open"},"allow_other":true,"options":[{"label":"Spouse of Skilled Worker","value":"spouse_worker"},{"label":"Spouse of Student","value":"spouse_student"},{"label":"Bridging Open Work Permit","value":"bowp"},{"label":"Vulnerable Worker","value":"vulnerable"},{"label":"Humanitarian & Compassionate","value":"h_and_c"}]},
      {"id":"wp_pgwp_school","field_type":"text","label":"Name of Canadian Institution Attended","placeholder":"e.g. University of Toronto, Seneca College","sort_order":17,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"equals","value":"pgwp"}},
      {"id":"wp_pgwp_program_duration","field_type":"select","label":"Program Duration","sort_order":18,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"equals","value":"pgwp"},"options":[{"label":"8 months – 1 year","value":"8m_1y"},{"label":"1 – 2 years","value":"1_2y"},{"label":"2+ years","value":"2_plus"}]},
      {"id":"wp_pgwp_graduation_date","field_type":"date","label":"Date of Graduation / Completion","sort_order":19,"section_id":"sec_wp_work","condition":{"field_id":"wp_permit_type","operator":"equals","value":"pgwp"}},

      {"id":"wp_passport_copy","field_type":"file","label":"Passport Bio Page","description":"Clear copy of your passport bio page","is_required":true,"sort_order":20,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_wp_documents"},
      {"id":"wp_job_offer_letter","field_type":"file","label":"Job Offer Letter","description":"Signed offer letter from the Canadian employer","sort_order":21,"accept":".pdf","section_id":"sec_wp_documents","condition":{"field_id":"wp_permit_type","operator":"in","value":["lmia_based","lmia_exempt","ict"]}},
      {"id":"wp_lmia_copy","field_type":"file","label":"LMIA Approval Letter","description":"Copy of the LMIA approval from ESDC","sort_order":22,"accept":".pdf","section_id":"sec_wp_documents","condition":{"field_id":"wp_permit_type","operator":"equals","value":"lmia_based"}},
      {"id":"wp_resume","field_type":"file","label":"Resume / CV","description":"Your current resume","sort_order":23,"accept":".pdf,.doc,.docx","section_id":"sec_wp_documents"},
      {"id":"wp_additional_docs","field_type":"file","label":"Additional Supporting Documents","description":"Any other relevant documents (transcripts, reference letters, etc.)","sort_order":24,"accept":".pdf,.jpg,.jpeg,.png,.zip","section_id":"sec_wp_documents"},

      {"id":"wp_additional_notes","field_type":"textarea","label":"Additional Notes or Questions","placeholder":"Tell us anything else relevant to your work permit application...","sort_order":25,"mapping":"notes","section_id":"sec_wp_documents"},
      {"id":"wp_consent","field_type":"boolean","label":"I confirm the above information is accurate and consent to being contacted","is_required":true,"sort_order":26,"section_id":"sec_wp_documents"}
    ]'::jsonb,
    jsonb_build_object(
      'success_message', 'Thank you! Your work permit intake has been received. Our immigration team will review your application details and contact you within 1-2 business days.',
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sec_wp_personal', 'title', 'Personal Information', 'description', 'Your personal details and current immigration status.', 'sort_order', 0),
        jsonb_build_object('id', 'sec_wp_work', 'title', 'Work Permit Details', 'description', 'Details about the type of work permit and employment information.', 'sort_order', 1),
        jsonb_build_object('id', 'sec_wp_documents', 'title', 'Documents & Submission', 'description', 'Upload required documents and finalize your application.', 'sort_order', 2)
      )
    ),
    v_pa_id, v_pipeline_id, v_stage_id,
    'published', true, v_user_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;


  -- =========================================================================
  -- FORM 4: Study Permit Application Intake
  -- =========================================================================
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  ) VALUES (
    v_tenant_id,
    'Study Permit Application Intake',
    'study-permit-intake',
    'Planning to study in Canada? Complete this intake form so our team can assess your eligibility and guide you through the study permit process.',
    '[
      {"id":"st_first_name","field_type":"text","label":"First Name","is_required":true,"sort_order":0,"mapping":"first_name","section_id":"sec_st_personal"},
      {"id":"st_last_name","field_type":"text","label":"Last Name","is_required":true,"sort_order":1,"mapping":"last_name","section_id":"sec_st_personal"},
      {"id":"st_email","field_type":"email","label":"Email Address","is_required":true,"sort_order":2,"mapping":"email_primary","section_id":"sec_st_personal"},
      {"id":"st_phone","field_type":"phone","label":"Phone Number","sort_order":3,"mapping":"phone_primary","section_id":"sec_st_personal"},
      {"id":"st_dob","field_type":"date","label":"Date of Birth","is_required":true,"sort_order":4,"section_id":"sec_st_personal"},
      {"id":"st_citizenship","field_type":"select","label":"Country of Citizenship","is_required":true,"sort_order":5,"allow_other":true,"section_id":"sec_st_personal","options":[{"label":"India","value":"india"},{"label":"China","value":"china"},{"label":"Nigeria","value":"nigeria"},{"label":"Philippines","value":"philippines"},{"label":"Pakistan","value":"pakistan"},{"label":"Iran","value":"iran"},{"label":"South Korea","value":"south_korea"},{"label":"Vietnam","value":"vietnam"},{"label":"Brazil","value":"brazil"},{"label":"Bangladesh","value":"bangladesh"}]},
      {"id":"st_residence_country","field_type":"select","label":"Country of Current Residence","is_required":true,"sort_order":6,"allow_other":true,"section_id":"sec_st_personal","options":[{"label":"Same as citizenship","value":"same"},{"label":"Canada","value":"canada"},{"label":"United States","value":"usa"},{"label":"United Kingdom","value":"uk"},{"label":"UAE","value":"uae"}]},
      {"id":"st_current_education","field_type":"select","label":"Highest Education Completed","is_required":true,"sort_order":7,"section_id":"sec_st_personal","options":[{"label":"High School","value":"high_school"},{"label":"Diploma / Certificate","value":"diploma"},{"label":"Bachelor''s Degree","value":"bachelors"},{"label":"Master''s Degree","value":"masters"},{"label":"PhD","value":"phd"},{"label":"Other","value":"other"}]},

      {"id":"st_school_name","field_type":"text","label":"Name of Canadian Institution","placeholder":"e.g. University of British Columbia, Humber College","is_required":true,"sort_order":8,"section_id":"sec_st_program"},
      {"id":"st_dli_number","field_type":"text","label":"DLI Number (if known)","placeholder":"e.g. O19876543210","sort_order":9,"section_id":"sec_st_program"},
      {"id":"st_program_name","field_type":"text","label":"Program of Study","placeholder":"e.g. Computer Science, Business Administration","is_required":true,"sort_order":10,"section_id":"sec_st_program"},
      {"id":"st_program_level","field_type":"select","label":"Program Level","is_required":true,"sort_order":11,"section_id":"sec_st_program","options":[{"label":"ESL / Language Course","value":"esl"},{"label":"Certificate / Diploma","value":"certificate"},{"label":"Bachelor''s Degree","value":"bachelors"},{"label":"Post-Graduate Diploma","value":"pg_diploma"},{"label":"Master''s Degree","value":"masters"},{"label":"PhD / Doctoral","value":"phd"}]},
      {"id":"st_program_duration","field_type":"select","label":"Program Duration","is_required":true,"sort_order":12,"section_id":"sec_st_program","options":[{"label":"Less than 6 months","value":"less_6m"},{"label":"6 months – 1 year","value":"6m_1y"},{"label":"1 – 2 years","value":"1_2y"},{"label":"2 – 4 years","value":"2_4y"},{"label":"4+ years","value":"4_plus"}]},
      {"id":"st_start_date","field_type":"date","label":"Program Start Date","is_required":true,"sort_order":13,"section_id":"sec_st_program"},
      {"id":"st_loa_received","field_type":"select","label":"Have you received your Letter of Acceptance (LOA)?","is_required":true,"sort_order":14,"section_id":"sec_st_program","options":[{"label":"Yes","value":"yes"},{"label":"No — Applied, waiting","value":"applied"},{"label":"No — Haven''t applied yet","value":"not_applied"}]},
      {"id":"st_coop","field_type":"select","label":"Does the program include a co-op or internship?","sort_order":15,"section_id":"sec_st_program","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not sure","value":"not_sure"}]},

      {"id":"st_tuition_paid","field_type":"select","label":"Have you paid tuition?","is_required":true,"sort_order":16,"section_id":"sec_st_financial","options":[{"label":"Full tuition paid","value":"full"},{"label":"Partial deposit paid","value":"partial"},{"label":"Not yet paid","value":"not_paid"}]},
      {"id":"st_funding_source","field_type":"select","label":"How will you fund your studies?","is_required":true,"sort_order":17,"section_id":"sec_st_financial","options":[{"label":"Self-funded (personal savings)","value":"self"},{"label":"Family sponsorship","value":"family"},{"label":"Scholarship","value":"scholarship"},{"label":"Student loan","value":"loan"},{"label":"GIC (Guaranteed Investment Certificate)","value":"gic"},{"label":"Combination","value":"combination"}]},
      {"id":"st_gic_completed","field_type":"select","label":"Have you purchased a GIC?","sort_order":18,"section_id":"sec_st_financial","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Planning to","value":"planning"}]},
      {"id":"st_proof_funds","field_type":"text","label":"Estimated Available Funds (CAD)","placeholder":"e.g. $25,000","sort_order":19,"section_id":"sec_st_financial"},

      {"id":"st_previous_refusal","field_type":"boolean","label":"Have you ever been refused a Canadian visa?","sort_order":20,"section_id":"sec_st_history"},
      {"id":"st_refusal_details","field_type":"textarea","label":"Refusal Details","placeholder":"When, what type, and the reason if known","sort_order":21,"section_id":"sec_st_history","condition":{"field_id":"st_previous_refusal","operator":"is_truthy"}},
      {"id":"st_previous_travel","field_type":"multi_select","label":"Countries you have travelled to in the past 5 years","sort_order":22,"section_id":"sec_st_history","options":[{"label":"United States","value":"usa"},{"label":"United Kingdom","value":"uk"},{"label":"Australia","value":"australia"},{"label":"Europe (Schengen)","value":"europe"},{"label":"Canada (previously)","value":"canada"},{"label":"None","value":"none"}]},
      {"id":"st_english_test","field_type":"select","label":"English Test Taken","sort_order":23,"section_id":"sec_st_history","options":[{"label":"IELTS Academic","value":"ielts_academic"},{"label":"IELTS General","value":"ielts_general"},{"label":"TOEFL","value":"toefl"},{"label":"Duolingo English Test","value":"duolingo"},{"label":"Not yet taken","value":"not_taken"},{"label":"Not required (English-medium education)","value":"not_required"}]},
      {"id":"st_english_overall","field_type":"text","label":"Overall English Score","placeholder":"e.g. IELTS 6.5, TOEFL 90","sort_order":24,"section_id":"sec_st_history","condition":{"field_id":"st_english_test","operator":"in","value":["ielts_academic","ielts_general","toefl","duolingo"]}},

      {"id":"st_loa_upload","field_type":"file","label":"Letter of Acceptance","description":"Upload your LOA from the Canadian institution","sort_order":25,"accept":".pdf","section_id":"sec_st_docs","condition":{"field_id":"st_loa_received","operator":"equals","value":"yes"}},
      {"id":"st_passport_copy","field_type":"file","label":"Passport Bio Page","is_required":true,"sort_order":26,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_st_docs"},
      {"id":"st_transcripts","field_type":"file","label":"Academic Transcripts","description":"Most recent transcripts and degree certificates","sort_order":27,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_st_docs"},
      {"id":"st_financial_docs","field_type":"file","label":"Financial Documents","description":"Bank statements, GIC receipt, scholarship letter, or family sponsor letter","sort_order":28,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_st_docs"},
      {"id":"st_additional_notes","field_type":"textarea","label":"Additional Notes or Questions","placeholder":"Anything else you want us to know about your case...","sort_order":29,"mapping":"notes","section_id":"sec_st_docs"},
      {"id":"st_consent","field_type":"boolean","label":"I confirm the information provided is accurate and consent to being contacted","is_required":true,"sort_order":30,"section_id":"sec_st_docs"}
    ]'::jsonb,
    jsonb_build_object(
      'success_message', 'Thank you! Your study permit intake has been received. Our team will assess your eligibility and get back to you within 2-3 business days with next steps.',
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sec_st_personal', 'title', 'Personal Information', 'description', 'Your basic details and educational background.', 'sort_order', 0),
        jsonb_build_object('id', 'sec_st_program', 'title', 'Program & Institution', 'description', 'Details about your Canadian school and program of study.', 'sort_order', 1),
        jsonb_build_object('id', 'sec_st_financial', 'title', 'Financial Information', 'description', 'How you plan to fund your studies in Canada.', 'sort_order', 2),
        jsonb_build_object('id', 'sec_st_history', 'title', 'Travel & Language History', 'description', 'Previous visa history, travel experience, and language test scores.', 'sort_order', 3),
        jsonb_build_object('id', 'sec_st_docs', 'title', 'Documents & Submission', 'description', 'Upload required documents and finalize your intake.', 'sort_order', 4)
      )
    ),
    v_pa_id, v_pipeline_id, v_stage_id,
    'published', true, v_user_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;


  -- =========================================================================
  -- FORM 5: Family Reunification — Parent & Grandparent Sponsorship
  -- =========================================================================
  INSERT INTO intake_forms (
    tenant_id, name, slug, description, fields, settings,
    practice_area_id, pipeline_id, stage_id,
    status, is_active, created_by
  ) VALUES (
    v_tenant_id,
    'Parent & Grandparent Sponsorship Intake',
    'pgp-sponsorship-intake',
    'Interested in sponsoring your parents or grandparents to come to Canada? Complete this intake to help us assess your eligibility for the PGP program or Super Visa.',
    '[
      {"id":"pg_sponsor_first","field_type":"text","label":"Your First Name (Sponsor)","is_required":true,"sort_order":0,"mapping":"first_name","section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_last","field_type":"text","label":"Your Last Name (Sponsor)","is_required":true,"sort_order":1,"mapping":"last_name","section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_email","field_type":"email","label":"Email Address","is_required":true,"sort_order":2,"mapping":"email_primary","section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_phone","field_type":"phone","label":"Phone Number","sort_order":3,"mapping":"phone_primary","section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_dob","field_type":"date","label":"Your Date of Birth","is_required":true,"sort_order":4,"section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_status","field_type":"select","label":"Your Immigration Status in Canada","is_required":true,"sort_order":5,"section_id":"sec_pg_sponsor","options":[{"label":"Canadian Citizen","value":"citizen"},{"label":"Permanent Resident","value":"pr"}]},
      {"id":"pg_sponsor_address","field_type":"textarea","label":"Your Address in Canada","placeholder":"Full address including city and province","is_required":true,"sort_order":6,"section_id":"sec_pg_sponsor"},
      {"id":"pg_sponsor_household_size","field_type":"select","label":"Total Household Size (including yourself)","is_required":true,"sort_order":7,"section_id":"sec_pg_sponsor","options":[{"label":"1","value":"1"},{"label":"2","value":"2"},{"label":"3","value":"3"},{"label":"4","value":"4"},{"label":"5","value":"5"},{"label":"6+","value":"6_plus"}]},

      {"id":"pg_income_year1","field_type":"text","label":"Your Total Income — Most Recent Tax Year (CAD)","placeholder":"e.g. $65,000","is_required":true,"sort_order":8,"section_id":"sec_pg_income"},
      {"id":"pg_income_year2","field_type":"text","label":"Your Total Income — 2nd Most Recent Tax Year (CAD)","placeholder":"e.g. $60,000","is_required":true,"sort_order":9,"section_id":"sec_pg_income"},
      {"id":"pg_income_year3","field_type":"text","label":"Your Total Income — 3rd Most Recent Tax Year (CAD)","placeholder":"e.g. $55,000","is_required":true,"sort_order":10,"section_id":"sec_pg_income"},
      {"id":"pg_income_source","field_type":"select","label":"Primary Source of Income","is_required":true,"sort_order":11,"section_id":"sec_pg_income","options":[{"label":"Employment","value":"employment"},{"label":"Self-Employment","value":"self_employment"},{"label":"Combination","value":"combination"},{"label":"Other","value":"other"}]},
      {"id":"pg_cosigner","field_type":"select","label":"Will anyone co-sign the sponsorship undertaking?","sort_order":12,"section_id":"sec_pg_income","options":[{"label":"No","value":"no"},{"label":"Yes — My Spouse/Partner","value":"spouse"}]},
      {"id":"pg_cosigner_income","field_type":"text","label":"Co-signer''s Annual Income (CAD)","placeholder":"e.g. $45,000","sort_order":13,"section_id":"sec_pg_income","condition":{"field_id":"pg_cosigner","operator":"equals","value":"spouse"}},

      {"id":"pg_pathway","field_type":"select","label":"Which pathway are you interested in?","is_required":true,"sort_order":14,"section_id":"sec_pg_parents","options":[{"label":"PGP (Permanent Residence Sponsorship)","value":"pgp"},{"label":"Super Visa (10-Year Multi-Entry Visitor Visa)","value":"super_visa"},{"label":"Both — Advise which is better","value":"both"}]},
      {"id":"pg_parent_count","field_type":"select","label":"How many parents/grandparents do you wish to sponsor?","is_required":true,"sort_order":15,"section_id":"sec_pg_parents","options":[{"label":"1","value":"1"},{"label":"2","value":"2"},{"label":"3","value":"3"},{"label":"4","value":"4"}]},
      {"id":"pg_parent1_name","field_type":"text","label":"Parent/Grandparent 1 — Full Name","is_required":true,"sort_order":16,"section_id":"sec_pg_parents"},
      {"id":"pg_parent1_relation","field_type":"select","label":"Relationship to You","is_required":true,"sort_order":17,"section_id":"sec_pg_parents","options":[{"label":"Mother","value":"mother"},{"label":"Father","value":"father"},{"label":"Grandmother","value":"grandmother"},{"label":"Grandfather","value":"grandfather"}]},
      {"id":"pg_parent1_dob","field_type":"date","label":"Date of Birth","is_required":true,"sort_order":18,"section_id":"sec_pg_parents"},
      {"id":"pg_parent1_country","field_type":"select","label":"Country of Residence","is_required":true,"sort_order":19,"allow_other":true,"section_id":"sec_pg_parents","options":[{"label":"India","value":"india"},{"label":"China","value":"china"},{"label":"Philippines","value":"philippines"},{"label":"Pakistan","value":"pakistan"},{"label":"Sri Lanka","value":"sri_lanka"},{"label":"Iran","value":"iran"}]},
      {"id":"pg_parent1_health","field_type":"select","label":"General Health Status","sort_order":20,"section_id":"sec_pg_parents","options":[{"label":"Good Health","value":"good"},{"label":"Minor Health Issues","value":"minor"},{"label":"Significant Health Conditions","value":"significant"}]},
      {"id":"pg_parent2_name","field_type":"text","label":"Parent/Grandparent 2 — Full Name","sort_order":21,"section_id":"sec_pg_parents","condition":{"field_id":"pg_parent_count","operator":"in","value":["2","3","4"]}},
      {"id":"pg_parent2_relation","field_type":"select","label":"Relationship to You","sort_order":22,"section_id":"sec_pg_parents","condition":{"field_id":"pg_parent_count","operator":"in","value":["2","3","4"]},"options":[{"label":"Mother","value":"mother"},{"label":"Father","value":"father"},{"label":"Grandmother","value":"grandmother"},{"label":"Grandfather","value":"grandfather"}]},
      {"id":"pg_parent2_dob","field_type":"date","label":"Date of Birth","sort_order":23,"section_id":"sec_pg_parents","condition":{"field_id":"pg_parent_count","operator":"in","value":["2","3","4"]}},

      {"id":"pg_previous_pgp","field_type":"boolean","label":"Have you previously applied for PGP sponsorship?","sort_order":24,"section_id":"sec_pg_docs"},
      {"id":"pg_previous_pgp_details","field_type":"textarea","label":"Previous PGP Application Details","placeholder":"Year applied, outcome","sort_order":25,"section_id":"sec_pg_docs","condition":{"field_id":"pg_previous_pgp","operator":"is_truthy"}},
      {"id":"pg_noa_upload","field_type":"file","label":"Notice of Assessment (Most Recent Tax Year)","description":"CRA Notice of Assessment showing your income","sort_order":26,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_pg_docs"},
      {"id":"pg_passport_upload","field_type":"file","label":"Your Passport or PR Card","description":"Copy of your Canadian passport or PR card","sort_order":27,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_pg_docs"},
      {"id":"pg_parent_passport","field_type":"file","label":"Parent/Grandparent Passport(s)","description":"Passport bio pages of the person(s) you wish to sponsor","sort_order":28,"accept":".pdf,.jpg,.jpeg,.png","section_id":"sec_pg_docs"},
      {"id":"pg_additional_notes","field_type":"textarea","label":"Additional Notes or Questions","placeholder":"Any other information relevant to your sponsorship case...","sort_order":29,"mapping":"notes","section_id":"sec_pg_docs"},
      {"id":"pg_consent","field_type":"boolean","label":"I confirm the information provided is accurate and consent to being contacted","is_required":true,"sort_order":30,"section_id":"sec_pg_docs"}
    ]'::jsonb,
    jsonb_build_object(
      'success_message', 'Thank you for your Parent & Grandparent sponsorship intake! Our team will review your eligibility — particularly your income requirements — and reach out within 2-3 business days.',
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'sec_pg_sponsor', 'title', 'Sponsor Information', 'description', 'Your personal details as the Canadian sponsor.', 'sort_order', 0),
        jsonb_build_object('id', 'sec_pg_income', 'title', 'Income & Financial Requirements', 'description', 'PGP requires meeting minimum income thresholds for 3 consecutive years.', 'sort_order', 1),
        jsonb_build_object('id', 'sec_pg_parents', 'title', 'Parent / Grandparent Details', 'description', 'Information about the family member(s) you wish to sponsor.', 'sort_order', 2),
        jsonb_build_object('id', 'sec_pg_docs', 'title', 'Documents & Submission', 'description', 'Upload key documents and provide any additional information.', 'sort_order', 3)
      )
    ),
    v_pa_id, v_pipeline_id, v_stage_id,
    'published', true, v_user_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;


  RAISE NOTICE 'Created 5 immigration intake forms (Express Entry, Spousal, Work Permit, Study Permit, PGP)';
END $$;
