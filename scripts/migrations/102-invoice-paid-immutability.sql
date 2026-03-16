-- Migration 102: Invoice Paid Immutability
-- Prevents modification of invoices after they are marked as paid.
-- Corrections must use credit notes or reversal workflow, not direct mutation.
--
-- Locked fields when status = 'paid':
--   total, amount_paid, status, invoice_number, matter_id, tenant_id,
--   issue_date, due_date, contact_id
--
-- Allowed fields (operational metadata):
--   aging_bucket, aging_updated_at, notes, updated_at

-- ── Trigger function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_paid_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only block if the invoice was already paid before this UPDATE
  IF OLD.status = 'paid' THEN
    -- Allow aging bucket updates (cron job) and notes
    IF (
      NEW.total IS DISTINCT FROM OLD.total OR
      NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
      NEW.matter_id IS DISTINCT FROM OLD.matter_id OR
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
      NEW.due_date IS DISTINCT FROM OLD.due_date OR
      NEW.contact_id IS DISTINCT FROM OLD.contact_id
    ) THEN
      RAISE EXCEPTION 'Paid invoices are immutable. Use a credit note or reversal for corrections. Invoice: %', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Apply trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_invoices_paid_immutable ON invoices;
CREATE TRIGGER trg_invoices_paid_immutable
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_invoice_mutation();

-- Block DELETE of paid invoices
CREATE OR REPLACE FUNCTION prevent_paid_invoice_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot be deleted. Invoice: %', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_paid_no_delete ON invoices;
CREATE TRIGGER trg_invoices_paid_no_delete
  BEFORE DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_invoice_delete();

-- ── Cheque post-issuance immutability ───────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_issued_cheque_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('cleared', 'void') THEN
    RAISE EXCEPTION 'Cleared or voided cheques are immutable. Cheque: %', OLD.id;
  END IF;

  -- Issued cheques: only allow status changes (to cleared, void, stop_payment)
  IF OLD.status = 'issued' THEN
    IF (
      NEW.cheque_number IS DISTINCT FROM OLD.cheque_number OR
      NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR
      NEW.payee_name IS DISTINCT FROM OLD.payee_name OR
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.matter_id IS DISTINCT FROM OLD.matter_id OR
      NEW.trust_account_id IS DISTINCT FROM OLD.trust_account_id OR
      NEW.operating_account_id IS DISTINCT FROM OLD.operating_account_id
    ) THEN
      RAISE EXCEPTION 'Issued cheques cannot have financial fields modified. Only status transitions are allowed. Cheque: %', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheques_issued_immutable ON cheques;
CREATE TRIGGER trg_cheques_issued_immutable
  BEFORE UPDATE ON cheques
  FOR EACH ROW
  EXECUTE FUNCTION prevent_issued_cheque_mutation();
