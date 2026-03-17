-- ============================================================================
-- Migration 128: Read Model SELECT Restrictions
-- ============================================================================
-- Adds role-gated SELECT policies on sensitive tables so that only users
-- with the appropriate role can read confidential data.
--
-- Relies on get_my_role() from migration 126.
-- Role names are title-case: 'Lawyer', 'Admin', 'Paralegal', 'Billing', 'Front Desk'
--
-- Tables restricted:
--   trust_transactions         — Billing, Admin, Lawyer
--   trust_bank_accounts        — Billing, Admin, Lawyer
--   trust_reconciliations      — Billing, Admin (if table exists)
--   trust_audit_log            — Billing, Admin (if table exists)
--   trust_holds                — Billing, Admin, Lawyer (if table exists)
--   trust_disbursement_requests— Billing, Admin, Lawyer (if table exists)
--   conflict_of_interest       — Lawyer, Admin (if table exists)
--   matter_risk_flags          — Lawyer, Paralegal, Admin
--   activities                 — partial: lawyer_note / internal_escalation /
--                                auto_rollback_triggered rows → Lawyer, Admin only
--
-- 2026-03-17 — Sprint 6, Week 2
-- ============================================================================

-- ─── 1. trust_transactions — SELECT: Billing, Admin, Lawyer ──────────────────
-- Migration 126 recreated SELECT as tenant-only. We now tighten it with role.

DROP POLICY IF EXISTS trust_transactions_select ON trust_transactions;

CREATE POLICY "trust_transactions_select" ON trust_transactions
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin', 'Lawyer')
  );

COMMENT ON TABLE trust_transactions IS
  'RLS role-enforced (migration 128): SELECT requires role IN (Billing, Admin, Lawyer); '
  'INSERT requires role IN (Billing, Admin) per migration 126.';

-- ─── 2. trust_bank_accounts — SELECT: Billing, Admin, Lawyer ─────────────────

DROP POLICY IF EXISTS trust_bank_accounts_select ON trust_bank_accounts;
DROP POLICY IF EXISTS trust_bank_accounts_tenant_isolation ON trust_bank_accounts;

-- Recreate scoped SELECT
CREATE POLICY "trust_bank_accounts_select" ON trust_bank_accounts
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Billing', 'Admin', 'Lawyer')
  );

COMMENT ON TABLE trust_bank_accounts IS
  'RLS role-enforced (migration 128): SELECT requires role IN (Billing, Admin, Lawyer).';

-- ─── 3. trust_reconciliations — SELECT: Billing, Admin ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_reconciliations'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_reconciliations_select ON trust_reconciliations';
    EXECUTE 'DROP POLICY IF EXISTS trust_reconciliations_tenant_isolation ON trust_reconciliations';

    EXECUTE $pol$
      CREATE POLICY "trust_reconciliations_select" ON trust_reconciliations
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
          AND get_my_role() IN (''Billing'', ''Admin'')
        )
    $pol$;
  END IF;
END
$$;

-- ─── 4. trust_audit_log — SELECT: Billing, Admin ──────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_audit_log'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_audit_log_select ON trust_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS trust_audit_log_tenant_isolation ON trust_audit_log';

    EXECUTE $pol$
      CREATE POLICY "trust_audit_log_select" ON trust_audit_log
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
          AND get_my_role() IN (''Billing'', ''Admin'')
        )
    $pol$;
  END IF;
END
$$;

-- ─── 5. trust_holds — SELECT: Billing, Admin, Lawyer ─────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_holds'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_holds_select ON trust_holds';
    EXECUTE 'DROP POLICY IF EXISTS trust_holds_tenant_isolation ON trust_holds';

    EXECUTE $pol$
      CREATE POLICY "trust_holds_select" ON trust_holds
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
          AND get_my_role() IN (''Billing'', ''Admin'', ''Lawyer'')
        )
    $pol$;
  END IF;
END
$$;

-- ─── 6. trust_disbursement_requests — SELECT: Billing, Admin, Lawyer ─────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_disbursement_requests'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_disbursement_requests_select ON trust_disbursement_requests';
    EXECUTE 'DROP POLICY IF EXISTS trust_disbursement_requests_tenant_isolation ON trust_disbursement_requests';

    EXECUTE $pol$
      CREATE POLICY "trust_disbursement_requests_select" ON trust_disbursement_requests
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
          AND get_my_role() IN (''Billing'', ''Admin'', ''Lawyer'')
        )
    $pol$;
  END IF;
END
$$;

-- ─── 7. conflict_of_interest — SELECT: Lawyer, Admin ─────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conflict_of_interest'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS conflict_of_interest_select ON conflict_of_interest';
    EXECUTE 'DROP POLICY IF EXISTS conflict_of_interest_tenant_isolation ON conflict_of_interest';

    EXECUTE $pol$
      CREATE POLICY "conflict_of_interest_select" ON conflict_of_interest
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
          AND get_my_role() IN (''Lawyer'', ''Admin'')
        )
    $pol$;
  END IF;
END
$$;

-- ─── 8. matter_risk_flags — SELECT: Lawyer, Paralegal, Admin ─────────────────

DROP POLICY IF EXISTS matter_risk_flags_select ON matter_risk_flags;
DROP POLICY IF EXISTS mrf_tenant_select ON matter_risk_flags;

CREATE POLICY "matter_risk_flags_select" ON matter_risk_flags
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND get_my_role() IN ('Lawyer', 'Paralegal', 'Admin')
  );

COMMENT ON TABLE matter_risk_flags IS
  'RLS role-enforced (migration 128): SELECT requires role IN (Lawyer, Paralegal, Admin).';

-- ─── 9. activities — partial SELECT restriction ────────────────────────────────
-- Sensitive activity types (lawyer_note, internal_escalation,
-- auto_rollback_triggered) are restricted to Lawyer and Admin.
-- All other rows remain readable by any tenant member.
--
-- Strategy: drop existing tenant-only SELECT policy, replace with two policies:
--   a) A policy that passes any row whose activity_type is NOT sensitive
--   b) A policy that passes sensitive rows only for Lawyer/Admin
--
-- Because RLS policies are OR-combined for the same operation, a row is
-- accessible if either policy evaluates to TRUE.

DROP POLICY IF EXISTS activities_select ON activities;
DROP POLICY IF EXISTS activities_tenant_select ON activities;
DROP POLICY IF EXISTS activities_select_non_sensitive ON activities;
DROP POLICY IF EXISTS activities_select_sensitive ON activities;

-- All non-sensitive activity rows — any tenant member can read
CREATE POLICY "activities_select_non_sensitive" ON activities
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND activity_type NOT IN ('lawyer_note', 'internal_escalation', 'auto_rollback_triggered')
  );

-- Sensitive activity rows — Lawyer and Admin only
CREATE POLICY "activities_select_sensitive" ON activities
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND activity_type IN ('lawyer_note', 'internal_escalation', 'auto_rollback_triggered')
    AND get_my_role() IN ('Lawyer', 'Admin')
  );

COMMENT ON TABLE activities IS
  'RLS partially role-enforced (migration 128): activity_type IN (lawyer_note, '
  'internal_escalation, auto_rollback_triggered) SELECT-restricted to Lawyer, Admin. '
  'All other rows remain tenant-scoped readable.';

-- ============================================================================
-- END Migration 128
-- ============================================================================
