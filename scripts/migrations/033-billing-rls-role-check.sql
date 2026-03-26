-- ============================================================================
-- Migration 033: Add role-aware RLS to billing tables
-- ============================================================================
-- PROBLEM: invoices, invoice_line_items, and payments tables have RLS policies
-- that only enforce tenant isolation. Any authenticated user within the tenant
-- can query financial records directly via Supabase client, bypassing the UI
-- RequirePermission gate.
--
-- FIX: Replace the tenant-only policies with ones that also check whether
-- the user's role has billing:view permission (or is Admin).
--
-- SCOPE:
--   invoices              – SELECT/INSERT/UPDATE/DELETE → require billing:view
--   invoice_line_items    – SELECT/INSERT/UPDATE/DELETE → require billing:view
--                           (no tenant_id column  -  joins through invoices)
--   payments              – SELECT/INSERT/UPDATE/DELETE → require billing:view
--   time_entries          – UNCHANGED (time tracking is cross-role)
--
-- EXISTING POLICY NAMES (from pg_policies):
--   tenant_isolation_invoices            ON invoices
--   tenant_isolation_invoice_line_items  ON invoice_line_items
--   tenant_isolation_payments            ON payments
--
-- NOTE: Service-role clients (webhooks, server actions) bypass RLS entirely.
-- ============================================================================

-- ── Helper: check if current user has billing:view permission ────────────────

CREATE OR REPLACE FUNCTION public.has_billing_view()
RETURNS BOOLEAN AS $$
DECLARE
  v_role_name TEXT;
  v_permissions JSONB;
BEGIN
  SELECT r.name, r.permissions
    INTO v_role_name, v_permissions
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.auth_user_id = auth.uid();

  -- No user / no role → deny
  IF v_role_name IS NULL THEN RETURN FALSE; END IF;

  -- Admin shortcut: { "all": true } or role name = 'Admin'
  IF v_role_name = 'Admin' THEN RETURN TRUE; END IF;

  -- Explicit billing.view permission check
  RETURN COALESCE((v_permissions -> 'billing' ->> 'view')::boolean, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.has_billing_view() IS
  'Returns TRUE if the current auth.uid() user has billing:view permission '
  'via their role. Used in RLS policies on invoices, invoice_line_items, '
  'and payments tables. See also: lib/utils/permissions.ts';

-- ── invoices (has tenant_id) ───────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;

CREATE POLICY invoices_billing_access ON invoices
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- ── invoice_line_items (NO tenant_id  -  joins through invoices.invoice_id) ──

DROP POLICY IF EXISTS tenant_isolation_invoice_line_items ON invoice_line_items;

CREATE POLICY invoice_line_items_billing_access ON invoice_line_items
  FOR ALL USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      WHERE i.tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    )
    AND has_billing_view()
  )
  WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      WHERE i.tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    )
    AND has_billing_view()
  );

-- ── payments (has tenant_id) ───────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_payments ON payments;

CREATE POLICY payments_billing_access ON payments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- ============================================================================
-- END Migration 033
-- ============================================================================
