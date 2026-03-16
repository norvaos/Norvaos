-- ============================================================================
-- Migration 107: NorvaOS Billing Module — Full Invoice Engine
-- ============================================================================
--
-- A. Fix existing trigger: prevent_paid_invoice_mutation references old column
--    name "total" (renamed to "total_amount" in migration 106). Fixes live bug.
-- B. Extend invoices.status CHECK constraint to include finalized, partially_paid,
--    written_off.
-- C. Extend invoices table: 15 new columns for billing engine.
-- D. Extend invoice_line_items: 15 new columns for category separation, tax,
--    and source tracking.
-- E. Extend payments: 4 new columns for source tracking and void workflow.
-- F. New reference tables (system-level):
--      billing_categories, disbursement_categories, tax_jurisdictions
-- G. New tenant-scoped billing tables:
--      tax_profiles, tax_codes, tax_registrations,
--      invoice_number_sequences, invoice_templates,
--      invoice_template_soft_cost_rates, discount_approval_thresholds,
--      invoice_adjustments, invoice_trust_allocations,
--      invoice_delivery_logs, invoice_audit_log
-- H. Add FK constraints for new FK columns on invoices and invoice_line_items.
-- I. DB triggers:
--      1. Fix prevent_paid_invoice_mutation (total → total_amount + new fields)
--      2. invoice_line_items: block writes on non-draft invoices
--      3. Guard invoice financial fields via recalculation context GUC
--      4. calculate_invoice_totals() RPC function (sets GUC, then updates)
--      5. invoice_audit_log immutability
-- J. RLS policies for all new tables.
-- K. Seed data: billing_categories, tax_jurisdictions, Canadian tax profiles.
--
-- Money convention: INTEGER (cents) throughout, consistent with existing
-- invoices, invoice_line_items, payments, and trust accounting tables.
-- Tax rates stored as NUMERIC(7,6) (e.g., 0.130000 for 13% HST).
-- ============================================================================

-- ============================================================================
-- A. Fix existing bug in migration 102 trigger
--    The column "total" was renamed to "total_amount" in migration 106.
--    The trigger function references NEW.total which no longer exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_paid_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF (
      NEW.total_amount         IS DISTINCT FROM OLD.total_amount         OR
      NEW.amount_paid          IS DISTINCT FROM OLD.amount_paid          OR
      NEW.status               IS DISTINCT FROM OLD.status               OR
      NEW.invoice_number       IS DISTINCT FROM OLD.invoice_number       OR
      NEW.matter_id            IS DISTINCT FROM OLD.matter_id            OR
      NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id            OR
      NEW.issue_date           IS DISTINCT FROM OLD.issue_date           OR
      NEW.due_date             IS DISTINCT FROM OLD.due_date             OR
      NEW.contact_id           IS DISTINCT FROM OLD.contact_id           OR
      -- New billing module financial fields (also immutable on paid)
      NEW.subtotal             IS DISTINCT FROM OLD.subtotal             OR
      NEW.subtotal_fees        IS DISTINCT FROM OLD.subtotal_fees        OR
      NEW.subtotal_disbursements IS DISTINCT FROM OLD.subtotal_disbursements OR
      NEW.subtotal_soft_costs  IS DISTINCT FROM OLD.subtotal_soft_costs  OR
      NEW.subtotal_hard_costs  IS DISTINCT FROM OLD.subtotal_hard_costs  OR
      NEW.total_adjustments    IS DISTINCT FROM OLD.total_adjustments    OR
      NEW.tax_amount           IS DISTINCT FROM OLD.tax_amount           OR
      NEW.taxable_subtotal     IS DISTINCT FROM OLD.taxable_subtotal     OR
      NEW.total_trust_applied  IS DISTINCT FROM OLD.total_trust_applied  OR
      NEW.total_payments_applied IS DISTINCT FROM OLD.total_payments_applied
    ) THEN
      RAISE EXCEPTION
        'Paid invoices are immutable. Use a credit note or reversal for corrections. Invoice: %',
        OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 102; replace the function is sufficient.
-- Re-create trigger to ensure it is attached to the current function.
DROP TRIGGER IF EXISTS trg_invoices_paid_immutable ON invoices;
CREATE TRIGGER trg_invoices_paid_immutable
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_invoice_mutation();

-- ============================================================================
-- B. Extend invoices.status CHECK constraint
-- ============================================================================

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'draft',
    'finalized',
    'sent',
    'viewed',
    'partially_paid',
    'paid',
    'overdue',
    'cancelled',
    'void',
    'written_off'
  ));

-- ============================================================================
-- C. Extend invoices table
-- ============================================================================

-- Billing period
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_period_start DATE,
  ADD COLUMN IF NOT EXISTS billing_period_end   DATE;

-- Template and tax profile (FK constraints added after those tables are created)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS template_id    UUID,
  ADD COLUMN IF NOT EXISTS tax_profile_id UUID;

-- Currency
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'CAD';

-- Category subtotals (cents) — cached, updated by calculate_invoice_totals()
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal_fees            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal_disbursements   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal_soft_costs      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal_hard_costs      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_adjustments        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_subtotal         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_trust_applied      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payments_applied   INTEGER NOT NULL DEFAULT 0;

-- Lifecycle timestamps
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS finalized_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalized_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason   TEXT;

-- Internal memo (not shown on client-facing invoice; separate from notes)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

-- ============================================================================
-- D. Extend invoice_line_items table
-- ============================================================================

-- Category and type
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS line_category TEXT NOT NULL DEFAULT 'fee'
    CHECK (line_category IN ('fee', 'disbursement', 'soft_cost', 'hard_cost')),
  ADD COLUMN IF NOT EXISTS line_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (line_type IN (
      'hourly', 'flat_fee', 'manual_fee',
      'disbursement_external', 'soft_cost_internal', 'hard_cost_direct', 'manual'
    ));

-- Service date and staff attribution
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS date_of_service DATE,
  ADD COLUMN IF NOT EXISTS staff_id        UUID REFERENCES users(id) ON DELETE SET NULL;

-- Tax treatment
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS tax_code_id UUID,      -- FK added after tax_codes table created
  ADD COLUMN IF NOT EXISTS tax_rate    NUMERIC(7,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_taxable  BOOLEAN NOT NULL DEFAULT true;

-- Discounts and net
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount      INTEGER NOT NULL DEFAULT 0;

-- Source tracking
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN (
      'time_entry', 'disbursement_entry', 'soft_cost_entry',
      'hard_cost_entry', 'manual'
    )),
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- Disbursement-specific
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS is_recoverable         BOOLEAN,
  ADD COLUMN IF NOT EXISTS disbursement_category_id UUID,  -- FK added after table created
  ADD COLUMN IF NOT EXISTS receipt_document_id    UUID;

-- Audit
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Soft delete (DRAFT only)
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill net_amount = amount for all existing rows
UPDATE invoice_line_items
SET net_amount = amount
WHERE net_amount = 0 AND amount > 0;

-- ============================================================================
-- E. Extend payments table
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_source TEXT NOT NULL DEFAULT 'direct'
    CHECK (payment_source IN ('direct', 'trust_applied', 'credit_note')),
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- ============================================================================
-- F. New reference tables (system-level, no tenant_id)
-- ============================================================================

-- ── F1. billing_categories ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE
    CHECK (code IN ('fee', 'disbursement', 'soft_cost', 'hard_cost')),
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE billing_categories IS
  'System-level reference table. Immutable. '
  'Defines the four billing line categories used throughout the invoice engine.';

-- No RLS needed — system reference table, publicly readable

-- ── F2. disbursement_categories ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS disbursement_categories (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL tenant_id = system default; non-null = tenant override/addition
  code                     TEXT NOT NULL,
  label                    TEXT NOT NULL,
  default_is_taxable       BOOLEAN NOT NULL DEFAULT true,
  default_is_recoverable   BOOLEAN NOT NULL DEFAULT true,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_categories_code_unique
  ON disbursement_categories (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE INDEX IF NOT EXISTS idx_disbursement_categories_tenant
  ON disbursement_categories (tenant_id);

ALTER TABLE disbursement_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY disbursement_categories_access ON disbursement_categories
  FOR ALL USING (
    tenant_id IS NULL OR
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ── F3. tax_jurisdictions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,  -- e.g. CA-ON, CA-AB, CA-BC, CA-QC, GENERIC
  name         TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CA',
  region_code  TEXT,                  -- ON, AB, BC, QC, etc.
  is_active    BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE tax_jurisdictions IS
  'System-level jurisdiction registry. No tenant_id. Used as FK target for tax_profiles.';

-- ============================================================================
-- G. New tenant-scoped billing tables
-- ============================================================================

-- ── G1. tax_profiles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction_id UUID NOT NULL REFERENCES tax_jurisdictions(id),
  name            TEXT NOT NULL,
  description     TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  effective_from  DATE,
  effective_to    DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_profiles_default_one
  ON tax_profiles (tenant_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_tax_profiles_tenant ON tax_profiles (tenant_id);

ALTER TABLE tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_profiles_tenant_isolation ON tax_profiles
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE TRIGGER set_tax_profiles_updated_at
  BEFORE UPDATE ON tax_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── G2. tax_codes ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_codes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tax_profile_id           UUID NOT NULL REFERENCES tax_profiles(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,   -- HST, GST, PST, QST, EXEMPT, ZERO
  label                    TEXT NOT NULL,   -- Display label printed on invoice
  rate                     NUMERIC(7,6) NOT NULL DEFAULT 0,  -- 0.130000 = 13%
  applies_to_fees          BOOLEAN NOT NULL DEFAULT true,
  applies_to_disbursements BOOLEAN NOT NULL DEFAULT true,
  applies_to_soft_costs    BOOLEAN NOT NULL DEFAULT true,
  applies_to_hard_costs    BOOLEAN NOT NULL DEFAULT true,
  is_default_for_profile   BOOLEAN NOT NULL DEFAULT false,
  is_active                BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_tax_codes_profile ON tax_codes (tax_profile_id);
CREATE INDEX IF NOT EXISTS idx_tax_codes_tenant  ON tax_codes (tenant_id);

ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_codes_tenant_isolation ON tax_codes
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ── G3. tax_registrations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction_id     UUID NOT NULL REFERENCES tax_jurisdictions(id),
  registration_number TEXT NOT NULL,
  registration_type   TEXT NOT NULL,  -- HST, GST, QST, etc.
  effective_from      DATE,
  effective_to        DATE,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_registrations_tenant ON tax_registrations (tenant_id);

ALTER TABLE tax_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_registrations_tenant_isolation ON tax_registrations
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ── G4. invoice_number_sequences ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      INTEGER NOT NULL,
  next_val  BIGINT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, year)
);

ALTER TABLE invoice_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_number_sequences_tenant_isolation ON invoice_number_sequences
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Function: atomically generate next invoice number for a tenant + year
CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_tenant_id UUID,
  p_year      INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO invoice_number_sequences (tenant_id, year, next_val)
  VALUES (p_tenant_id, p_year, 2)
  ON CONFLICT (tenant_id, year)
  DO UPDATE SET next_val = invoice_number_sequences.next_val + 1
  RETURNING next_val - 1 INTO v_next;

  RETURN 'INV-' || p_year::TEXT || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

-- ── G5. invoice_templates ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  template_type           TEXT NOT NULL DEFAULT 'custom'
    CHECK (template_type IN ('firm_default', 'matter_type', 'practice_area', 'custom')),
  matter_type_code        TEXT,
  practice_area_code      TEXT,
  default_tax_profile_id  UUID REFERENCES tax_profiles(id) ON DELETE SET NULL,
  logo_url                TEXT,
  header_html             TEXT,
  footer_html             TEXT,
  payment_instructions    TEXT,
  trust_statement_wording TEXT,
  overdue_wording         TEXT,
  standard_notes          TEXT,
  lawyer_signature_block  TEXT,
  is_default              BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_templates_tenant ON invoice_templates (tenant_id);

ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_templates_tenant_isolation ON invoice_templates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

CREATE TRIGGER set_invoice_templates_updated_at
  BEFORE UPDATE ON invoice_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── G6. invoice_template_soft_cost_rates ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_template_soft_cost_rates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES invoice_templates(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,   -- "Photocopies", "Colour Printing"
  unit_label          TEXT NOT NULL,   -- "per page", "per scan"
  default_rate        INTEGER NOT NULL DEFAULT 0,  -- cents per unit
  default_tax_code_id UUID REFERENCES tax_codes(id) ON DELETE SET NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_soft_cost_rates_template ON invoice_template_soft_cost_rates (template_id);

ALTER TABLE invoice_template_soft_cost_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY soft_cost_rates_tenant_isolation ON invoice_template_soft_cost_rates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- ── G7. discount_approval_thresholds ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discount_approval_thresholds (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threshold_type              TEXT NOT NULL
    CHECK (threshold_type IN ('percentage', 'fixed_amount')),
  threshold_value             NUMERIC(12,4) NOT NULL,
  -- For percentage: 0.15 = 15%. For fixed_amount: cents.
  approver_role               TEXT NOT NULL,
  applies_to_adjustment_types TEXT[] NOT NULL DEFAULT ARRAY['discount','write_down'],
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_thresholds_tenant ON discount_approval_thresholds (tenant_id);

ALTER TABLE discount_approval_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY discount_thresholds_tenant_isolation ON discount_approval_thresholds
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ── G8. invoice_adjustments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id            UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  matter_id             UUID NOT NULL REFERENCES matters(id),
  adjustment_type       TEXT NOT NULL
    CHECK (adjustment_type IN ('discount', 'write_down', 'write_off', 'credit_note')),
  -- discount    = client-facing reduction on current invoice
  -- write_down  = pre-billing internal reduction of billed amount
  -- write_off   = post-billing AR treatment
  -- credit_note = formal credit issued to client
  scope                 TEXT NOT NULL
    CHECK (scope IN ('invoice_level', 'line_level', 'category_level')),
  line_item_id          UUID REFERENCES invoice_line_items(id) ON DELETE SET NULL,
  applies_to_category   TEXT
    CHECK (applies_to_category IS NULL OR
           applies_to_category IN ('fee','disbursement','soft_cost','hard_cost')),
  calculation_type      TEXT NOT NULL
    CHECK (calculation_type IN ('percentage', 'fixed_amount')),
  percentage_value      NUMERIC(7,6),   -- used when calculation_type = 'percentage'
  fixed_amount_cents    INTEGER,        -- used when calculation_type = 'fixed_amount'
  calculated_amount_cents INTEGER NOT NULL DEFAULT 0,  -- always populated
  is_pre_tax            BOOLEAN NOT NULL DEFAULT true,
  reason_code           TEXT NOT NULL,
  reason_note           TEXT,
  applied_by            UUID NOT NULL REFERENCES users(id),
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_status       TEXT NOT NULL DEFAULT 'auto_approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  requires_approval     BOOLEAN NOT NULL DEFAULT false,
  approval_threshold_id UUID REFERENCES discount_approval_thresholds(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice ON invoice_adjustments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_tenant  ON invoice_adjustments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_pending
  ON invoice_adjustments (tenant_id, approval_status)
  WHERE approval_status = 'pending';

ALTER TABLE invoice_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_adjustments_billing_access ON invoice_adjustments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

CREATE TRIGGER set_invoice_adjustments_updated_at
  BEFORE UPDATE ON invoice_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── G9. invoice_trust_allocations ────────────────────────────────────────────
-- Billing module writes this table for allocation requests.
-- Trust module reads it to process and writes back allocation_status.
-- Billing module is PROHIBITED from writing trust_transactions directly.

CREATE TABLE IF NOT EXISTS invoice_trust_allocations (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id                   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  matter_id                    UUID NOT NULL REFERENCES matters(id),
  amount_cents                 BIGINT NOT NULL CHECK (amount_cents > 0),
  trust_account_id             UUID NOT NULL REFERENCES trust_bank_accounts(id),
  trust_transaction_id         UUID REFERENCES trust_transactions(id) ON DELETE SET NULL,
  -- Set by trust module when confirmed; billing reads this to create payments row.
  allocation_status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (allocation_status IN (
      'pending', 'confirmed', 'rejected', 'cancelled', 'reversed'
    )),
  requested_by                 UUID NOT NULL REFERENCES users(id),
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at                 TIMESTAMPTZ,
  confirmed_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_trust_allocations_invoice
  ON invoice_trust_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_trust_allocations_pending
  ON invoice_trust_allocations (tenant_id, allocation_status)
  WHERE allocation_status = 'pending';

ALTER TABLE invoice_trust_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_trust_allocations_billing_access ON invoice_trust_allocations
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

CREATE TRIGGER set_invoice_trust_allocations_updated_at
  BEFORE UPDATE ON invoice_trust_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── G10. invoice_delivery_logs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_delivery_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id            UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  delivery_method       TEXT NOT NULL DEFAULT 'email'
    CHECK (delivery_method IN ('email', 'portal', 'manual')),
  recipient_email       TEXT NOT NULL,
  recipient_name        TEXT,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by               UUID NOT NULL REFERENCES users(id),
  delivery_status       TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent', 'delivered', 'failed', 'viewed')),
  viewed_at             TIMESTAMPTZ,
  message_subject       TEXT,
  message_body_snapshot TEXT,
  comms_message_id      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_delivery_logs_invoice
  ON invoice_delivery_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_delivery_logs_tenant
  ON invoice_delivery_logs (tenant_id);

ALTER TABLE invoice_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_delivery_logs_billing_access ON invoice_delivery_logs
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- ── G11. invoice_audit_log (append-only) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  matter_id         UUID NOT NULL REFERENCES matters(id),
  event_type        TEXT NOT NULL
    CHECK (event_type IN (
      'created', 'draft_saved', 'line_added', 'line_edited', 'line_deleted',
      'adjustment_added', 'adjustment_approved', 'adjustment_rejected',
      'finalized', 'sent', 'resent', 'delivery_failed',
      'payment_recorded', 'payment_voided',
      'trust_applied', 'trust_confirmed', 'trust_rejected', 'trust_cancelled',
      'voided', 'status_changed',
      'pdf_downloaded', 'viewed', 'template_applied'
    )),
  event_description TEXT NOT NULL,
  changed_fields    JSONB,   -- {field: {before: x, after: y}} for edit events
  performed_by      UUID NOT NULL REFERENCES users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address        TEXT,
  user_agent        TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_invoice
  ON invoice_audit_log (invoice_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_tenant
  ON invoice_audit_log (tenant_id, performed_at DESC);

ALTER TABLE invoice_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: billing users can view audit logs for their tenant
CREATE POLICY invoice_audit_log_read ON invoice_audit_log
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- Insert: billing users can append audit events
CREATE POLICY invoice_audit_log_insert ON invoice_audit_log
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND has_billing_view()
  );

-- No UPDATE or DELETE policy → append-only enforced by RLS
-- Trigger below adds DB-level guard for service_role bypass

-- ============================================================================
-- H. FK constraints for new FK columns on invoices and invoice_line_items
-- ============================================================================

ALTER TABLE invoices
  ADD CONSTRAINT invoices_template_id_fk
    FOREIGN KEY (template_id) REFERENCES invoice_templates(id) ON DELETE SET NULL,
  ADD CONSTRAINT invoices_tax_profile_id_fk
    FOREIGN KEY (tax_profile_id) REFERENCES tax_profiles(id) ON DELETE SET NULL;

ALTER TABLE invoice_line_items
  ADD CONSTRAINT invoice_line_items_tax_code_id_fk
    FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  ADD CONSTRAINT invoice_line_items_disbursement_category_id_fk
    FOREIGN KEY (disbursement_category_id) REFERENCES disbursement_categories(id) ON DELETE SET NULL;

-- ============================================================================
-- I. DB Triggers
-- ============================================================================

-- ── I1. invoice_line_items: block all writes when invoice is not draft ────────

CREATE OR REPLACE FUNCTION prevent_line_item_mutation_on_non_draft()
RETURNS TRIGGER AS $$
DECLARE
  inv_status TEXT;
  inv_id     UUID;
BEGIN
  -- Determine which invoice_id to check
  IF TG_OP = 'DELETE' THEN
    inv_id := OLD.invoice_id;
  ELSE
    inv_id := NEW.invoice_id;
  END IF;

  SELECT status INTO inv_status
  FROM invoices
  WHERE id = inv_id;

  IF inv_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'Invoice line items can only be modified on draft invoices. '
      'Invoice % has status: %', inv_id, inv_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_line_items_draft_only ON invoice_line_items;
CREATE TRIGGER trg_line_items_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION prevent_line_item_mutation_on_non_draft();

-- ── I2. Guard invoice financial fields via recalculation context GUC ─────────
--
-- Any direct UPDATE to invoice financial fields is blocked UNLESS the calling
-- session has set: SET LOCAL norvaos.recalculation_context = 'invoice_calculation_service'
-- This is set by the calculate_invoice_totals() function below.

CREATE OR REPLACE FUNCTION guard_invoice_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.subtotal              IS DISTINCT FROM OLD.subtotal              OR
    NEW.subtotal_fees         IS DISTINCT FROM OLD.subtotal_fees         OR
    NEW.subtotal_disbursements IS DISTINCT FROM OLD.subtotal_disbursements OR
    NEW.subtotal_soft_costs   IS DISTINCT FROM OLD.subtotal_soft_costs   OR
    NEW.subtotal_hard_costs   IS DISTINCT FROM OLD.subtotal_hard_costs   OR
    NEW.total_adjustments     IS DISTINCT FROM OLD.total_adjustments     OR
    NEW.tax_amount            IS DISTINCT FROM OLD.tax_amount            OR
    NEW.taxable_subtotal      IS DISTINCT FROM OLD.taxable_subtotal      OR
    NEW.total_amount          IS DISTINCT FROM OLD.total_amount          OR
    NEW.total_trust_applied   IS DISTINCT FROM OLD.total_trust_applied   OR
    NEW.total_payments_applied IS DISTINCT FROM OLD.total_payments_applied OR
    NEW.amount_paid           IS DISTINCT FROM OLD.amount_paid
  ) THEN
    IF current_setting('norvaos.recalculation_context', true)
       IS DISTINCT FROM 'invoice_calculation_service'
    THEN
      RAISE EXCEPTION
        'Direct mutation of invoice financial fields is not permitted. '
        'Use the calculate_invoice_totals() function. Invoice: %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_invoice_financial_fields ON invoices;
CREATE TRIGGER trg_guard_invoice_financial_fields
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_financial_fields();

-- ── I3. calculate_invoice_totals() — the only authorised path to update ───────
--       invoice financial fields. Called by service layer via supabase.rpc().

CREATE OR REPLACE FUNCTION calculate_invoice_totals(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_fees               INTEGER := 0;
  v_disbursements      INTEGER := 0;
  v_soft_costs         INTEGER := 0;
  v_hard_costs         INTEGER := 0;
  v_subtotal           INTEGER := 0;
  v_adjustments        INTEGER := 0;
  v_tax                INTEGER := 0;
  v_taxable_subtotal   INTEGER := 0;
  v_trust_applied      INTEGER := 0;
  v_payments_applied   INTEGER := 0;
  v_total_amount       INTEGER := 0;
  v_amount_paid        INTEGER := 0;
  v_result             JSONB;
BEGIN
  -- Set recalculation context so the guard trigger allows these updates
  PERFORM set_config('norvaos.recalculation_context', 'invoice_calculation_service', true);

  -- Category subtotals from line items (exclude soft-deleted)
  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE line_category = 'fee'),          0),
    COALESCE(SUM(net_amount) FILTER (WHERE line_category = 'disbursement'), 0),
    COALESCE(SUM(net_amount) FILTER (WHERE line_category = 'soft_cost'),    0),
    COALESCE(SUM(net_amount) FILTER (WHERE line_category = 'hard_cost'),    0)
  INTO v_fees, v_disbursements, v_soft_costs, v_hard_costs
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id
    AND deleted_at IS NULL;

  v_subtotal := v_fees + v_disbursements + v_soft_costs + v_hard_costs;

  -- Total approved adjustments
  SELECT COALESCE(SUM(calculated_amount_cents), 0)
  INTO v_adjustments
  FROM invoice_adjustments
  WHERE invoice_id = p_invoice_id
    AND approval_status IN ('approved', 'auto_approved')
    AND adjustment_type IN ('discount', 'write_down', 'credit_note');

  -- Taxable subtotal from line items (exclude soft-deleted, taxable only)
  SELECT COALESCE(SUM(net_amount), 0)
  INTO v_taxable_subtotal
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id
    AND deleted_at IS NULL
    AND is_taxable = true;

  -- Tax from line items
  SELECT COALESCE(SUM(tax_amount), 0)
  INTO v_tax
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id
    AND deleted_at IS NULL;

  -- Total invoice amount
  v_total_amount := v_subtotal - v_adjustments + v_tax;

  -- Trust applied (confirmed allocations only)
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_trust_applied
  FROM invoice_trust_allocations
  WHERE invoice_id = p_invoice_id
    AND allocation_status = 'confirmed';

  -- Payments applied (non-voided direct payments)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_payments_applied
  FROM payments
  WHERE invoice_id = p_invoice_id
    AND voided_at IS NULL
    AND payment_source IN ('direct', 'credit_note');

  -- amount_paid = trust + direct payments (feeds GENERATED-style balance_due calc)
  -- Note: trust is in BIGINT cents, payments are in INTEGER cents
  v_amount_paid := v_trust_applied::INTEGER + v_payments_applied;

  -- Update invoice with recalculated totals
  UPDATE invoices SET
    subtotal_fees            = v_fees,
    subtotal_disbursements   = v_disbursements,
    subtotal_soft_costs      = v_soft_costs,
    subtotal_hard_costs      = v_hard_costs,
    subtotal                 = v_subtotal,
    total_adjustments        = v_adjustments,
    taxable_subtotal         = v_taxable_subtotal,
    tax_amount               = v_tax,
    total_amount             = v_total_amount,
    total_trust_applied      = v_trust_applied::INTEGER,
    total_payments_applied   = v_payments_applied,
    amount_paid              = v_amount_paid,
    updated_at               = now()
  WHERE id = p_invoice_id;

  v_result := jsonb_build_object(
    'invoice_id',            p_invoice_id,
    'subtotal_fees',         v_fees,
    'subtotal_disbursements',v_disbursements,
    'subtotal_soft_costs',   v_soft_costs,
    'subtotal_hard_costs',   v_hard_costs,
    'subtotal',              v_subtotal,
    'total_adjustments',     v_adjustments,
    'taxable_subtotal',      v_taxable_subtotal,
    'tax_amount',            v_tax,
    'total_amount',          v_total_amount,
    'total_trust_applied',   v_trust_applied,
    'total_payments_applied',v_payments_applied,
    'amount_paid',           v_amount_paid,
    'balance_due',           v_total_amount - v_amount_paid
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_invoice_totals(UUID) IS
  'The only authorised path to update invoice financial fields. '
  'Sets the recalculation context GUC before updating. '
  'Call via supabase.rpc(''calculate_invoice_totals'', {p_invoice_id: id}).';

-- ── I4. invoice_audit_log immutability (DB-level guard) ─────────────────────
--       Fires even when RLS is bypassed by service_role.

CREATE OR REPLACE FUNCTION invoice_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'invoice_audit_log is append-only. Modifications and deletions are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_audit_log_no_update ON invoice_audit_log;
CREATE TRIGGER trg_invoice_audit_log_no_update
  BEFORE UPDATE ON invoice_audit_log
  FOR EACH ROW EXECUTE FUNCTION invoice_audit_log_immutable();

DROP TRIGGER IF EXISTS trg_invoice_audit_log_no_delete ON invoice_audit_log;
CREATE TRIGGER trg_invoice_audit_log_no_delete
  BEFORE DELETE ON invoice_audit_log
  FOR EACH ROW EXECUTE FUNCTION invoice_audit_log_immutable();

-- ── I5. Auto-recalculate on payment insert/update ────────────────────────────

CREATE OR REPLACE FUNCTION payments_trigger_invoice_recalculation()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  PERFORM calculate_invoice_totals(v_invoice_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_recalculate ON payments;
CREATE TRIGGER trg_payments_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_trigger_invoice_recalculation();

-- ── I6. Auto-recalculate on trust allocation confirmation ─────────────────────

CREATE OR REPLACE FUNCTION trust_allocation_trigger_recalculation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when allocation_status changes to/from confirmed
  IF (NEW.allocation_status IS DISTINCT FROM OLD.allocation_status) AND
     (NEW.allocation_status = 'confirmed' OR OLD.allocation_status = 'confirmed')
  THEN
    PERFORM calculate_invoice_totals(NEW.invoice_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trust_allocation_recalculate ON invoice_trust_allocations;
CREATE TRIGGER trg_trust_allocation_recalculate
  AFTER UPDATE ON invoice_trust_allocations
  FOR EACH ROW EXECUTE FUNCTION trust_allocation_trigger_recalculation();

-- ── I7. Auto-update invoice status based on balance_due after recalculation ──
--       Runs after calculate_invoice_totals() updates the invoice row.

CREATE OR REPLACE FUNCTION invoices_sync_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Only evaluate when amount_paid or total_amount changes
  IF (NEW.amount_paid IS DISTINCT FROM OLD.amount_paid) OR
     (NEW.total_amount IS DISTINCT FROM OLD.total_amount)
  THEN
    v_balance := NEW.total_amount - NEW.amount_paid;

    -- Only auto-transition from payment-eligible statuses
    IF NEW.status IN ('sent', 'viewed', 'partially_paid', 'overdue') THEN
      IF v_balance <= 0 THEN
        NEW.status := 'paid';
      ELSIF NEW.amount_paid > 0 THEN
        NEW.status := 'partially_paid';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_sync_payment_status ON invoices;
CREATE TRIGGER trg_invoices_sync_payment_status
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_sync_payment_status();

-- ============================================================================
-- J. Indexes on new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_status_tenant
  ON invoices (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_finalized_at
  ON invoices (tenant_id, finalized_at)
  WHERE finalized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_category
  ON invoice_line_items (invoice_id, line_category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_source
  ON invoice_line_items (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_voided
  ON payments (invoice_id, voided_at)
  WHERE voided_at IS NULL;

-- ============================================================================
-- K. Seed data
-- ============================================================================

-- ── K1. billing_categories (system-level, immutable) ─────────────────────────

INSERT INTO billing_categories (code, label, description, sort_order) VALUES
  ('fee',          'Professional Fees',  'Lawyer and staff time billed for professional services', 1),
  ('disbursement', 'Disbursements',      'Third-party costs paid on behalf of the client',         2),
  ('soft_cost',    'Soft Costs',         'Internal office costs billed to the client',             3),
  ('hard_cost',    'Hard Costs',         'Direct matter expenses not classified as professional time', 4)
ON CONFLICT (code) DO NOTHING;

-- ── K2. tax_jurisdictions (system-level) ──────────────────────────────────────

INSERT INTO tax_jurisdictions (code, name, country_code, region_code) VALUES
  ('CA-ON', 'Ontario',           'CA', 'ON'),
  ('CA-AB', 'Alberta',           'CA', 'AB'),
  ('CA-BC', 'British Columbia',  'CA', 'BC'),
  ('CA-QC', 'Quebec',            'CA', 'QC'),
  ('CA-MB', 'Manitoba',          'CA', 'MB'),
  ('CA-SK', 'Saskatchewan',      'CA', 'SK'),
  ('CA-NS', 'Nova Scotia',       'CA', 'NS'),
  ('CA-NB', 'New Brunswick',     'CA', 'NB'),
  ('CA-PE', 'Prince Edward Island', 'CA', 'PE'),
  ('CA-NL', 'Newfoundland and Labrador', 'CA', 'NL'),
  ('CA-NT', 'Northwest Territories', 'CA', 'NT'),
  ('CA-NU', 'Nunavut',           'CA', 'NU'),
  ('CA-YT', 'Yukon',             'CA', 'YT'),
  ('GENERIC', 'Generic / International', 'XX', NULL)
ON CONFLICT (code) DO NOTHING;

-- ── K3. disbursement_categories (system defaults, NULL tenant_id) ─────────────

INSERT INTO disbursement_categories
  (tenant_id, code, label, default_is_taxable, default_is_recoverable)
VALUES
  (NULL, 'court_filing',       'Court Filing Fee',            false, true),
  (NULL, 'process_server',     'Process Server',              false, true),
  (NULL, 'government_fee',     'Government / Registry Fee',   false, true),
  (NULL, 'land_registry',      'Land Registry Fee',           false, true),
  (NULL, 'corporate_search',   'Corporate Search',            true,  true),
  (NULL, 'translation',        'Translation Services',        true,  true),
  (NULL, 'expert_fee',         'Expert / Consultant Fee',     true,  true),
  (NULL, 'courier',            'Courier / Delivery',          true,  true),
  (NULL, 'sheriff_fee',        'Sheriff / Enforcement Fee',   false, true),
  (NULL, 'medical_record',     'Medical Records',             true,  true),
  (NULL, 'other_disbursement', 'Other Disbursement',          true,  true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- END Migration 107
-- ============================================================================
