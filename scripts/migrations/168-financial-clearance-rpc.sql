-- ============================================================================
-- Migration 168: Financial Kill-Switch — check_financial_clearance RPC
-- ============================================================================
-- Returns financial clearance status for a matter.
-- A matter is NOT cleared for submission if:
--   1. outstanding_cents > 0  (client still owes money)
--   2. unallocated_cents > 0  (trust funds sitting idle, not applied to fees)
--
-- All calculations happen in Postgres — zero frontend math.
-- Inherits RLS tenant isolation via auth.uid().
-- ============================================================================

CREATE OR REPLACE FUNCTION check_financial_clearance(p_matter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       UUID;
  v_caller_tenant   UUID;
  v_total_billed    BIGINT;
  v_trust_balance   BIGINT;  -- running_balance_cents from latest trust transaction
  v_outstanding     BIGINT;
  v_unallocated     BIGINT;
  v_cleared         BOOLEAN;
  v_blockers        JSONB := '[]'::JSONB;
  v_fee_snap        JSONB;
BEGIN
  -- ── 1. Tenant isolation (Sentinel 403 pattern) ──────────────────────────
  SELECT tenant_id INTO v_caller_tenant
    FROM users
   WHERE auth_user_id = auth.uid();

  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Unauthorised: no tenant context'
      USING ERRCODE = 'P0403';
  END IF;

  SELECT tenant_id, total_amount_cents, fee_snapshot
    INTO v_tenant_id, v_total_billed, v_fee_snap
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

  -- ── 2. Resolve total billed (fee_snapshot.total_amount_cents → fallback) ─
  -- fee_snapshot is the canonical source; total_amount_cents is the legacy col
  IF v_fee_snap IS NOT NULL
     AND v_fee_snap ->> 'total_amount_cents' IS NOT NULL THEN
    v_total_billed := (v_fee_snap ->> 'total_amount_cents')::BIGINT;
  END IF;

  -- If still null, derive from professional + government + disbursements
  IF v_total_billed IS NULL OR v_total_billed = 0 THEN
    IF v_fee_snap IS NOT NULL THEN
      SELECT COALESCE(SUM((item ->> 'amount_cents')::BIGINT), 0)
        INTO v_total_billed
        FROM (
          SELECT jsonb_array_elements(
            COALESCE(v_fee_snap -> 'professional_fees', '[]'::JSONB) ||
            COALESCE(v_fee_snap -> 'government_fees',   '[]'::JSONB) ||
            COALESCE(v_fee_snap -> 'disbursements',     '[]'::JSONB)
          ) AS item
        ) sub;
    ELSE
      v_total_billed := 0;
    END IF;
  END IF;

  -- ── 3. Get current trust balance (DB-computed, from latest transaction) ──
  SELECT COALESCE(running_balance_cents, 0)
    INTO v_trust_balance
    FROM trust_transactions
   WHERE matter_id = p_matter_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- No trust transactions at all — balance is 0
  IF v_trust_balance IS NULL THEN
    v_trust_balance := 0;
  END IF;

  -- ── 4. Compute outstanding and unallocated ──────────────────────────────
  -- Outstanding = how much the client still owes (billed - trust held)
  v_outstanding  := GREATEST(0, v_total_billed - v_trust_balance);

  -- Unallocated = excess trust funds beyond what's owed
  v_unallocated  := GREATEST(0, v_trust_balance - v_total_billed);

  -- ── 5. Build blockers array ─────────────────────────────────────────────
  IF v_outstanding > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code',    'OUTSTANDING_BALANCE',
        'message', format('Client owes %s — outstanding balance of $%s must be cleared before submission.',
                          format('%s cents', v_outstanding),
                          to_char(v_outstanding / 100.0, 'FM999,999,990.00')),
        'cents',   v_outstanding
      )
    );
  END IF;

  IF v_unallocated > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code',    'UNALLOCATED_TRUST_FUNDS',
        'message', format('$%s in unallocated trust funds — apply or refund before submission.',
                          to_char(v_unallocated / 100.0, 'FM999,999,990.00')),
        'cents',   v_unallocated
      )
    );
  END IF;

  -- ── 6. Final clearance verdict ──────────────────────────────────────────
  v_cleared := (v_outstanding = 0 AND v_unallocated = 0);

  RETURN jsonb_build_object(
    'cleared',            v_cleared,
    'outstanding_cents',  v_outstanding,
    'unallocated_cents',  v_unallocated,
    'trust_balance_cents', v_trust_balance,
    'total_billed_cents', v_total_billed,
    'blockers',           v_blockers
  );
END;
$$;

-- Grant execute to authenticated users (RLS enforced inside the function)
GRANT EXECUTE ON FUNCTION check_financial_clearance(UUID) TO authenticated;

COMMENT ON FUNCTION check_financial_clearance IS
  'Financial Kill-Switch: returns clearance status for matter submission. '
  'Blocks if outstanding balance > 0 or unallocated trust funds exist. '
  'All calculations happen in Postgres — zero frontend math.';
