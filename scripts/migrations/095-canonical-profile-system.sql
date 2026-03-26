-- 095: Canonical Profile System  -  Three-Layer IRCC Data Model
--
-- Creates:
--   1. canonical_profiles  -  one per contact, owns all canonical fields
--   2. canonical_profile_fields  -  EAV-style field storage with provenance
--   3. canonical_profile_snapshots  -  per-matter point-in-time snapshots
--   4. canonical_profile_conflicts  -  conflict detection when values diverge
--   5. common_field_registry  -  catalogue of all canonical field keys
--
-- Three-layer model:
--   Layer 1: canonical_profile_fields  -  contact-level shared truth
--   Layer 2: canonical_profile_snapshots  -  matter-level working data
--   Layer 3: Application form rendering (read-only, assembled at query time)
--
-- All tables follow standard RLS pattern: tenant_id via canonical_profiles

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. canonical_profiles  -  one per contact
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_profiles_tenant ON canonical_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canonical_profiles_contact ON canonical_profiles(contact_id);

ALTER TABLE canonical_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_canonical_profiles'
  ) THEN
    CREATE POLICY tenant_isolation_canonical_profiles ON canonical_profiles
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. canonical_profile_fields  -  EAV field storage with provenance
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_profile_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES canonical_profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN (
    'identity', 'address', 'travel', 'education', 'employment',
    'immigration', 'family', 'sponsor', 'declarations'
  )),
  field_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN (
    'extraction', 'client_portal', 'staff', 'import'
  )),
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'client_submitted', 'conflict'
  )),
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, domain, field_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_cpf_profile_domain ON canonical_profile_fields(profile_id, domain);
CREATE INDEX IF NOT EXISTS idx_cpf_field_key ON canonical_profile_fields(field_key);
CREATE INDEX IF NOT EXISTS idx_cpf_verification ON canonical_profile_fields(verification_status);

ALTER TABLE canonical_profile_fields ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_canonical_profile_fields'
  ) THEN
    CREATE POLICY tenant_isolation_canonical_profile_fields ON canonical_profile_fields
      FOR ALL TO authenticated
      USING (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      )
      WITH CHECK (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. canonical_profile_snapshots  -  per-matter point-in-time snapshots
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_profile_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES canonical_profiles(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, matter_id)
);

CREATE INDEX IF NOT EXISTS idx_cps_matter ON canonical_profile_snapshots(matter_id);
CREATE INDEX IF NOT EXISTS idx_cps_profile ON canonical_profile_snapshots(profile_id);

ALTER TABLE canonical_profile_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_canonical_profile_snapshots'
  ) THEN
    CREATE POLICY tenant_isolation_canonical_profile_snapshots ON canonical_profile_snapshots
      FOR ALL TO authenticated
      USING (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      )
      WITH CHECK (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. canonical_profile_conflicts  -  conflict detection records
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_profile_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES canonical_profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  existing_value JSONB NOT NULL DEFAULT '{}',
  new_value JSONB NOT NULL DEFAULT '{}',
  new_source TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT 'pending' CHECK (resolution IN (
    'pending', 'accept_new', 'keep_existing', 'manual'
  )),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpc_profile_pending
  ON canonical_profile_conflicts(profile_id) WHERE resolution = 'pending';
CREATE INDEX IF NOT EXISTS idx_cpc_field_key ON canonical_profile_conflicts(field_key);

ALTER TABLE canonical_profile_conflicts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_canonical_profile_conflicts'
  ) THEN
    CREATE POLICY tenant_isolation_canonical_profile_conflicts ON canonical_profile_conflicts
      FOR ALL TO authenticated
      USING (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      )
      WITH CHECK (
        profile_id IN (
          SELECT id FROM canonical_profiles
          WHERE tenant_id = public.get_current_tenant_id()
        )
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. common_field_registry  -  catalogue of canonical field keys
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS common_field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'text',
  domain TEXT NOT NULL,
  participant_scope TEXT NOT NULL DEFAULT 'applicant',
  validation_rules JSONB NOT NULL DEFAULT '{}',
  source_priority JSONB NOT NULL DEFAULT '["extraction", "client_portal", "staff", "import"]',
  is_canonical BOOLEAN NOT NULL DEFAULT true,
  mapped_form_count INTEGER NOT NULL DEFAULT 0,
  conflict_detection_rules JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfr_domain ON common_field_registry(domain);
CREATE INDEX IF NOT EXISTS idx_cfr_canonical ON common_field_registry(is_canonical) WHERE is_canonical = true;

-- common_field_registry is a global catalogue  -  no RLS needed (no tenant data).
-- Read-only for app users; only migrations/admin seed data.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Updated_at trigger for canonical tables
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_canonical_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_canonical_profiles_updated'
  ) THEN
    CREATE TRIGGER trg_canonical_profiles_updated
      BEFORE UPDATE ON canonical_profiles
      FOR EACH ROW EXECUTE FUNCTION update_canonical_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_canonical_profile_fields_updated'
  ) THEN
    CREATE TRIGGER trg_canonical_profile_fields_updated
      BEFORE UPDATE ON canonical_profile_fields
      FOR EACH ROW EXECUTE FUNCTION update_canonical_updated_at();
  END IF;
END $$;
