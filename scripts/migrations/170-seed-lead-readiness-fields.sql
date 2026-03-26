-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 170  -  Seed Lead Readiness Fields for Immigration Matter Types
-- ═══════════════════════════════════════════════════════════════════════════════
-- Seeds the required fields that fn_calculate_lead_readiness uses to score
-- each lead before conversion. Fields are grouped by source:
--   contact  → from the contacts table
--   lead     → from the leads table
--   screening → from leads.custom_intake_data (front desk screening)
--   intake_profile → from lead_intake_profiles
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper: Tenant + Matter Type IDs ────────────────────────────────────────

DO $$
DECLARE
  v_tenant UUID := 'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1';
  v_mt     RECORD;
BEGIN

  -- ─── Universal Fields (apply to ALL immigration matter types) ─────────────
  -- These are the minimum required fields for any immigration conversion.

  FOR v_mt IN
    SELECT id, name, program_category_key
    FROM matter_types
    WHERE tenant_id = v_tenant AND is_active = true
      AND program_category_key <> 'general'
  LOOP
    INSERT INTO lead_readiness_fields (tenant_id, matter_type_id, field_key, field_label, field_source, weight, sort_order) VALUES
      -- Contact essentials
      (v_tenant, v_mt.id, 'contact.first_name',         'First Name',             'contact',  1.00, 1),
      (v_tenant, v_mt.id, 'contact.last_name',          'Last Name',              'contact',  1.00, 2),
      (v_tenant, v_mt.id, 'contact.email_primary',      'Email Address',          'contact',  1.00, 3),
      (v_tenant, v_mt.id, 'contact.phone_primary',      'Phone Number',           'contact',  0.75, 4),
      (v_tenant, v_mt.id, 'contact.date_of_birth',      'Date of Birth',          'contact',  1.00, 5),
      (v_tenant, v_mt.id, 'contact.nationality',        'Nationality',            'contact',  1.00, 6),
      (v_tenant, v_mt.id, 'contact.country_of_birth',   'Country of Birth',       'contact',  0.75, 7),

      -- Passport (critical for immigration)
      (v_tenant, v_mt.id, 'contact.passport_number',    'Passport Number',        'contact',  1.00, 8),
      (v_tenant, v_mt.id, 'contact.passport_expiry',    'Passport Expiry',        'contact',  1.00, 9),

      -- Lead essentials
      (v_tenant, v_mt.id, 'lead.practice_area_id',      'Practice Area',          'lead',     1.00, 10),
      (v_tenant, v_mt.id, 'lead.matter_type_id',        'Matter Type',            'lead',     1.00, 11),
      (v_tenant, v_mt.id, 'lead.responsible_lawyer_id', 'Responsible Lawyer',     'lead',     1.00, 12),

      -- Screening questions
      (v_tenant, v_mt.id, 'screening.sq_country_citizenship', 'Country of Citizenship (Screening)', 'screening', 0.50, 13),
      (v_tenant, v_mt.id, 'screening.sq_current_status',      'Current Immigration Status',          'screening', 0.75, 14)
    ON CONFLICT (tenant_id, matter_type_id, field_key) DO NOTHING;

    -- ─── Category-Specific Fields ────────────────────────────────────────────

    -- Family Sponsorship: need marital status
    IF v_mt.program_category_key = 'family_sponsorship' THEN
      INSERT INTO lead_readiness_fields (tenant_id, matter_type_id, field_key, field_label, field_source, weight, sort_order) VALUES
        (v_tenant, v_mt.id, 'contact.marital_status',     'Marital Status',         'contact',  1.00, 20),
        (v_tenant, v_mt.id, 'screening.sq_family_members', 'Family Members Included', 'screening', 0.75, 21)
      ON CONFLICT (tenant_id, matter_type_id, field_key) DO NOTHING;
    END IF;

    -- Economic Immigration (Express Entry): need language test
    IF v_mt.program_category_key = 'economic_immigration' THEN
      INSERT INTO lead_readiness_fields (tenant_id, matter_type_id, field_key, field_label, field_source, weight, sort_order) VALUES
        (v_tenant, v_mt.id, 'screening.sq_language_test_type',    'Language Test Type',     'screening', 1.00, 20),
        (v_tenant, v_mt.id, 'screening.sq_language_test_overall', 'Language Test Score',    'screening', 1.00, 21),
        (v_tenant, v_mt.id, 'screening.sq_express_entry',         'Express Entry Profile',  'screening', 0.75, 22)
      ON CONFLICT (tenant_id, matter_type_id, field_key) DO NOTHING;
    END IF;

    -- Temporary Residence (Study/Work/Visitor): need current country of residence
    IF v_mt.program_category_key = 'temporary_residence' THEN
      INSERT INTO lead_readiness_fields (tenant_id, matter_type_id, field_key, field_label, field_source, weight, sort_order) VALUES
        (v_tenant, v_mt.id, 'contact.country_of_residence', 'Current Country of Residence', 'contact', 0.75, 20)
      ON CONFLICT (tenant_id, matter_type_id, field_key) DO NOTHING;
    END IF;

  END LOOP;

  RAISE NOTICE 'Seeded lead_readiness_fields for tenant %', v_tenant;
END $$;

COMMIT;
