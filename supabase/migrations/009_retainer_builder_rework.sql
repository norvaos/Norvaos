-- ============================================================================
-- Migration 009: Retainer Builder Rework  -  Lead-Level Retainer Flow
--
-- Enables building, sending, and tracking retainer agreements at the LEAD level
-- (before matter conversion). Extends lead_retainer_packages with fee line items,
-- and allows signing_documents/signing_requests to reference leads directly.
-- ============================================================================

-- ─── 1A. Extend lead_retainer_packages with line items + totals ─────────────

ALTER TABLE lead_retainer_packages
  ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS government_fees JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disbursements JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hst_applicable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS payment_plan JSONB,
  ADD COLUMN IF NOT EXISTS signing_document_id UUID,
  ADD COLUMN IF NOT EXISTS signing_request_id UUID;

-- ─── 1B. Extend signing_documents for lead-level signing ────────────────────

-- Make matter_id nullable (was NOT NULL)
ALTER TABLE signing_documents ALTER COLUMN matter_id DROP NOT NULL;

-- Add lead_id reference
ALTER TABLE signing_documents
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

-- Ensure at least one parent entity is set
ALTER TABLE signing_documents
  ADD CONSTRAINT chk_signing_documents_parent
  CHECK (matter_id IS NOT NULL OR lead_id IS NOT NULL);

-- Index for lead-based lookups
CREATE INDEX IF NOT EXISTS idx_signing_documents_lead
  ON signing_documents (lead_id) WHERE lead_id IS NOT NULL;

-- ─── 1C. Extend signing_requests for lead-level signing ─────────────────────

-- Make matter_id nullable (was NOT NULL)
ALTER TABLE signing_requests ALTER COLUMN matter_id DROP NOT NULL;

-- Add lead_id reference
ALTER TABLE signing_requests
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

-- Ensure at least one parent entity is set
ALTER TABLE signing_requests
  ADD CONSTRAINT chk_signing_requests_parent
  CHECK (matter_id IS NOT NULL OR lead_id IS NOT NULL);

-- Index for lead-based lookups
CREATE INDEX IF NOT EXISTS idx_signing_requests_lead
  ON signing_requests (lead_id) WHERE lead_id IS NOT NULL;

-- ─── 1D. Replace immutability trigger on signing_documents ──────────────────
-- The existing trigger blocks ALL updates, but conversion needs to set matter_id
-- on rows where it was previously NULL. Create a new trigger function that allows
-- this specific update pattern.

CREATE OR REPLACE FUNCTION prevent_signing_doc_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow setting matter_id on rows where it was previously NULL (conversion flow)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.matter_id IS NULL AND NEW.matter_id IS NOT NULL THEN
      -- Allow: this is the conversion linking flow
      -- But ensure nothing else changes
      IF OLD.id = NEW.id
        AND OLD.tenant_id = NEW.tenant_id
        AND OLD.storage_path = NEW.storage_path
        AND OLD.checksum_sha256 = NEW.checksum_sha256
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'signing_documents rows are immutable after creation';
END;
$$ LANGUAGE plpgsql;

-- Replace the trigger
DROP TRIGGER IF EXISTS trg_signing_documents_immutable ON signing_documents;

CREATE TRIGGER trg_signing_documents_immutable
  BEFORE UPDATE OR DELETE ON signing_documents
  FOR EACH ROW EXECUTE FUNCTION prevent_signing_doc_mutation();

-- ─── Done ───────────────────────────────────────────────────────────────────
