-- ============================================================================
-- Migration 094: Matter-Scoped Access Control
-- ============================================================================
-- LOCKED IMPLEMENTATION  -  matter-scoped access and restricted-matter rules
-- must NOT be weakened.
--
-- Creates:
--   1. user_supervision  -  supervisor ↔ supervisee relationships
--   2. break_glass_access_grants  -  time-limited emergency access (max 72h)
--   3. matter_delegations  -  delegated matter access with expiry
--   4. check_matter_access()  -  core 9-path access control function
--   5. RLS policy updates on matters and matter-linked tables
--   6. Performance indexes
--
-- Alters:
--   - matters: adds is_restricted, restricted_admin_override
--   - audit_logs: adds severity, ip_address, user_agent
-- ============================================================================

-- ─── 1. user_supervision ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_supervision (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supervisor_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisee_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  is_active             BOOLEAN DEFAULT TRUE,
  UNIQUE(supervisor_user_id, supervisee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_supervision_supervisor_active
  ON user_supervision(supervisor_user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_supervision_supervisee
  ON user_supervision(supervisee_user_id);
CREATE INDEX IF NOT EXISTS idx_user_supervision_tenant
  ON user_supervision(tenant_id);

ALTER TABLE user_supervision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_user_supervision" ON user_supervision
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 2. break_glass_access_grants ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS break_glass_access_grants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_to      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id       UUID REFERENCES matters(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  granted_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK (expires_at <= granted_at + INTERVAL '72 hours')
);

CREATE INDEX IF NOT EXISTS idx_break_glass_granted_to_expires
  ON break_glass_access_grants(granted_to, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_break_glass_tenant
  ON break_glass_access_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_matter
  ON break_glass_access_grants(matter_id);

ALTER TABLE break_glass_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_break_glass_access_grants" ON break_glass_access_grants
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 3. matter_delegations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matter_delegations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delegating_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id           UUID REFERENCES matters(id) ON DELETE CASCADE,
  access_level        TEXT NOT NULL CHECK (access_level IN ('read', 'read_write')),
  reason              TEXT,
  starts_at           TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matter_delegations_delegate_expires
  ON matter_delegations(delegate_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_matter_delegations_tenant
  ON matter_delegations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_delegations_matter
  ON matter_delegations(matter_id);

ALTER TABLE matter_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_matter_delegations" ON matter_delegations
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 4. ALTER existing tables ────────────────────────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restricted_admin_override BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_matters_is_restricted
  ON matters(is_restricted) WHERE is_restricted = TRUE;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ─── 5. check_matter_access()  -  CORE ACCESS CONTROL ─────────────────────────
-- LOCKED: This function implements the 9-path access model.
-- Do NOT weaken any path. All 9 paths must remain intact.

CREATE OR REPLACE FUNCTION check_matter_access(p_user_id UUID, p_matter_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matter RECORD;
  v_user RECORD;
  v_role_name TEXT;
BEGIN
  -- Get matter details
  SELECT m.id, m.tenant_id AS m_tenant_id, m.is_restricted, m.restricted_admin_override,
         m.responsible_lawyer_id, m.originating_lawyer_id, m.followup_lawyer_id,
         m.team_member_ids
  INTO v_matter FROM matters m WHERE m.id = p_matter_id;

  IF v_matter IS NULL THEN RETURN FALSE; END IF;

  -- Get user details
  SELECT u.id, u.tenant_id, u.role_id
  INTO v_user FROM users u WHERE u.id = p_user_id;

  IF v_user IS NULL THEN RETURN FALSE; END IF;

  -- Must be same tenant
  IF v_user.tenant_id != v_matter.m_tenant_id THEN RETURN FALSE; END IF;

  -- Resolve role name from roles table
  IF v_user.role_id IS NOT NULL THEN
    SELECT r.name INTO v_role_name FROM roles r WHERE r.id = v_user.role_id;
  END IF;

  -- Path 1: Admin on non-restricted matter
  IF v_role_name = 'Admin' AND NOT COALESCE(v_matter.is_restricted, FALSE) THEN
    RETURN TRUE;
  END IF;

  -- Path 2: Admin with override on restricted matter
  IF v_role_name = 'Admin' AND COALESCE(v_matter.is_restricted, FALSE)
     AND COALESCE(v_matter.restricted_admin_override, FALSE) THEN
    RETURN TRUE;
  END IF;

  -- Path 3: Responsible lawyer
  IF v_matter.responsible_lawyer_id = p_user_id THEN RETURN TRUE; END IF;

  -- Path 4: Originating lawyer
  IF v_matter.originating_lawyer_id = p_user_id THEN RETURN TRUE; END IF;

  -- Path 5: Follow-up lawyer
  IF v_matter.followup_lawyer_id = p_user_id THEN RETURN TRUE; END IF;

  -- Path 6: Team member
  IF v_matter.team_member_ids IS NOT NULL AND p_user_id = ANY(v_matter.team_member_ids) THEN
    RETURN TRUE;
  END IF;

  -- Path 7: Supervisor of an assigned person
  IF EXISTS (
    SELECT 1 FROM user_supervision us
    WHERE us.supervisor_user_id = p_user_id
      AND us.is_active = TRUE
      AND us.tenant_id = v_matter.m_tenant_id
      AND (
        us.supervisee_user_id = v_matter.responsible_lawyer_id
        OR us.supervisee_user_id = v_matter.originating_lawyer_id
        OR us.supervisee_user_id = v_matter.followup_lawyer_id
        OR us.supervisee_user_id = ANY(COALESCE(v_matter.team_member_ids, '{}'))
      )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Path 8: Active delegation
  IF EXISTS (
    SELECT 1 FROM matter_delegations md
    WHERE md.delegate_user_id = p_user_id
      AND md.tenant_id = v_matter.m_tenant_id
      AND (md.matter_id = p_matter_id OR md.matter_id IS NULL)
      AND md.starts_at <= NOW()
      AND (md.expires_at IS NULL OR md.expires_at > NOW())
  ) THEN
    RETURN TRUE;
  END IF;

  -- Path 9: Active break-glass
  IF EXISTS (
    SELECT 1 FROM break_glass_access_grants bg
    WHERE bg.granted_to = p_user_id
      AND bg.tenant_id = v_matter.m_tenant_id
      AND (bg.matter_id = p_matter_id OR bg.matter_id IS NULL)
      AND bg.revoked_at IS NULL
      AND bg.expires_at > NOW()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─── 6. RLS policy updates on matters ────────────────────────────────────────
-- Replace existing tenant-only RLS with matter-scoped access on matters table.
-- The new policy maintains tenant isolation AND adds matter-scoped access checks.

-- Drop any existing policies on matters (various naming patterns)
DROP POLICY IF EXISTS "tenant_isolation_matters" ON matters;
DROP POLICY IF EXISTS "matters_tenant_policy" ON matters;
DROP POLICY IF EXISTS "matters_tenant_rls" ON matters;
DROP POLICY IF EXISTS "matters_select" ON matters;
DROP POLICY IF EXISTS "matters_insert" ON matters;
DROP POLICY IF EXISTS "matters_update" ON matters;
DROP POLICY IF EXISTS "matters_delete" ON matters;

-- Ensure RLS is enabled
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation + matter access check
CREATE POLICY "matters_select" ON matters
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND check_matter_access(
      (SELECT id FROM users WHERE auth_user_id = auth.uid()),
      id
    )
  );

-- INSERT: tenant isolation only (access check not needed for new matters)
CREATE POLICY "matters_insert" ON matters
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- UPDATE: tenant isolation + matter access check
CREATE POLICY "matters_update" ON matters
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND check_matter_access(
      (SELECT id FROM users WHERE auth_user_id = auth.uid()),
      id
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- DELETE: tenant isolation + matter access check
CREATE POLICY "matters_delete" ON matters
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND check_matter_access(
      (SELECT id FROM users WHERE auth_user_id = auth.uid()),
      id
    )
  );

-- ─── 7. RLS on matter-linked tables ─────────────────────────────────────────
-- Update matter_contacts, matter_people, matter_comments, matter_intake,
-- matter_onboarding_steps, matter_dynamic_intake_answers, matter_intake_risk_flags
-- to also enforce matter-scoped access via the FK.

DO $$
DECLARE
  t TEXT;
  matter_linked_tables TEXT[] := ARRAY[
    'matter_contacts',
    'matter_people',
    'matter_comments',
    'matter_onboarding_steps',
    'matter_dynamic_intake_answers',
    'matter_intake_risk_flags',
    'matter_checklist_items',
    'matter_stage_state',
    'matter_custom_data',
    'matter_deadlines'
  ];
BEGIN
  FOR t IN SELECT unnest(matter_linked_tables) LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping %  -  table does not exist', t;
      CONTINUE;
    END IF;

    -- Skip if no matter_id column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'matter_id'
    ) THEN
      RAISE NOTICE 'Skipping %  -  no matter_id column', t;
      CONTINUE;
    END IF;

    -- Drop all existing policies (various naming patterns)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_rls ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant_isolation" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%I" ON %I', t, t);

    -- Ensure RLS enabled
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT: tenant + matter access
    EXECUTE format(
      'CREATE POLICY "%I_select" ON %I
       FOR SELECT TO authenticated
       USING (
         tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
         AND check_matter_access(
           (SELECT id FROM users WHERE auth_user_id = auth.uid()),
           matter_id
         )
       )',
      t, t
    );

    -- INSERT: tenant isolation only
    EXECUTE format(
      'CREATE POLICY "%I_insert" ON %I
       FOR INSERT TO authenticated
       WITH CHECK (
         tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
       )',
      t, t
    );

    -- UPDATE: tenant + matter access
    EXECUTE format(
      'CREATE POLICY "%I_update" ON %I
       FOR UPDATE TO authenticated
       USING (
         tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
         AND check_matter_access(
           (SELECT id FROM users WHERE auth_user_id = auth.uid()),
           matter_id
         )
       )
       WITH CHECK (
         tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
       )',
      t, t
    );

    -- DELETE: tenant + matter access
    EXECUTE format(
      'CREATE POLICY "%I_delete" ON %I
       FOR DELETE TO authenticated
       USING (
         tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
         AND check_matter_access(
           (SELECT id FROM users WHERE auth_user_id = auth.uid()),
           matter_id
         )
       )',
      t, t
    );

    RAISE NOTICE 'Applied matter-scoped RLS on %', t;
  END LOOP;
END $$;

-- ─── 8. Record migration ────────────────────────────────────────────────────

INSERT INTO migrations (name, applied_at)
VALUES ('094-matter-scoped-access', NOW())
ON CONFLICT DO NOTHING;
