-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 169  -  Intelligent Gatekeeper: Lead Readiness & Validation Engine
-- ═══════════════════════════════════════════════════════════════════════════════
-- Deliverables:
--   1. jurisdictions lookup table (global, no RLS)
--   2. lead_readiness_fields (per-matter-type required field definitions)
--   3. lead_jurisdiction_matches (fuzzy match audit trail)
--   4. fn_calculate_lead_readiness RPC (<10ms budget)
--   5. fn_conflict_check_alpha RPC (tenant-isolated)
--   6. fn_match_jurisdiction RPC (3-tier matching)
--   7. New columns on leads table
--   8. Indexes for performance
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Jurisdictions Lookup Table (global, not tenant-scoped) ──────────────

CREATE TABLE IF NOT EXISTS jurisdictions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'country'
              CHECK (type IN ('country', 'province', 'territory', 'state')),
  parent_id   UUID REFERENCES jurisdictions(id),
  aliases     JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE jurisdictions IS 'Global jurisdiction lookup for smart-prefill mapping';

-- Enable RLS but allow public read (no tenant restriction on reference data)
ALTER TABLE jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jurisdictions_read_all" ON jurisdictions FOR SELECT USING (true);

-- GIN index on aliases for fast array containment queries
CREATE INDEX IF NOT EXISTS idx_jurisdictions_aliases_gin
  ON jurisdictions USING gin(aliases jsonb_path_ops);

-- pg_trgm index for fuzzy name matching (pg_trgm already enabled from migration 069)
CREATE INDEX IF NOT EXISTS idx_jurisdictions_name_trgm
  ON jurisdictions USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_code
  ON jurisdictions(lower(code));

-- Seed countries (top immigration origins + all G7 + Commonwealth)
INSERT INTO jurisdictions (code, name, type, aliases, sort_order) VALUES
  ('CA', 'Canada',           'country', '["CAN", "Canadian", "CANADA"]',                  1),
  ('US', 'United States',    'country', '["USA", "US", "America", "United States of America", "American"]', 2),
  ('GB', 'United Kingdom',   'country', '["UK", "Britain", "England", "GBR", "British"]', 3),
  ('IN', 'India',            'country', '["IND", "Indian", "INDIA"]',                     4),
  ('CN', 'China',            'country', '["CHN", "Chinese", "PRC", "CHINA"]',             5),
  ('PH', 'Philippines',      'country', '["PHL", "Filipino", "Philippine"]',              6),
  ('PK', 'Pakistan',         'country', '["PAK", "Pakistani", "PAKISTAN"]',               7),
  ('NG', 'Nigeria',          'country', '["NGA", "Nigerian", "NIGERIA"]',                 8),
  ('BD', 'Bangladesh',       'country', '["BGD", "Bangladeshi", "BANGLADESH"]',           9),
  ('IR', 'Iran',             'country', '["IRN", "Iranian", "Persia", "IRAN"]',          10),
  ('MX', 'Mexico',           'country', '["MEX", "Mexican", "MEXICO"]',                  11),
  ('BR', 'Brazil',           'country', '["BRA", "Brazilian", "BRAZIL"]',                12),
  ('FR', 'France',           'country', '["FRA", "French", "FRANCE"]',                   13),
  ('DE', 'Germany',          'country', '["DEU", "German", "GERMANY"]',                  14),
  ('JP', 'Japan',            'country', '["JPN", "Japanese", "JAPAN"]',                  15),
  ('KR', 'South Korea',      'country', '["KOR", "Korean", "Korea", "Republic of Korea"]', 16),
  ('AU', 'Australia',        'country', '["AUS", "Australian", "AUSTRALIA"]',             17),
  ('ZA', 'South Africa',     'country', '["ZAF", "South African"]',                      18),
  ('EG', 'Egypt',            'country', '["EGY", "Egyptian", "EGYPT"]',                  19),
  ('TR', 'Turkey',           'country', '["TUR", "Turkish", "Türkiye", "TURKEY"]',       20),
  ('SA', 'Saudi Arabia',     'country', '["SAU", "Saudi", "KSA"]',                       21),
  ('AE', 'United Arab Emirates', 'country', '["UAE", "Emirati", "Dubai"]',               22),
  ('LK', 'Sri Lanka',        'country', '["LKA", "Sri Lankan", "Ceylon"]',               23),
  ('VN', 'Vietnam',          'country', '["VNM", "Vietnamese", "VIETNAM"]',              24),
  ('CO', 'Colombia',         'country', '["COL", "Colombian", "COLOMBIA"]',              25),
  ('ET', 'Ethiopia',         'country', '["ETH", "Ethiopian", "ETHIOPIA"]',              26),
  ('KE', 'Kenya',            'country', '["KEN", "Kenyan", "KENYA"]',                    27),
  ('GH', 'Ghana',            'country', '["GHA", "Ghanaian", "GHANA"]',                  28),
  ('JM', 'Jamaica',          'country', '["JAM", "Jamaican", "JAMAICA"]',                29),
  ('HK', 'Hong Kong',        'country', '["HKG", "Hong Konger", "HONG KONG"]',           30)
ON CONFLICT (code) DO NOTHING;

-- Seed Canadian provinces/territories
DO $$
DECLARE v_ca_id UUID;
BEGIN
  SELECT id INTO v_ca_id FROM jurisdictions WHERE code = 'CA';
  IF v_ca_id IS NOT NULL THEN
    INSERT INTO jurisdictions (code, name, type, parent_id, aliases, sort_order) VALUES
      ('CA-ON', 'Ontario',                    'province',  v_ca_id, '["ON", "Ont", "Ont."]',                   1),
      ('CA-BC', 'British Columbia',            'province',  v_ca_id, '["BC", "B.C."]',                          2),
      ('CA-AB', 'Alberta',                     'province',  v_ca_id, '["AB", "Alta", "Alta."]',                 3),
      ('CA-QC', 'Quebec',                      'province',  v_ca_id, '["QC", "Que", "Québec"]',                 4),
      ('CA-MB', 'Manitoba',                    'province',  v_ca_id, '["MB", "Man", "Man."]',                   5),
      ('CA-SK', 'Saskatchewan',                'province',  v_ca_id, '["SK", "Sask", "Sask."]',                 6),
      ('CA-NS', 'Nova Scotia',                 'province',  v_ca_id, '["NS", "N.S."]',                          7),
      ('CA-NB', 'New Brunswick',               'province',  v_ca_id, '["NB", "N.B."]',                          8),
      ('CA-NL', 'Newfoundland and Labrador',   'province',  v_ca_id, '["NL", "Nfld", "NFLD"]',                  9),
      ('CA-PE', 'Prince Edward Island',        'province',  v_ca_id, '["PE", "PEI", "P.E.I."]',                10),
      ('CA-NT', 'Northwest Territories',       'territory', v_ca_id, '["NT", "NWT", "N.W.T."]',                11),
      ('CA-YT', 'Yukon',                       'territory', v_ca_id, '["YT", "YK", "Yukon Territory"]',        12),
      ('CA-NU', 'Nunavut',                     'territory', v_ca_id, '["NU"]',                                  13)
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- ─── 2. Lead Readiness Fields (required fields per matter_type) ─────────────

CREATE TABLE IF NOT EXISTS lead_readiness_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_type_id  UUID NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  field_label     TEXT NOT NULL,
  field_source    TEXT NOT NULL CHECK (field_source IN ('contact', 'lead', 'intake_profile', 'screening')),
  is_required     BOOLEAN NOT NULL DEFAULT true,
  weight          NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, matter_type_id, field_key)
);

COMMENT ON TABLE lead_readiness_fields IS 'Defines which fields must be populated before a lead is "conversion-ready" for a given matter type';

ALTER TABLE lead_readiness_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_readiness_fields_tenant" ON lead_readiness_fields
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_lead_readiness_fields_mt
  ON lead_readiness_fields(matter_type_id);

-- ─── 3. Lead Jurisdiction Matches (fuzzy match audit trail) ─────────────────

CREATE TABLE IF NOT EXISTS lead_jurisdiction_matches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  lead_id                 UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  raw_input               TEXT NOT NULL,
  matched_jurisdiction_id UUID REFERENCES jurisdictions(id),
  match_type              TEXT NOT NULL CHECK (match_type IN ('exact', 'alias', 'fuzzy', 'unresolved')),
  confidence              NUMERIC(5,2) NOT NULL DEFAULT 0,
  reviewed_by             UUID REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_jurisdiction_matches IS 'Tracks jurisdiction string → UUID resolution attempts for audit and human review';

ALTER TABLE lead_jurisdiction_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_jurisdiction_matches_tenant" ON lead_jurisdiction_matches
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_lead_jurisdiction_matches_lead
  ON lead_jurisdiction_matches(lead_id);

-- ─── 4. New Columns on Leads ────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS readiness_score       INTEGER,
  ADD COLUMN IF NOT EXISTS readiness_breakdown   JSONB,
  ADD COLUMN IF NOT EXISTS jurisdiction_id       UUID REFERENCES jurisdictions(id);

CREATE INDEX IF NOT EXISTS idx_leads_readiness_score
  ON leads(readiness_score) WHERE readiness_score IS NOT NULL;

-- ─── 5. Performance Indexes for Conflict Check ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contacts_email_lower_tenant
  ON contacts(tenant_id, lower(email_primary))
  WHERE email_primary IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_contacts_email2_lower_tenant
  ON contacts(tenant_id, lower(email_secondary))
  WHERE email_secondary IS NOT NULL AND is_active = true;

-- ─── 6. fn_calculate_lead_readiness RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_calculate_lead_readiness(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       UUID;
  v_lead            RECORD;
  v_contact         RECORD;
  v_intake          RECORD;
  v_screening       JSONB;
  v_fields          RECORD;
  v_total_weight    NUMERIC := 0;
  v_filled_weight   NUMERIC := 0;
  v_missing         JSONB := '[]';
  v_breakdown       JSONB := '[]';
  v_field_value     TEXT;
  v_is_filled       BOOLEAN;
  v_score           INTEGER;
BEGIN
  -- Sentinel: tenant isolation
  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.auth_user_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorised', 'score', 0);
  END IF;

  -- Fetch lead (lean columns only)
  SELECT l.id, l.contact_id, l.matter_type_id, l.practice_area_id,
         l.responsible_lawyer_id, l.custom_intake_data, l.status
  INTO v_lead
  FROM leads l
  WHERE l.id = p_lead_id AND l.tenant_id = v_tenant_id;

  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('error', 'lead_not_found', 'score', 0);
  END IF;

  -- If no matter_type set, we can't score
  IF v_lead.matter_type_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'total_fields', 0, 'filled_fields', 0,
      'missing', jsonb_build_array(
        jsonb_build_object('key', 'lead.matter_type_id', 'label', 'Matter Type', 'source', 'lead')
      ),
      'breakdown', '[]'::jsonb
    );
  END IF;

  -- Fetch contact (lean)
  SELECT c.email_primary, c.phone_primary, c.first_name, c.last_name,
         c.date_of_birth, c.nationality, c.country_of_birth,
         c.country_of_residence, c.immigration_data, c.marital_status,
         c.gender
  INTO v_contact
  FROM contacts c
  WHERE c.id = v_lead.contact_id AND c.tenant_id = v_tenant_id;

  -- Fetch intake profile (lean)
  SELECT lip.jurisdiction, lip.mandatory_fields_complete,
         lip.custom_intake_data, lip.urgency_level
  INTO v_intake
  FROM lead_intake_profiles lip
  WHERE lip.lead_id = p_lead_id AND lip.tenant_id = v_tenant_id
  LIMIT 1;

  -- Screening data is in leads.custom_intake_data
  v_screening := COALESCE(v_lead.custom_intake_data, '{}'::jsonb);

  -- Iterate required fields for this matter type
  FOR v_fields IN
    SELECT lrf.field_key, lrf.field_label, lrf.field_source, lrf.weight
    FROM lead_readiness_fields lrf
    WHERE lrf.matter_type_id = v_lead.matter_type_id
      AND lrf.tenant_id = v_tenant_id
      AND lrf.is_required = true
    ORDER BY lrf.sort_order
  LOOP
    v_total_weight := v_total_weight + v_fields.weight;
    v_field_value := NULL;
    v_is_filled := false;

    -- Resolve field value from the appropriate source
    CASE v_fields.field_source
      WHEN 'contact' THEN
        v_field_value := CASE v_fields.field_key
          WHEN 'contact.email_primary'      THEN v_contact.email_primary
          WHEN 'contact.phone_primary'      THEN v_contact.phone_primary
          WHEN 'contact.first_name'         THEN v_contact.first_name
          WHEN 'contact.last_name'          THEN v_contact.last_name
          WHEN 'contact.date_of_birth'      THEN v_contact.date_of_birth::TEXT
          WHEN 'contact.nationality'        THEN v_contact.nationality
          WHEN 'contact.country_of_birth'   THEN v_contact.country_of_birth
          WHEN 'contact.country_of_residence' THEN v_contact.country_of_residence
          WHEN 'contact.marital_status'     THEN v_contact.marital_status
          WHEN 'contact.gender'             THEN v_contact.gender
          WHEN 'contact.passport_number'    THEN v_contact.immigration_data->>'passport_number'
          WHEN 'contact.passport_expiry'    THEN v_contact.immigration_data->>'passport_expiry'
          WHEN 'contact.uci_number'         THEN v_contact.immigration_data->>'uci_number'
          ELSE NULL
        END;
      WHEN 'lead' THEN
        v_field_value := CASE v_fields.field_key
          WHEN 'lead.practice_area_id'       THEN v_lead.practice_area_id::TEXT
          WHEN 'lead.matter_type_id'         THEN v_lead.matter_type_id::TEXT
          WHEN 'lead.responsible_lawyer_id'  THEN v_lead.responsible_lawyer_id::TEXT
          ELSE NULL
        END;
      WHEN 'intake_profile' THEN
        v_field_value := CASE v_fields.field_key
          WHEN 'intake.jurisdiction'         THEN v_intake.jurisdiction
          WHEN 'intake.urgency_level'        THEN v_intake.urgency_level
          ELSE
            -- Check intake_profile custom_intake_data
            COALESCE(v_intake.custom_intake_data, '{}'::jsonb)->>replace(v_fields.field_key, 'intake.', '')
        END;
      WHEN 'screening' THEN
        -- Screening answers in leads.custom_intake_data
        v_field_value := v_screening->>replace(v_fields.field_key, 'screening.', '');
    END CASE;

    v_is_filled := (v_field_value IS NOT NULL AND v_field_value <> '');

    IF v_is_filled THEN
      v_filled_weight := v_filled_weight + v_fields.weight;
    ELSE
      v_missing := v_missing || jsonb_build_array(jsonb_build_object(
        'key', v_fields.field_key,
        'label', v_fields.field_label,
        'source', v_fields.field_source
      ));
    END IF;

    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'field_key', v_fields.field_key,
      'label', v_fields.field_label,
      'filled', v_is_filled,
      'source', v_fields.field_source
    ));
  END LOOP;

  -- Calculate score
  IF v_total_weight > 0 THEN
    v_score := ROUND((v_filled_weight / v_total_weight) * 100)::INTEGER;
  ELSE
    v_score := 100; -- No required fields = fully ready
  END IF;

  RETURN jsonb_build_object(
    'score',         v_score,
    'total_fields',  jsonb_array_length(v_breakdown),
    'filled_fields', jsonb_array_length(v_breakdown) - jsonb_array_length(v_missing),
    'missing',       v_missing,
    'breakdown',     v_breakdown
  );
END;
$$;

COMMENT ON FUNCTION fn_calculate_lead_readiness IS 'Scores a lead 0-100% based on required fields for its matter type. Budget: <10ms.';

-- ─── 7. fn_conflict_check_alpha RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_conflict_check_alpha(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    UUID;
  v_contact_id   UUID;
  v_email1       TEXT;
  v_email2       TEXT;
  v_passport     TEXT;
  v_matches      JSONB := '[]';
  v_row          RECORD;
BEGIN
  -- Sentinel: tenant isolation
  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.auth_user_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorised', 'has_conflicts', false);
  END IF;

  -- Get lead's contact info (lean: 4 columns)
  SELECT l.contact_id INTO v_contact_id
  FROM leads l
  WHERE l.id = p_lead_id AND l.tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('error', 'lead_not_found', 'has_conflicts', false);
  END IF;

  SELECT c.email_primary, c.email_secondary,
         c.immigration_data->>'passport_number'
  INTO v_email1, v_email2, v_passport
  FROM contacts c
  WHERE c.id = v_contact_id AND c.tenant_id = v_tenant_id;

  -- Search for conflicts WITHIN the same tenant only
  -- Match on: email (case-insensitive) or passport number
  FOR v_row IN
    SELECT DISTINCT
      c2.id AS contact_id,
      c2.first_name,
      c2.last_name,
      CASE
        WHEN lower(c2.email_primary) = lower(v_email1)   THEN 'email_primary'
        WHEN lower(c2.email_secondary) = lower(v_email1) THEN 'email_secondary'
        WHEN lower(c2.email_primary) = lower(v_email2)   THEN 'email_primary'
        WHEN lower(c2.email_secondary) = lower(v_email2) THEN 'email_secondary'
        WHEN c2.immigration_data->>'passport_number' = v_passport THEN 'passport_number'
      END AS match_field
    FROM contacts c2
    WHERE c2.tenant_id = v_tenant_id
      AND c2.id <> v_contact_id
      AND c2.is_active = true
      AND (
        (v_email1 IS NOT NULL AND v_email1 <> '' AND (
          lower(c2.email_primary) = lower(v_email1) OR
          lower(c2.email_secondary) = lower(v_email1)
        ))
        OR
        (v_email2 IS NOT NULL AND v_email2 <> '' AND (
          lower(c2.email_primary) = lower(v_email2) OR
          lower(c2.email_secondary) = lower(v_email2)
        ))
        OR
        (v_passport IS NOT NULL AND v_passport <> '' AND
          c2.immigration_data->>'passport_number' = v_passport
        )
      )
  LOOP
    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'contact_id',   v_row.contact_id,
      'contact_name', COALESCE(v_row.first_name, '') || ' ' || COALESCE(v_row.last_name, ''),
      'match_field',  v_row.match_field
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'has_conflicts', jsonb_array_length(v_matches) > 0,
    'match_count',   jsonb_array_length(v_matches),
    'matches',       v_matches
  );
END;
$$;

COMMENT ON FUNCTION fn_conflict_check_alpha IS 'Pre-conversion conflict check: searches same-tenant contacts by email/passport. Never leaks cross-tenant data.';

-- ─── 8. fn_match_jurisdiction RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_match_jurisdiction(p_raw_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input      TEXT;
  v_result     RECORD;
  v_fuzzy      RECORD;
BEGIN
  v_input := trim(p_raw_input);

  IF v_input IS NULL OR v_input = '' THEN
    RETURN jsonb_build_object('match_type', 'unresolved', 'jurisdiction', null, 'confidence', 0);
  END IF;

  -- Tier 1: Exact match on code or name (case-insensitive)
  SELECT j.id, j.code, j.name, j.type
  INTO v_result
  FROM jurisdictions j
  WHERE j.is_active = true
    AND (lower(j.code) = lower(v_input) OR lower(j.name) = lower(v_input))
  LIMIT 1;

  IF v_result.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'match_type',   'exact',
      'confidence',   100,
      'jurisdiction', jsonb_build_object('id', v_result.id, 'code', v_result.code, 'name', v_result.name, 'type', v_result.type)
    );
  END IF;

  -- Tier 2: Alias match (search JSONB array)
  SELECT j.id, j.code, j.name, j.type
  INTO v_result
  FROM jurisdictions j,
       jsonb_array_elements_text(j.aliases) AS alias
  WHERE j.is_active = true
    AND lower(alias) = lower(v_input)
  LIMIT 1;

  IF v_result.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'match_type',   'alias',
      'confidence',   95,
      'jurisdiction', jsonb_build_object('id', v_result.id, 'code', v_result.code, 'name', v_result.name, 'type', v_result.type)
    );
  END IF;

  -- Tier 3: Fuzzy match via pg_trgm similarity
  SELECT j.id, j.code, j.name, j.type,
         similarity(lower(j.name), lower(v_input)) AS sim
  INTO v_fuzzy
  FROM jurisdictions j
  WHERE j.is_active = true
    AND similarity(lower(j.name), lower(v_input)) > 0.3
  ORDER BY similarity(lower(j.name), lower(v_input)) DESC
  LIMIT 1;

  IF v_fuzzy.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'match_type',   'fuzzy',
      'confidence',   ROUND(v_fuzzy.sim * 100),
      'jurisdiction', jsonb_build_object('id', v_fuzzy.id, 'code', v_fuzzy.code, 'name', v_fuzzy.name, 'type', v_fuzzy.type),
      'needs_review', v_fuzzy.sim < 0.8
    );
  END IF;

  -- No match
  RETURN jsonb_build_object('match_type', 'unresolved', 'jurisdiction', null, 'confidence', 0, 'needs_review', true);
END;
$$;

COMMENT ON FUNCTION fn_match_jurisdiction IS '3-tier jurisdiction matching: exact → alias → fuzzy. Returns match confidence for smart-prefill.';

COMMIT;
