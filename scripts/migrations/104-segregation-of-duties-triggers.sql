-- Migration 104: Segregation of Duties  -  DB-Level Enforcement
--
-- Moves three segregation checks from app-only to dual-enforced (app + DB).
-- These controls were previously enforced only in TypeScript:
--   1. Write-off approval: requester ≠ approver
--   2. Disbursement approval: preparer ≠ approver
--   3. Payment plan approval: creator ≠ approver
--
-- After this migration, even direct DB access (including service_role)
-- cannot violate segregation of duties on these critical financial actions.

-- ── 1. Disbursement segregation: prepared_by ≠ approved_by ─────────────────

CREATE OR REPLACE FUNCTION enforce_disbursement_segregation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when approval is being set
  IF NEW.status = 'approved' AND NEW.approved_by IS NOT NULL THEN
    IF NEW.prepared_by = NEW.approved_by THEN
      RAISE EXCEPTION 'Segregation of duties violation: the preparer of a disbursement request cannot also approve it. prepared_by=%, approved_by=%',
        NEW.prepared_by, NEW.approved_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disbursement_segregation ON trust_disbursement_requests;
CREATE TRIGGER trg_disbursement_segregation
  BEFORE UPDATE ON trust_disbursement_requests
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION enforce_disbursement_segregation();

-- ── 2. Payment plan segregation: created_by ≠ approved_by ──────────────────

CREATE OR REPLACE FUNCTION enforce_payment_plan_segregation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.created_by = NEW.approved_by THEN
    RAISE EXCEPTION 'Segregation of duties violation: the creator of a payment plan cannot also approve it. created_by=%, approved_by=%',
      NEW.created_by, NEW.approved_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_plan_segregation ON payment_plans;
CREATE TRIGGER trg_payment_plan_segregation
  BEFORE UPDATE ON payment_plans
  FOR EACH ROW
  WHEN (NEW.approved_by IS NOT NULL)
  EXECUTE FUNCTION enforce_payment_plan_segregation();

-- ── 3. Write-off segregation via collection_actions ─────────────────────────
-- Write-offs use two separate collection_actions rows:
--   (a) action_type = 'write_off_requested' with performed_by = requester
--   (b) action_type = 'write_off_approved' with performed_by = approver
--
-- The DB trigger checks that the approver is not the same as the requester
-- by looking up the most recent 'write_off_requested' action for the same invoice.

CREATE OR REPLACE FUNCTION enforce_write_off_segregation()
RETURNS TRIGGER AS $$
DECLARE
  requester_id UUID;
BEGIN
  -- Only fire for write_off_approved actions
  IF NEW.action_type = 'write_off_approved' THEN
    -- Find the most recent write_off_requested for this invoice
    SELECT performed_by INTO requester_id
    FROM collection_actions
    WHERE invoice_id = NEW.invoice_id
      AND action_type = 'write_off_requested'
      AND tenant_id = NEW.tenant_id
    ORDER BY performed_at DESC
    LIMIT 1;

    IF requester_id IS NOT NULL AND requester_id = NEW.performed_by THEN
      RAISE EXCEPTION 'Segregation of duties violation: the requester of a write-off cannot also approve it. requester=%, approver=%',
        requester_id, NEW.performed_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_write_off_segregation ON collection_actions;
CREATE TRIGGER trg_write_off_segregation
  BEFORE INSERT ON collection_actions
  FOR EACH ROW
  WHEN (NEW.action_type = 'write_off_approved')
  EXECUTE FUNCTION enforce_write_off_segregation();
