-- Migration 106: Rename invoices.total → invoices.total_amount
-- Aligns the DB column name with the TypeScript types and all application code
-- which consistently references total_amount.

ALTER TABLE invoices RENAME COLUMN total TO total_amount;

-- Rebuild the immutability trigger with the correct column name
CREATE OR REPLACE FUNCTION prevent_paid_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF (
      NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
      NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
      NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
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
