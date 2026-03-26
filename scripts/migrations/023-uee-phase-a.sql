-- ============================================================================
-- Migration 023: Universal Enforcement Engine  -  Phase A
-- Core Data Card + Risk Index + Matter People
-- ============================================================================
-- This migration establishes the foundation layer of the UEE:
--   1. matter_intake   -  Core Data Card with strategic variables + risk scoring
--   2. matter_people   -  Full structured people model per matter
--   3. Denormalized columns on matters for list-view queries
--   4. Enforcement flag on matter_types
--   5. Sync trigger to keep denormalized data consistent
-- ============================================================================

-- ─── 1. ALTER matter_types  -  add enforcement flag ────────────────────────────

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS enforcement_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN matter_types.enforcement_enabled IS
  'When true, the UEE validates intake completion, risk scoring, and stage gating for matters of this type.';

-- ─── 2. ALTER matters  -  add denormalized intake_status + risk_level ──────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS intake_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT NULL;

COMMENT ON COLUMN matters.intake_status IS
  'Denormalized from matter_intake. Values: not_applicable, incomplete, complete, validated, locked.';
COMMENT ON COLUMN matters.risk_level IS
  'Denormalized from matter_intake. Values: low, medium, high, critical. NULL = not assessed.';

CREATE INDEX IF NOT EXISTS idx_matters_intake_status
  ON matters(tenant_id, intake_status)
  WHERE intake_status NOT IN ('not_applicable', 'locked');

CREATE INDEX IF NOT EXISTS idx_matters_risk_level
  ON matters(tenant_id, risk_level)
  WHERE risk_level IS NOT NULL;

-- ─── 3. CREATE matter_intake ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matter_intake (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id             UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,

  -- Matter-level strategic variables
  processing_stream     TEXT        DEFAULT NULL,
  program_category      TEXT        DEFAULT NULL,
  jurisdiction          TEXT        NOT NULL DEFAULT 'CA',

  -- Intake tracking
  intake_status         TEXT        NOT NULL DEFAULT 'incomplete',
  completion_pct        INTEGER     NOT NULL DEFAULT 0,
  intake_delegation     TEXT        NOT NULL DEFAULT 'pa_only',

  -- Risk scoring
  risk_score            INTEGER     DEFAULT NULL,
  risk_level            TEXT        DEFAULT NULL,
  red_flags             JSONB       NOT NULL DEFAULT '[]',
  risk_calculated_at    TIMESTAMPTZ DEFAULT NULL,

  -- Risk override
  risk_override_level   TEXT        DEFAULT NULL,
  risk_override_reason  TEXT        DEFAULT NULL,
  risk_override_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  risk_override_at      TIMESTAMPTZ DEFAULT NULL,

  -- Lock fields (Phase C ready)
  locked_at             TIMESTAMPTZ DEFAULT NULL,
  locked_by             UUID        REFERENCES users(id) ON DELETE SET NULL,
  lock_reason           TEXT        DEFAULT NULL,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_matter_intake_matter UNIQUE (matter_id)
);

ALTER TABLE matter_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_intake_tenant_isolation ON matter_intake;
CREATE POLICY matter_intake_tenant_isolation ON matter_intake
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_matter_intake_tenant
  ON matter_intake(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_intake_matter
  ON matter_intake(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_intake_status
  ON matter_intake(tenant_id, intake_status);
CREATE INDEX IF NOT EXISTS idx_matter_intake_risk
  ON matter_intake(tenant_id, risk_level)
  WHERE risk_level IS NOT NULL;

-- ─── 4. CREATE matter_people ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matter_people (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id               UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  contact_id              UUID        REFERENCES contacts(id) ON DELETE SET NULL,

  -- Role on this matter
  person_role             TEXT        NOT NULL DEFAULT 'principal_applicant',
  role_label              TEXT        DEFAULT NULL,
  sort_order              INTEGER     NOT NULL DEFAULT 0,

  -- Identity
  first_name              TEXT        NOT NULL,
  last_name               TEXT        NOT NULL,
  middle_name             TEXT        DEFAULT NULL,
  date_of_birth           DATE        DEFAULT NULL,
  gender                  TEXT        DEFAULT NULL,
  nationality             TEXT        DEFAULT NULL,
  country_of_birth        TEXT        DEFAULT NULL,
  passport_number         TEXT        DEFAULT NULL,
  passport_expiry         DATE        DEFAULT NULL,
  email                   TEXT        DEFAULT NULL,
  phone                   TEXT        DEFAULT NULL,

  -- Address
  address_line1           TEXT        DEFAULT NULL,
  address_line2           TEXT        DEFAULT NULL,
  city                    TEXT        DEFAULT NULL,
  province_state          TEXT        DEFAULT NULL,
  postal_code             TEXT        DEFAULT NULL,
  country_of_residence    TEXT        DEFAULT NULL,

  -- Strategic variables
  immigration_status      TEXT        DEFAULT NULL,
  status_expiry_date      DATE        DEFAULT NULL,
  marital_status          TEXT        DEFAULT NULL,
  previous_marriage       BOOLEAN     DEFAULT false,
  number_of_dependents    INTEGER     DEFAULT 0,
  criminal_charges        BOOLEAN     DEFAULT false,
  criminal_details        TEXT        DEFAULT NULL,
  inadmissibility_flag    BOOLEAN     DEFAULT false,
  inadmissibility_details TEXT        DEFAULT NULL,
  travel_history_flag     BOOLEAN     DEFAULT false,
  currently_in_canada     BOOLEAN     DEFAULT NULL,

  -- Employment
  employer_name           TEXT        DEFAULT NULL,
  occupation              TEXT        DEFAULT NULL,
  work_permit_type        TEXT        DEFAULT NULL,
  noc_code                TEXT        DEFAULT NULL,

  -- Relationship to PA
  relationship_to_pa      TEXT        DEFAULT NULL,

  -- Completion tracking
  section_complete        BOOLEAN     NOT NULL DEFAULT false,

  -- Soft delete
  is_active               BOOLEAN     NOT NULL DEFAULT true,

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE matter_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_people_tenant_isolation ON matter_people;
CREATE POLICY matter_people_tenant_isolation ON matter_people
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_matter_people_tenant
  ON matter_people(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_people_matter
  ON matter_people(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_people_role
  ON matter_people(matter_id, person_role)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_matter_people_contact
  ON matter_people(contact_id)
  WHERE contact_id IS NOT NULL;

-- ─── 5. updated_at triggers ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_matter_intake_updated_at'
  ) THEN
    CREATE TRIGGER set_matter_intake_updated_at
      BEFORE UPDATE ON matter_intake
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_matter_people_updated_at'
  ) THEN
    CREATE TRIGGER set_matter_people_updated_at
      BEFORE UPDATE ON matter_people
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 6. Sync trigger: matter_intake → matters denormalized columns ───────────

CREATE OR REPLACE FUNCTION sync_intake_status_to_matter()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE matters
  SET intake_status = NEW.intake_status,
      risk_level = COALESCE(NEW.risk_override_level, NEW.risk_level)
  WHERE id = NEW.matter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_intake_to_matter'
  ) THEN
    CREATE TRIGGER trg_sync_intake_to_matter
      AFTER INSERT OR UPDATE OF intake_status, risk_level, risk_override_level
      ON matter_intake
      FOR EACH ROW EXECUTE FUNCTION sync_intake_status_to_matter();
  END IF;
END $$;

-- ============================================================================
-- END Migration 023
-- ============================================================================
