-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 171  -  Bulk Lead Import Pipeline: Staging, Attribution & Batch Ops
-- ═══════════════════════════════════════════════════════════════════════════════
-- Deliverables:
--   1. lead_import_staging table (the "sandbox")
--   2. lead_import_sources table (marketing attribution presets)
--   3. fn_bulk_conflict_check RPC (batch conflict scan in a single round trip)
--   4. Alter import_batches for lead bulk import support
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Lead Import Sources (marketing attribution presets) ─────────────────

CREATE TABLE IF NOT EXISTS lead_import_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  name              TEXT NOT NULL,
  source_type       TEXT NOT NULL DEFAULT 'csv_import'
                    CHECK (source_type IN ('csv_import','form','referral','advertising','organic','manual')),
  default_source    TEXT,
  default_campaign  TEXT,
  default_utm_source  TEXT,
  default_utm_medium  TEXT,
  default_utm_campaign TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);

ALTER TABLE lead_import_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_import_sources_tenant" ON lead_import_sources
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 2. Lead Import Staging (the sandbox) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_import_staging (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  batch_id              UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number            INTEGER NOT NULL,

  -- Parsed lead fields
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  date_of_birth         TEXT,
  nationality           TEXT,
  country_of_birth      TEXT,
  passport_number       TEXT,
  raw_jurisdiction      TEXT,
  matter_type_name      TEXT,
  temperature           TEXT,
  estimated_value       NUMERIC(12,2),
  notes                 TEXT,

  -- Gatekeeper results
  conflict_status       TEXT NOT NULL DEFAULT 'pending'
                        CHECK (conflict_status IN ('pending','clear','intra_file_conflict','cross_db_conflict')),
  conflict_details      JSONB NOT NULL DEFAULT '[]',
  jurisdiction_match_type TEXT CHECK (jurisdiction_match_type IN ('exact','alias','fuzzy','unresolved')),
  jurisdiction_match_confidence NUMERIC(5,2),
  matched_jurisdiction_id UUID REFERENCES jurisdictions(id),
  jurisdiction_needs_review BOOLEAN NOT NULL DEFAULT false,

  -- Overall validation
  validation_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (validation_status IN ('pending','valid','invalid','conflict','needs_review')),
  validation_errors     JSONB NOT NULL DEFAULT '[]',

  -- User overrides
  user_jurisdiction_override UUID REFERENCES jurisdictions(id),
  user_conflict_override TEXT CHECK (user_conflict_override IN ('accept','skip','merge')),

  -- Source attribution
  source_tag            TEXT,
  campaign_tag          TEXT,
  utm_source            TEXT,
  utm_medium            TEXT,
  utm_campaign          TEXT,

  -- Commit tracking
  committed             BOOLEAN NOT NULL DEFAULT false,
  created_lead_id       UUID,
  created_contact_id    UUID,

  -- Full source row for audit
  source_data           JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (batch_id, row_number)
);

ALTER TABLE lead_import_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_import_staging_tenant" ON lead_import_staging
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_lead_import_staging_batch
  ON lead_import_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_lead_import_staging_status
  ON lead_import_staging(batch_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_lead_import_staging_email
  ON lead_import_staging(batch_id, lower(email))
  WHERE email IS NOT NULL;

-- ─── 3. Extend import_batches ───────────────────────────────────────────────

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS import_source_id UUID REFERENCES lead_import_sources(id),
  ADD COLUMN IF NOT EXISTS gatekeeper_summary JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN import_batches.gatekeeper_summary IS 'Tracks validation progress: {total, processed, clear, conflicts, needs_review, invalid}';

-- ─── 4. fn_bulk_conflict_check RPC ──────────────────────────────────────────
-- Batch conflict scan: takes an array of emails + passport numbers
-- and returns all matches in a single round trip.
-- Strictly tenant-isolated via auth.uid().

CREATE OR REPLACE FUNCTION fn_bulk_conflict_check(
  p_emails    TEXT[],
  p_passports TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_matches   JSONB := '[]';
  v_row       RECORD;
BEGIN
  -- Sentinel: tenant isolation
  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.auth_user_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorised', 'matches', '[]'::jsonb);
  END IF;

  -- Clean inputs: remove nulls, empties, and lowercase emails
  p_emails := ARRAY(
    SELECT DISTINCT lower(e) FROM unnest(p_emails) AS e
    WHERE e IS NOT NULL AND e <> ''
  );
  p_passports := ARRAY(
    SELECT DISTINCT p FROM unnest(p_passports) AS p
    WHERE p IS NOT NULL AND p <> ''
  );

  -- Single query: find all contacts matching ANY email or passport
  FOR v_row IN
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email_primary,
      c.email_secondary,
      c.immigration_data->>'passport_number' AS passport_num
    FROM contacts c
    WHERE c.tenant_id = v_tenant_id
      AND c.is_active = true
      AND (
        (lower(c.email_primary) = ANY(p_emails))
        OR (lower(c.email_secondary) = ANY(p_emails))
        OR (c.immigration_data->>'passport_number' = ANY(p_passports))
      )
  LOOP
    -- Determine which inputs matched
    IF lower(v_row.email_primary) = ANY(p_emails) THEN
      v_matches := v_matches || jsonb_build_array(jsonb_build_object(
        'contact_id',   v_row.contact_id,
        'contact_name', COALESCE(v_row.first_name,'') || ' ' || COALESCE(v_row.last_name,''),
        'match_field',  'email_primary',
        'match_value',  v_row.email_primary
      ));
    END IF;

    IF lower(v_row.email_secondary) = ANY(p_emails) THEN
      v_matches := v_matches || jsonb_build_array(jsonb_build_object(
        'contact_id',   v_row.contact_id,
        'contact_name', COALESCE(v_row.first_name,'') || ' ' || COALESCE(v_row.last_name,''),
        'match_field',  'email_secondary',
        'match_value',  v_row.email_secondary
      ));
    END IF;

    IF v_row.passport_num IS NOT NULL AND v_row.passport_num = ANY(p_passports) THEN
      v_matches := v_matches || jsonb_build_array(jsonb_build_object(
        'contact_id',   v_row.contact_id,
        'contact_name', COALESCE(v_row.first_name,'') || ' ' || COALESCE(v_row.last_name,''),
        'match_field',  'passport_number',
        'match_value',  v_row.passport_num
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'match_count', jsonb_array_length(v_matches),
    'matches',     v_matches
  );
END;
$$;

COMMENT ON FUNCTION fn_bulk_conflict_check IS 'Batch conflict scan: single query for N emails + passports. Tenant-isolated.';

COMMIT;
