-- ============================================================================
-- Migration 126: Role-Based RLS Enforcement
-- ============================================================================
-- Adds a get_my_role() helper function and upgrades write policies on five
-- sensitive tables to require both tenant isolation AND a matching role.
--
-- Tables affected:
--   matter_intake         UPDATE — Lawyer, Admin only
--   stage_transition_log  INSERT — Lawyer, Paralegal, Admin only
--   document_versions     UPDATE — Lawyer, Paralegal, Admin only
--   trust_transactions    INSERT — Billing, Admin only
--   invoices              INSERT, UPDATE — Billing, Admin, Lawyer only
--
-- Role names are stored in roles.name (title-case) joined via users.role_id.
-- get_my_role() returns the role name for the currently authenticated user.
--
-- SELECT policies on all tables remain tenant-scoped only.
-- 2026-03-17 — Sprint 6, Week 1
-- ============================================================================

-- ── Helper: get role name of the currently authenticated user ─────────────────
-- Users do not have a direct 'role' text column; role name lives in
-- roles.name joined through users.role_id.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT r.name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_my_role() IS
  'Returns the role name (roles.name, title-case) for the currently '
  'authenticated user via users.role_id → roles.id join. '
  'Used in RLS policies to enforce write-access role requirements. '
  'Migration 126 — 2026-03-17.';

-- ============================================================================
-- 1. matter_intake — UPDATE restricted to Lawyer, Admin
-- ============================================================================
-- Existing policy: matter_intake_tenant_isolation FOR ALL (migration 023)
-- Strategy: drop the catch-all ALL policy, recreate SELECT/INSERT permissively,
-- and add a role-gated UPDATE policy.

DROP POLICY IF EXISTS matter_intake_tenant_isolation ON matter_intake;
DROP POLICY IF EXISTS matter_intake_update ON matter_intake;
DROP POLICY IF EXISTS matter_intake_lawyer_update ON matter_intake;
DROP POLICY IF EXISTS matter_intake_select ON matter_intake;
DROP POLICY IF EXISTS matter_intake_insert ON matter_intake;

-- SELECT: any tenant member can read
CREATE POLICY "matter_intake_select" ON matter_intake
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- INSERT: any tenant member can create intake records
CREATE POLICY "matter_intake_insert" ON matter_intake
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- UPDATE: only Lawyer or Admin
-- Enforces role on all UPDATE operations; column-level restriction documented
-- (lawyer_review_status, lawyer_review_by, lawyer_review_at,
--  contradiction_override_by, contradiction_override_at)
CREATE POLICY "matter_intake_lawyer_update" ON matter_intake
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Admin')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Admin')
  );

COMMENT ON TABLE matter_intake IS
  'RLS role-enforced (migration 126): SELECT/INSERT tenant-scoped; '
  'UPDATE requires role IN (Lawyer, Admin).';

-- ============================================================================
-- 2. stage_transition_log — INSERT restricted to Lawyer, Paralegal, Admin
-- ============================================================================
-- Existing policies: stl_tenant_select, stl_tenant_insert (migration 113)

DROP POLICY IF EXISTS stl_tenant_insert ON stage_transition_log;
DROP POLICY IF EXISTS stl_role_insert ON stage_transition_log;

CREATE POLICY "stl_role_insert" ON stage_transition_log
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Paralegal', 'Admin')
  );

COMMENT ON TABLE stage_transition_log IS
  'RLS role-enforced (migration 126): SELECT tenant-scoped; '
  'INSERT requires role IN (Lawyer, Paralegal, Admin).';

-- ============================================================================
-- 3. document_versions — UPDATE restricted to Lawyer, Paralegal, Admin
-- ============================================================================
-- Original migration 028 created SELECT + INSERT only (no UPDATE policy).
-- Review updates were handled by SECURITY DEFINER RPCs.
-- We add a role-gated UPDATE policy to cover any direct UPDATE paths.

DROP POLICY IF EXISTS document_versions_update ON document_versions;
DROP POLICY IF EXISTS document_versions_role_update ON document_versions;

CREATE POLICY "document_versions_role_update" ON document_versions
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Paralegal', 'Admin')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Paralegal', 'Admin')
  );

COMMENT ON TABLE document_versions IS
  'RLS role-enforced (migration 126): SELECT/INSERT tenant-scoped; '
  'UPDATE (status approve/reject) requires role IN (Lawyer, Paralegal, Admin).';

-- ============================================================================
-- 4. trust_transactions — INSERT restricted to Billing, Admin
-- ============================================================================
-- Existing policy: trust_transactions_tenant_isolation FOR ALL (migration 100)
-- Strategy: drop the catch-all, recreate SELECT permissively, gate INSERT.

DROP POLICY IF EXISTS trust_transactions_tenant_isolation ON trust_transactions;
DROP POLICY IF EXISTS trust_transactions_select ON trust_transactions;
DROP POLICY IF EXISTS trust_transactions_insert ON trust_transactions;
DROP POLICY IF EXISTS trust_transactions_update ON trust_transactions;
DROP POLICY IF EXISTS trust_transactions_role_insert ON trust_transactions;

-- SELECT: any tenant member can read trust records
CREATE POLICY "trust_transactions_select" ON trust_transactions
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- UPDATE: any tenant member (amounts are immutable by convention)
CREATE POLICY "trust_transactions_update" ON trust_transactions
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- INSERT: only Billing or Admin
CREATE POLICY "trust_transactions_role_insert" ON trust_transactions
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin')
  );

COMMENT ON TABLE trust_transactions IS
  'RLS role-enforced (migration 126): SELECT tenant-scoped; '
  'INSERT requires role IN (Billing, Admin).';

-- ============================================================================
-- 5. invoices — INSERT, UPDATE restricted to Billing, Admin, Lawyer
-- ============================================================================
-- Existing policy: invoices_billing_access FOR ALL (migration 033)
-- Drop and replace with per-operation policies using get_my_role().

DROP POLICY IF EXISTS invoices_billing_access ON invoices;
DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
DROP POLICY IF EXISTS invoices_select ON invoices;
DROP POLICY IF EXISTS invoices_role_insert ON invoices;
DROP POLICY IF EXISTS invoices_role_update ON invoices;

-- SELECT: any tenant member can read invoices
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- INSERT: Billing, Admin, Lawyer
CREATE POLICY "invoices_role_insert" ON invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin', 'Lawyer')
  );

-- UPDATE: Billing, Admin, Lawyer
CREATE POLICY "invoices_role_update" ON invoices
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin', 'Lawyer')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin', 'Lawyer')
  );

COMMENT ON TABLE invoices IS
  'RLS role-enforced (migration 126): SELECT tenant-scoped; '
  'INSERT/UPDATE require role IN (Billing, Admin, Lawyer). '
  'Replaces has_billing_view() ALL policy from migration 033.';

-- ============================================================================
-- END Migration 126
-- ============================================================================
