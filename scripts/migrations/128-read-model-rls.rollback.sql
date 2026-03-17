-- ============================================================================
-- ROLLBACK: 128-read-model-rls.sql
-- Created: 2026-03-17
-- ============================================================================
--
-- DATA-LOSS WARNING:
--   No data loss. This migration added only RLS SELECT policies.
--   Rolling back replaces role-gated SELECT policies with tenant-only SELECT
--   policies, restoring the broader access that existed after migration 126.
--   No table rows, columns, or indexes are dropped.
--
-- ROLLBACK ORDER:
--   If rolling back all Sprint 6 migrations, apply rollbacks in reverse order:
--   130 → 129 → 128
--   This file is the last in the sequence (migration 128 was first applied).
--
-- EFFECT OF THIS ROLLBACK:
--   Each table below will revert to a tenant-scoped SELECT policy with no
--   role restriction. Any tenant member (any role) will be able to SELECT
--   from trust_transactions, trust_bank_accounts, matter_risk_flags, etc.
--   The activities table will revert to a single tenant-scoped SELECT policy
--   with no sensitive-type restriction.
-- ============================================================================

-- ─── 1. trust_transactions ────────────────────────────────────────────────────
-- Remove role-gated policy and restore tenant-only SELECT.

DROP POLICY IF EXISTS trust_transactions_select ON trust_transactions;

CREATE POLICY "trust_transactions_select" ON trust_transactions
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ─── 2. trust_bank_accounts ───────────────────────────────────────────────────
-- Remove role-gated policy and restore tenant-only SELECT.

DROP POLICY IF EXISTS trust_bank_accounts_select ON trust_bank_accounts;

CREATE POLICY "trust_bank_accounts_select" ON trust_bank_accounts
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ─── 3. trust_reconciliations (conditional — only if table exists) ────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_reconciliations'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_reconciliations_select ON trust_reconciliations';

    EXECUTE $pol$
      CREATE POLICY "trust_reconciliations_select" ON trust_reconciliations
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
        )
    $pol$;
  END IF;
END
$$;

-- ─── 4. trust_audit_log (conditional — only if table exists) ──────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_audit_log'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_audit_log_select ON trust_audit_log';

    EXECUTE $pol$
      CREATE POLICY "trust_audit_log_select" ON trust_audit_log
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
        )
    $pol$;
  END IF;
END
$$;

-- ─── 5. trust_holds (conditional — only if table exists) ──────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_holds'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_holds_select ON trust_holds';

    EXECUTE $pol$
      CREATE POLICY "trust_holds_select" ON trust_holds
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
        )
    $pol$;
  END IF;
END
$$;

-- ─── 6. trust_disbursement_requests (conditional — only if table exists) ──────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trust_disbursement_requests'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS trust_disbursement_requests_select ON trust_disbursement_requests';

    EXECUTE $pol$
      CREATE POLICY "trust_disbursement_requests_select" ON trust_disbursement_requests
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
        )
    $pol$;
  END IF;
END
$$;

-- ─── 7. conflict_of_interest (conditional — only if table exists) ─────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conflict_of_interest'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS conflict_of_interest_select ON conflict_of_interest';

    EXECUTE $pol$
      CREATE POLICY "conflict_of_interest_select" ON conflict_of_interest
        FOR SELECT
        USING (
          tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
        )
    $pol$;
  END IF;
END
$$;

-- ─── 8. matter_risk_flags ─────────────────────────────────────────────────────
-- Remove role-gated policy. Restore single tenant-scoped SELECT.
-- Note: migration 128 renamed the prior policy from mrf_tenant_select to
-- matter_risk_flags_select; both names are dropped for safety.

DROP POLICY IF EXISTS matter_risk_flags_select ON matter_risk_flags;
DROP POLICY IF EXISTS mrf_tenant_select ON matter_risk_flags;

CREATE POLICY "mrf_tenant_select" ON matter_risk_flags
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ─── 9. activities ────────────────────────────────────────────────────────────
-- Remove the two split policies (sensitive / non-sensitive) introduced by
-- migration 128 and restore a single tenant-scoped SELECT policy.

DROP POLICY IF EXISTS activities_select_non_sensitive ON activities;
DROP POLICY IF EXISTS activities_select_sensitive ON activities;
DROP POLICY IF EXISTS activities_select ON activities;
DROP POLICY IF EXISTS activities_tenant_select ON activities;

CREATE POLICY "activities_tenant_select" ON activities
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- Rollback verification: list objects that should no longer exist after this rollback
--
-- After rollback, the following role-gated policies should NOT exist:
--
--   SELECT polname, tablename
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND polname IN (
--       'trust_transactions_select',        -- should exist but WITHOUT get_my_role() guard
--       'trust_bank_accounts_select',       -- should exist but WITHOUT get_my_role() guard
--       'trust_reconciliations_select',     -- should exist but WITHOUT get_my_role() guard
--       'trust_audit_log_select',           -- should exist but WITHOUT get_my_role() guard
--       'trust_holds_select',               -- should exist but WITHOUT get_my_role() guard
--       'trust_disbursement_requests_select', -- should exist but WITHOUT get_my_role() guard
--       'conflict_of_interest_select',      -- should exist but WITHOUT get_my_role() guard
--       'matter_risk_flags_select',         -- should NOT exist (replaced by mrf_tenant_select)
--       'activities_select_non_sensitive',  -- should NOT exist
--       'activities_select_sensitive'       -- should NOT exist
--     );
--
-- Verify the policies were replaced (expect 0 rows for role-gated versions):
--
--   SELECT polname, tablename, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN (
--       'trust_transactions', 'trust_bank_accounts', 'matter_risk_flags', 'activities'
--     )
--     AND p.polcmd = 'r'
--   ORDER BY c.relname, p.polname;
-- ============================================================================
