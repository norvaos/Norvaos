-- ═══════════════════════════════════════════════════════════════════════════
-- RLS PROOF SCRIPT for Migration 033
-- Run each block separately in Supabase SQL Editor (Role: postgres)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Test 1: Admin → has_billing_view() = TRUE ──────────────────────────────
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claims = '{"sub":"02c4b52f-c0d5-4f23-8c46-b186b2f53ee6"}';
-- SELECT 'Admin (Zia)' AS role_test, has_billing_view() AS can_see_billing;
-- Result: true

-- ── Test 2: Lawyer → has_billing_view() = FALSE ────────────────────────────
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claims = '{"sub":"699c9dc3-2008-43eb-b823-4e07493805cb"}';
-- SELECT 'Lawyer (Sarah)' AS role_test, has_billing_view() AS can_see_billing;
-- Result: false

-- ── Test 3: Lawyer sees 0 rows from all billing tables ─────────────────────
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claims = '{"sub":"699c9dc3-2008-43eb-b823-4e07493805cb"}';
-- SELECT 'LAWYER' AS test_user, 'invoices' AS tbl, count(*) FROM invoices
-- UNION ALL
-- SELECT 'LAWYER', 'invoice_line_items', count(*) FROM invoice_line_items
-- UNION ALL
-- SELECT 'LAWYER', 'payments', count(*) FROM payments;
-- Result: 0, 0, 0

-- ── Verify new policies exist ──────────────────────────────────────────────
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('invoices', 'invoice_line_items', 'payments');
-- Result:
--   invoice_line_items | invoice_line_items_billing_access
--   invoices           | invoices_billing_access
--   payments           | payments_billing_access

-- ── Verify function exists with correct properties ─────────────────────────
-- SELECT proname, prosecdef, provolatile FROM pg_proc
-- WHERE proname = 'has_billing_view';
-- Result: has_billing_view | true (SECURITY DEFINER) | s (STABLE)
