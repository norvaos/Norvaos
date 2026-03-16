-- Migration 105: Invoice Lifecycle Automation
-- Phase 9: Revenue Operations
-- Applied: 2026-03-15

-- Add lifecycle tracking columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

-- Update immutability trigger to allow metadata fields on paid invoices
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

-- Indexes for cron job efficiency
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date
  ON invoices (status, due_date)
  WHERE status IN ('sent', 'viewed', 'overdue');

CREATE INDEX IF NOT EXISTS idx_invoices_reminder_tracking
  ON invoices (status, due_date, last_reminder_at)
  WHERE status IN ('sent', 'viewed', 'overdue');
