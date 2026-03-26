-- ============================================================================
-- Migration 171: Smart-Match Deposit Engine
-- ============================================================================
-- Three RPCs for automated trust-to-invoice reconciliation:
--   1. fn_suggest_transaction_matches  -  finds deposits matching open invoices
--   2. fn_apply_trust_allocation      -  one-click apply with audit trail
--   3. fn_reverse_trust_allocation    -  immutable offsetting entry (never deletes)
--
-- Principle III: Auditability  -  every action creates linked records.
-- Sentinel 403 tenant isolation enforced inside each RPC via auth.uid().
-- ============================================================================


-- ============================================================================
-- 1. fn_suggest_transaction_matches(p_matter_id UUID)
-- ============================================================================
-- Finds unallocated deposit transactions and suggests matches against open
-- invoices. Handles exact matches, partial payments, and multi-deposit
-- coverage. Returns JSONB array of suggestions.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_suggest_transaction_matches(p_matter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       UUID;
  v_caller_tenant   UUID;
  v_suggestions     JSONB := '[]'::JSONB;
BEGIN
  -- ── Sentinel 403: Tenant isolation ────────────────────────────────────────
  SELECT tenant_id INTO v_caller_tenant
    FROM users
   WHERE auth_user_id = auth.uid();

  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Unauthorised: no tenant context'
      USING ERRCODE = 'P0403';
  END IF;

  SELECT tenant_id INTO v_tenant_id
    FROM matters
   WHERE id = p_matter_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Matter not found'
      USING ERRCODE = 'P0404';
  END IF;

  IF v_tenant_id <> v_caller_tenant THEN
    RAISE EXCEPTION 'Access denied: cross-tenant violation'
      USING ERRCODE = 'P0403';
  END IF;

  -- ── Build suggestions ─────────────────────────────────────────────────────
  -- For each open invoice with balance_due > 0, find unallocated deposits
  -- that could cover part or all of the balance.
  --
  -- An "unallocated" deposit is one where:
  --   1. transaction_type = 'deposit'
  --   2. invoice_id IS NULL (not already linked to an invoice)
  --   3. reversal_of_id IS NULL (not a reversal entry)
  --   4. No confirmed allocation exists for it yet
  --   5. Same matter_id

  WITH open_invoices AS (
    SELECT
      i.id              AS invoice_id,
      i.invoice_number,
      i.total_amount,
      COALESCE(i.balance_due, i.total_amount - COALESCE(i.total_trust_applied, 0) - COALESCE(i.total_payments_applied, 0)) AS remaining_cents,
      i.due_date,
      i.status
    FROM invoices i
    WHERE i.matter_id = p_matter_id
      AND i.tenant_id = v_tenant_id
      AND i.status IN ('sent', 'viewed', 'overdue', 'finalized', 'draft')
      AND COALESCE(i.balance_due, i.total_amount - COALESCE(i.total_trust_applied, 0) - COALESCE(i.total_payments_applied, 0)) > 0
  ),
  all_deposits AS (
    SELECT
      tt.id             AS transaction_id,
      tt.amount_cents,
      tt.description,
      tt.reference_number,
      tt.effective_date,
      tt.created_at,
      tt.payment_method,
      -- Subtract any pending/confirmed allocations already made from this deposit
      tt.amount_cents - COALESCE(
        (SELECT SUM(ita.amount_cents)
         FROM invoice_trust_allocations ita
         WHERE ita.trust_transaction_id = tt.id
           AND ita.allocation_status IN ('pending', 'confirmed')
        ), 0
      ) AS available_cents
    FROM trust_transactions tt
    WHERE tt.matter_id = p_matter_id
      AND tt.tenant_id = v_tenant_id
      AND tt.transaction_type = 'deposit'
      AND tt.reversal_of_id IS NULL
      AND tt.is_cleared = true
  ),
  unallocated_deposits AS (
    SELECT * FROM all_deposits WHERE available_cents > 0
  )
  SELECT jsonb_agg(suggestion ORDER BY priority ASC, remaining_cents DESC)
    INTO v_suggestions
  FROM (
    -- Exact matches (priority 1)
    SELECT
      jsonb_build_object(
        'match_type',      'exact',
        'priority',        1,
        'invoice_id',      oi.invoice_id,
        'invoice_number',  oi.invoice_number,
        'invoice_total',   oi.total_amount,
        'remaining_cents', oi.remaining_cents,
        'due_date',        oi.due_date,
        'transaction_id',  ud.transaction_id,
        'deposit_cents',   ud.amount_cents,
        'available_cents', ud.available_cents,
        'apply_cents',     oi.remaining_cents,
        'description',     ud.description,
        'reference',       ud.reference_number,
        'deposit_date',    ud.effective_date,
        'payment_method',  ud.payment_method
      ) AS suggestion,
      1 AS priority,
      oi.remaining_cents
    FROM open_invoices oi
    JOIN unallocated_deposits ud
      ON ud.available_cents = oi.remaining_cents

    UNION ALL

    -- Partial matches: deposit covers part of invoice (priority 2)
    SELECT
      jsonb_build_object(
        'match_type',      'partial',
        'priority',        2,
        'invoice_id',      oi.invoice_id,
        'invoice_number',  oi.invoice_number,
        'invoice_total',   oi.total_amount,
        'remaining_cents', oi.remaining_cents,
        'due_date',        oi.due_date,
        'transaction_id',  ud.transaction_id,
        'deposit_cents',   ud.amount_cents,
        'available_cents', ud.available_cents,
        'apply_cents',     ud.available_cents,
        'description',     ud.description,
        'reference',       ud.reference_number,
        'deposit_date',    ud.effective_date,
        'payment_method',  ud.payment_method
      ) AS suggestion,
      2 AS priority,
      oi.remaining_cents
    FROM open_invoices oi
    JOIN unallocated_deposits ud
      ON ud.available_cents < oi.remaining_cents
      AND ud.available_cents > 0

    UNION ALL

    -- Overpayment: deposit exceeds invoice (priority 3)
    SELECT
      jsonb_build_object(
        'match_type',      'overpayment',
        'priority',        3,
        'invoice_id',      oi.invoice_id,
        'invoice_number',  oi.invoice_number,
        'invoice_total',   oi.total_amount,
        'remaining_cents', oi.remaining_cents,
        'due_date',        oi.due_date,
        'transaction_id',  ud.transaction_id,
        'deposit_cents',   ud.amount_cents,
        'available_cents', ud.available_cents,
        'apply_cents',     oi.remaining_cents,
        'description',     ud.description,
        'reference',       ud.reference_number,
        'deposit_date',    ud.effective_date,
        'payment_method',  ud.payment_method
      ) AS suggestion,
      3 AS priority,
      oi.remaining_cents
    FROM open_invoices oi
    JOIN unallocated_deposits ud
      ON ud.available_cents > oi.remaining_cents
  ) sub;

  RETURN COALESCE(v_suggestions, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_suggest_transaction_matches(UUID) TO authenticated;

COMMENT ON FUNCTION fn_suggest_transaction_matches IS
  'Smart-Match Engine: suggests trust deposit → invoice matches. '
  'Returns exact, partial, and overpayment match types. '
  'Sentinel 403 tenant isolation. All math is DB-side.';


-- ============================================================================
-- 2. fn_apply_trust_allocation(...)
-- ============================================================================
-- Creates a linked allocation between a trust deposit and an invoice.
-- Updates invoice.total_trust_applied + balance_due.
-- Links the trust transaction to the invoice.
-- Creates audit trail via invoice_trust_allocations.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_apply_trust_allocation(
  p_matter_id         UUID,
  p_invoice_id        UUID,
  p_transaction_id    UUID,
  p_amount_cents      BIGINT,
  p_notes             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant     UUID;
  v_matter_tenant     UUID;
  v_invoice           RECORD;
  v_transaction       RECORD;
  v_existing_alloc    BIGINT;
  v_available_cents   BIGINT;
  v_new_balance_due   NUMERIC;
  v_allocation_id     UUID;
  v_caller_user_id    UUID;
  v_trust_account_id  UUID;
BEGIN
  -- ── Sentinel 403 ──────────────────────────────────────────────────────────
  SELECT id, tenant_id INTO v_caller_user_id, v_caller_tenant
    FROM users
   WHERE auth_user_id = auth.uid();

  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Unauthorised: no tenant context'
      USING ERRCODE = 'P0403';
  END IF;

  SELECT tenant_id INTO v_matter_tenant
    FROM matters WHERE id = p_matter_id;

  IF v_matter_tenant IS NULL OR v_matter_tenant <> v_caller_tenant THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = 'P0403';
  END IF;

  -- ── Validate invoice ──────────────────────────────────────────────────────
  SELECT id, total_amount, balance_due, total_trust_applied, status, invoice_number
    INTO v_invoice
    FROM invoices
   WHERE id = p_invoice_id
     AND matter_id = p_matter_id
     AND tenant_id = v_caller_tenant;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found or cross-tenant'
      USING ERRCODE = 'P0404';
  END IF;

  IF v_invoice.status IN ('paid', 'voided') THEN
    RAISE EXCEPTION 'Invoice is already %  -  cannot allocate', v_invoice.status
      USING ERRCODE = 'P0409';
  END IF;

  -- ── Validate transaction ──────────────────────────────────────────────────
  SELECT id, amount_cents, trust_account_id, transaction_type, reversal_of_id
    INTO v_transaction
    FROM trust_transactions
   WHERE id = p_transaction_id
     AND matter_id = p_matter_id
     AND tenant_id = v_caller_tenant;

  IF v_transaction.id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found or cross-tenant'
      USING ERRCODE = 'P0404';
  END IF;

  IF v_transaction.transaction_type <> 'deposit' THEN
    RAISE EXCEPTION 'Only deposit transactions can be allocated'
      USING ERRCODE = 'P0422';
  END IF;

  IF v_transaction.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot allocate a reversal transaction'
      USING ERRCODE = 'P0422';
  END IF;

  v_trust_account_id := v_transaction.trust_account_id;

  -- ── Check available amount on the deposit ─────────────────────────────────
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_existing_alloc
    FROM invoice_trust_allocations
   WHERE trust_transaction_id = p_transaction_id
     AND allocation_status IN ('pending', 'confirmed');

  v_available_cents := v_transaction.amount_cents - v_existing_alloc;

  IF p_amount_cents > v_available_cents THEN
    RAISE EXCEPTION 'Requested % cents exceeds available % cents on deposit',
      p_amount_cents, v_available_cents
      USING ERRCODE = 'P0422';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive'
      USING ERRCODE = 'P0422';
  END IF;

  -- ── Check invoice balance ─────────────────────────────────────────────────
  IF p_amount_cents > COALESCE(v_invoice.balance_due, v_invoice.total_amount) THEN
    RAISE EXCEPTION 'Amount exceeds invoice balance due'
      USING ERRCODE = 'P0422';
  END IF;

  -- ── Create the allocation record ──────────────────────────────────────────
  INSERT INTO invoice_trust_allocations (
    tenant_id, matter_id, invoice_id, trust_account_id,
    trust_transaction_id, amount_cents, allocation_status,
    requested_by, requested_at, confirmed_by, confirmed_at, notes
  ) VALUES (
    v_caller_tenant, p_matter_id, p_invoice_id, v_trust_account_id,
    p_transaction_id, p_amount_cents, 'confirmed',
    v_caller_user_id, NOW(), v_caller_user_id, NOW(), p_notes
  )
  RETURNING id INTO v_allocation_id;

  -- ── Recalculate invoice totals via the authorised path ────────────────────
  -- calculate_invoice_totals() re-sums allocations from invoice_trust_allocations
  -- and updates total_trust_applied, amount_paid, and the GENERATED balance_due.
  -- It also sets the GUC that the guard trigger requires.
  PERFORM calculate_invoice_totals(p_invoice_id);

  -- Read back the recalculated balance to decide paid status
  SELECT balance_due INTO v_new_balance_due
    FROM invoices WHERE id = p_invoice_id;

  -- Auto-mark paid if balance reaches zero
  IF COALESCE(v_new_balance_due, 0) = 0 THEN
    UPDATE invoices
       SET status = 'paid',
           paid_date = COALESCE(paid_date, NOW()),
           updated_at = NOW()
     WHERE id = p_invoice_id
       AND status <> 'paid';
  END IF;

  -- ── Link transaction to invoice (if not already linked) ───────────────────
  UPDATE trust_transactions
     SET invoice_id = p_invoice_id,
         notes = COALESCE(notes, '') ||
           E'\n[Smart-Match] Allocated ' ||
           to_char(p_amount_cents / 100.0, 'FM$999,999,990.00') ||
           ' to Invoice ' || COALESCE(v_invoice.invoice_number, p_invoice_id::TEXT)
   WHERE id = p_transaction_id
     AND invoice_id IS NULL;

  RETURN jsonb_build_object(
    'success',          true,
    'allocation_id',    v_allocation_id,
    'amount_cents',     p_amount_cents,
    'invoice_id',       p_invoice_id,
    'invoice_number',   v_invoice.invoice_number,
    'transaction_id',   p_transaction_id,
    'new_balance_due',  GREATEST(0, v_new_balance_due),
    'invoice_paid',     (GREATEST(0, v_new_balance_due) = 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_apply_trust_allocation(UUID, UUID, UUID, BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_apply_trust_allocation IS
  'Smart-Match: one-click apply of trust deposit to invoice. '
  'Creates allocation record, updates invoice totals, auto-marks paid if balance reaches zero. '
  'Sentinel 403, immutable audit trail.';


-- ============================================================================
-- 3. fn_reverse_trust_allocation(p_allocation_id UUID, p_reason TEXT)
-- ============================================================================
-- Creates an OFFSETTING ENTRY  -  never deletes the original.
-- Principle III: Auditability.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_reverse_trust_allocation(
  p_allocation_id UUID,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant     UUID;
  v_caller_user_id    UUID;
  v_alloc             RECORD;
  v_reversal_alloc_id UUID;
  v_new_balance_due   NUMERIC;
BEGIN
  -- ── Sentinel 403 ──────────────────────────────────────────────────────────
  SELECT id, tenant_id INTO v_caller_user_id, v_caller_tenant
    FROM users
   WHERE auth_user_id = auth.uid();

  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Unauthorised: no tenant context'
      USING ERRCODE = 'P0403';
  END IF;

  -- ── Validate allocation ───────────────────────────────────────────────────
  SELECT id, tenant_id, matter_id, invoice_id, trust_account_id,
         trust_transaction_id, amount_cents, allocation_status
    INTO v_alloc
    FROM invoice_trust_allocations
   WHERE id = p_allocation_id;

  IF v_alloc.id IS NULL THEN
    RAISE EXCEPTION 'Allocation not found'
      USING ERRCODE = 'P0404';
  END IF;

  IF v_alloc.tenant_id <> v_caller_tenant THEN
    RAISE EXCEPTION 'Access denied: cross-tenant'
      USING ERRCODE = 'P0403';
  END IF;

  IF v_alloc.allocation_status = 'reversed' THEN
    RAISE EXCEPTION 'Allocation already reversed'
      USING ERRCODE = 'P0409';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reversal reason is required'
      USING ERRCODE = 'P0422';
  END IF;

  -- ── Mark original as reversed ─────────────────────────────────────────────
  UPDATE invoice_trust_allocations
     SET allocation_status = 'reversed',
         notes = COALESCE(notes, '') || E'\n[REVERSED] ' || p_reason,
         updated_at = NOW()
   WHERE id = p_allocation_id;

  -- ── Create offsetting (negative) allocation ───────────────────────────────
  INSERT INTO invoice_trust_allocations (
    tenant_id, matter_id, invoice_id, trust_account_id,
    trust_transaction_id, amount_cents, allocation_status,
    requested_by, requested_at, confirmed_by, confirmed_at, notes
  ) VALUES (
    v_alloc.tenant_id, v_alloc.matter_id, v_alloc.invoice_id,
    v_alloc.trust_account_id, v_alloc.trust_transaction_id,
    -v_alloc.amount_cents, 'confirmed',
    v_caller_user_id, NOW(), v_caller_user_id, NOW(),
    '[OFFSETTING ENTRY] Reversal of allocation ' || p_allocation_id::TEXT || ': ' || p_reason
  )
  RETURNING id INTO v_reversal_alloc_id;

  -- ── Recalculate invoice totals via the authorised path ────────────────────
  PERFORM calculate_invoice_totals(v_alloc.invoice_id);

  -- Read back recalculated balance
  SELECT balance_due INTO v_new_balance_due
    FROM invoices WHERE id = v_alloc.invoice_id;

  -- Reopen invoice if it was paid but now has a balance
  IF COALESCE(v_new_balance_due, 0) > 0 THEN
    UPDATE invoices
       SET status = CASE WHEN status = 'paid' THEN 'sent' ELSE status END,
           paid_date = CASE WHEN status = 'paid' THEN NULL ELSE paid_date END,
           updated_at = NOW()
     WHERE id = v_alloc.invoice_id
       AND status = 'paid';
  END IF;

  -- ── Unlink transaction from invoice (free it for re-allocation) ───────────
  UPDATE trust_transactions
     SET invoice_id = NULL,
         notes = COALESCE(notes, '') ||
           E'\n[Smart-Match REVERSED] ' || p_reason
   WHERE id = v_alloc.trust_transaction_id
     AND invoice_id = v_alloc.invoice_id;

  RETURN jsonb_build_object(
    'success',              true,
    'reversed_allocation',  p_allocation_id,
    'offsetting_entry_id',  v_reversal_alloc_id,
    'amount_cents',         v_alloc.amount_cents,
    'invoice_id',           v_alloc.invoice_id,
    'new_balance_due',      GREATEST(0, v_new_balance_due),
    'reason',               p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_reverse_trust_allocation(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_reverse_trust_allocation IS
  'Immutable reversal: creates an offsetting entry, never deletes. '
  'Reopens invoice if balance returns above zero. Sentinel 403.';
