-- Migration 173: Automated Revenue Engine
-- ==========================================
-- 1. Gapless Matter Number Sequence (NRV-YYYY-NNNNN)
-- 2. Fee Template Auto-Mapper (matter_type → fee_schedule injection)
-- 3. Immutable Retainer Snapshot (frozen at conversion, locked forever)
-- ==========================================

BEGIN;

-- ============================================================
-- PART 1: MATTER NUMBER FACTORY
-- Gapless, collision-proof sequence using a dedicated counter table.
-- Advisory locks prevent concurrent collisions without serializable isolation.
-- ============================================================

-- Counter table: one row per tenant per year
CREATE TABLE IF NOT EXISTS matter_number_sequences (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  year        INTEGER NOT NULL,
  next_val    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, year)
);

-- Enable RLS on the counter table
ALTER TABLE matter_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matter_number_sequences_tenant_isolation" ON matter_number_sequences
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- The core function: returns 'NRV-2026-00001' style, gapless
CREATE OR REPLACE FUNCTION fn_next_matter_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year   INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_seq    INTEGER;
BEGIN
  -- Advisory lock keyed on tenant + year to prevent races
  PERFORM pg_advisory_xact_lock(
    hashtext(p_tenant_id::text || '-matter-seq'),
    v_year
  );

  -- Upsert: increment if exists, insert 1 if not
  INSERT INTO matter_number_sequences (tenant_id, year, next_val)
  VALUES (p_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year)
  DO UPDATE SET next_val = matter_number_sequences.next_val + 1
  RETURNING next_val INTO v_seq;

  RETURN 'NRV-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

COMMENT ON FUNCTION fn_next_matter_number IS 'Gapless, collision-proof matter number generator. Format: NRV-YYYY-NNNNN. Uses advisory locks + upsert.';

-- Backfill: seed the counter from existing matter_numbers so new ones don't collide
INSERT INTO matter_number_sequences (tenant_id, year, next_val)
SELECT
  m.tenant_id,
  EXTRACT(YEAR FROM m.created_at)::INTEGER AS year,
  MAX(
    CASE
      WHEN m.matter_number ~ '^NRV-\d{4}-\d+$'
      THEN NULLIF(SPLIT_PART(m.matter_number, '-', 3), '')::INTEGER
      ELSE 0
    END
  ) + 1 AS next_val
FROM matters m
WHERE m.matter_number IS NOT NULL
  AND m.matter_number ~ '^NRV-\d{4}-\d+$'
GROUP BY m.tenant_id, EXTRACT(YEAR FROM m.created_at)::INTEGER
ON CONFLICT (tenant_id, year)
DO UPDATE SET next_val = GREATEST(matter_number_sequences.next_val, EXCLUDED.next_val);

-- Auto-assign matter_number on INSERT if not provided
CREATE OR REPLACE FUNCTION fn_auto_assign_matter_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.matter_number IS NULL OR NEW.matter_number = '' THEN
    NEW.matter_number := fn_next_matter_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_matter_number ON matters;
CREATE TRIGGER tr_auto_matter_number
  BEFORE INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_matter_number();

-- ============================================================
-- PART 2: FEE TEMPLATE AUTO-MAPPER
-- When a matter is created with a matter_type_id but no fee_template_id,
-- auto-find the default retainer_fee_template for that type
-- and inject the fee_snapshot + totals.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_map_fee_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_prof_total    INTEGER := 0;
  v_govt_total    INTEGER := 0;
  v_disb_total    INTEGER := 0;
  v_subtotal      INTEGER;
  v_tax_rate      NUMERIC;
  v_taxable       INTEGER;
  v_tax_amount    INTEGER;
  v_total         INTEGER;
  v_fee           JSONB;
BEGIN
  -- Only fire if matter has a matter_type_id and no fee_snapshot yet
  IF NEW.matter_type_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.fee_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find default template for this matter type + tenant
  SELECT *
  INTO v_template
  FROM retainer_fee_templates
  WHERE matter_type_id = NEW.matter_type_id
    AND tenant_id = NEW.tenant_id
    AND is_active = true
    AND is_default = true
  LIMIT 1;

  -- If no default, try any active template for this type
  IF v_template IS NULL THEN
    SELECT *
    INTO v_template
    FROM retainer_fee_templates
    WHERE matter_type_id = NEW.matter_type_id
      AND tenant_id = NEW.tenant_id
      AND is_active = true
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  -- No template found  -  nothing to inject
  IF v_template IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum professional fees
  IF v_template.professional_fees IS NOT NULL THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(v_template.professional_fees)
    LOOP
      v_prof_total := v_prof_total + COALESCE(
        (v_fee->>'amount_cents')::INTEGER,
        COALESCE((v_fee->>'quantity')::INTEGER, 1) * COALESCE((v_fee->>'unitPrice')::INTEGER, 0),
        0
      );
    END LOOP;
  END IF;

  -- Sum government fees
  IF v_template.government_fees IS NOT NULL THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(v_template.government_fees)
    LOOP
      v_govt_total := v_govt_total + COALESCE((v_fee->>'amount_cents')::INTEGER, 0);
    END LOOP;
  END IF;

  -- Sum disbursements
  IF v_template.disbursements IS NOT NULL THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(v_template.disbursements)
    LOOP
      v_disb_total := v_disb_total + COALESCE((v_fee->>'amount_cents')::INTEGER, 0);
    END LOOP;
  END IF;

  -- Tax calculation: govt fees are exempt
  v_taxable    := v_prof_total + v_disb_total;
  v_tax_rate   := COALESCE(NEW.tax_rate, 0);
  v_tax_amount := ROUND(v_taxable * v_tax_rate)::INTEGER;
  v_subtotal   := v_prof_total + v_govt_total + v_disb_total;
  v_total      := v_subtotal + v_tax_amount;

  -- Inject the snapshot
  NEW.fee_snapshot := jsonb_build_object(
    'template_id',       v_template.id,
    'template_name',     v_template.name,
    'professional_fees', COALESCE(v_template.professional_fees, '[]'::jsonb),
    'government_fees',   COALESCE(v_template.government_fees, '[]'::jsonb),
    'disbursements',     COALESCE(v_template.disbursements, '[]'::jsonb),
    'hst_applicable',    v_template.hst_applicable,
    'billing_type',      v_template.billing_type,
    'person_scope',      v_template.person_scope,
    'snapshotted_at',    NOW()::TEXT
  );
  NEW.fee_template_id    := v_template.id;
  NEW.subtotal_cents     := v_subtotal;
  NEW.tax_amount_cents   := v_tax_amount;
  NEW.total_amount_cents := v_total;
  NEW.billing_type       := COALESCE(NEW.billing_type, v_template.billing_type, 'flat_fee');

  -- If estimated_value not set, use total in dollars
  IF NEW.estimated_value IS NULL OR NEW.estimated_value = 0 THEN
    NEW.estimated_value := v_total / 100.0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_map_fee_template ON matters;
CREATE TRIGGER tr_auto_map_fee_template
  BEFORE INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_map_fee_template();

COMMENT ON FUNCTION fn_auto_map_fee_template IS 'Auto-injects fee_snapshot from default retainer_fee_template when a matter is created with a matter_type_id but no explicit fee_template_id.';

-- ============================================================
-- PART 3: IMMUTABLE RETAINER SNAPSHOT
-- When a lead is converted, freeze the lead_retainer_packages
-- into a retainer_agreement on the new matter.
-- Then LOCK it: retainer_agreements with source='conversion_snapshot'
-- cannot be updated or deleted.
-- ============================================================

-- Add snapshot metadata columns to retainer_agreements
ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES leads(id);
ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS source_package_id UUID;
ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

COMMENT ON COLUMN retainer_agreements.source IS 'Origin: manual | conversion_snapshot | template';
COMMENT ON COLUMN retainer_agreements.is_locked IS 'When true, row is immutable. Set automatically for conversion snapshots.';

-- The conversion snapshot function:
-- Runs when lead_retainer_packages.lead_id matches a lead being converted
-- and a matter exists (set by intake bridge: leads.converted_matter_id)
CREATE OR REPLACE FUNCTION fn_snapshot_retainer_on_conversion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_package      RECORD;
  v_matter_id    UUID;
  v_fee_schedule JSONB := '[]'::jsonb;
  v_item         JSONB;
  v_agreement_id UUID;
BEGIN
  -- Only fire when lead status changes to 'converted'
  IF NEW.status <> 'converted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'converted' THEN
    RETURN NEW; -- Already converted, skip
  END IF;

  v_matter_id := NEW.converted_matter_id;
  IF v_matter_id IS NULL THEN
    RETURN NEW;  -- No matter linked yet
  END IF;

  -- Find the retainer package for this lead
  SELECT * INTO v_package
  FROM lead_retainer_packages
  WHERE lead_id = NEW.id
    AND tenant_id = NEW.tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- No package → nothing to snapshot
  IF v_package IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build fee_schedule from the package's line_items or fee arrays
  -- Professional fees → fee_schedule entries
  IF v_package.line_items IS NOT NULL AND jsonb_array_length(v_package.line_items) > 0 THEN
    v_fee_schedule := v_package.line_items;
  ELSE
    -- Reconstruct from professional_fees + government_fees + disbursements
    IF v_package.government_fees IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_package.government_fees)
      LOOP
        v_fee_schedule := v_fee_schedule || jsonb_build_array(
          jsonb_build_object(
            'description', COALESCE(v_item->>'description', 'Government Fee'),
            'amount',      COALESCE((v_item->>'amount_cents')::NUMERIC / 100, 0),
            'quantity',    1,
            'category',    'government_fee',
            'frozen',      true
          )
        );
      END LOOP;
    END IF;
  END IF;

  -- Check if a conversion snapshot already exists for this matter
  SELECT id INTO v_agreement_id
  FROM retainer_agreements
  WHERE matter_id = v_matter_id
    AND source = 'conversion_snapshot'
  LIMIT 1;

  IF v_agreement_id IS NOT NULL THEN
    RETURN NEW;  -- Already snapshotted
  END IF;

  -- Create the immutable retainer agreement
  INSERT INTO retainer_agreements (
    tenant_id,
    matter_id,
    billing_type,
    flat_fee_amount,
    fee_schedule,
    hst_applicable,
    hst_rate,
    subtotal_cents,
    tax_amount_cents,
    total_amount_cents,
    signing_method,
    status,
    signed_at,
    matter_auto_created,
    stage_advanced,
    source,
    source_lead_id,
    source_package_id,
    is_locked,
    locked_at
  ) VALUES (
    NEW.tenant_id,
    v_matter_id,
    COALESCE(v_package.billing_type, 'flat_fee'),
    COALESCE(v_package.subtotal_cents, 0) / 100.0,
    v_fee_schedule,
    COALESCE(v_package.hst_applicable, true),
    0.13,  -- Ontario HST default
    COALESCE(v_package.subtotal_cents, 0),
    COALESCE(v_package.tax_amount_cents, 0),
    COALESCE(v_package.total_amount_cents, 0),
    COALESCE(v_package.signing_method, 'manual'),
    CASE
      WHEN v_package.signed_at IS NOT NULL THEN 'signed'
      ELSE 'draft'
    END,
    v_package.signed_at,
    true,
    false,
    'conversion_snapshot',
    NEW.id,
    v_package.id,
    true,                   -- LOCKED from birth
    NOW()
  );

  -- Audit the snapshot
  INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, source, severity, changes)
  VALUES (
    NEW.tenant_id,
    NULL,
    'retainer_agreement',
    v_matter_id,
    'conversion_snapshot',
    'engine:revenue',
    'info',
    jsonb_build_object(
      'lead_id',        NEW.id,
      'package_id',     v_package.id,
      'total_cents',    COALESCE(v_package.total_amount_cents, 0),
      'billing_type',   COALESCE(v_package.billing_type, 'flat_fee'),
      'signed_at',      v_package.signed_at,
      'locked',         true
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_snapshot_retainer_on_conversion ON leads;
CREATE TRIGGER tr_snapshot_retainer_on_conversion
  BEFORE UPDATE OF status ON leads
  FOR EACH ROW
  WHEN (NEW.status = 'converted')
  EXECUTE FUNCTION fn_snapshot_retainer_on_conversion();

COMMENT ON FUNCTION fn_snapshot_retainer_on_conversion IS 'Freezes lead_retainer_packages into an immutable retainer_agreement when a lead is converted. The agreement is locked from birth.';

-- ============================================================
-- THE MOAT: Prevent mutation of locked retainer agreements
-- ============================================================

CREATE OR REPLACE FUNCTION fn_prevent_locked_retainer_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked = true THEN
      RAISE EXCEPTION 'Cannot delete a locked retainer agreement (id: %). Conversion snapshots are immutable.', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_locked = true THEN
      -- Allow ONLY status changes (draft → sent_for_signing → signed)
      -- and signed_at / sent_at timestamps. Everything else is frozen.
      IF NEW.fee_schedule IS DISTINCT FROM OLD.fee_schedule
        OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
        OR NEW.tax_amount_cents IS DISTINCT FROM OLD.tax_amount_cents
        OR NEW.total_amount_cents IS DISTINCT FROM OLD.total_amount_cents
        OR NEW.flat_fee_amount IS DISTINCT FROM OLD.flat_fee_amount
        OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
        OR NEW.hst_rate IS DISTINCT FROM OLD.hst_rate
        OR NEW.billing_type IS DISTINCT FROM OLD.billing_type
        OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
        OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
        OR NEW.source IS DISTINCT FROM OLD.source
      THEN
        RAISE EXCEPTION 'Cannot modify financial fields on locked retainer agreement (id: %). Only status/signing updates are allowed.', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_locked_retainer_mutation ON retainer_agreements;
CREATE TRIGGER tr_prevent_locked_retainer_mutation
  BEFORE UPDATE OR DELETE ON retainer_agreements
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_locked_retainer_mutation();

COMMENT ON FUNCTION fn_prevent_locked_retainer_mutation IS 'THE MOAT: Prevents mutation of financial fields on locked retainer agreements. Status/signing transitions are allowed.';

-- ============================================================
-- PART 4: Audit trail for fee auto-mapping
-- ============================================================

CREATE OR REPLACE FUNCTION fn_audit_fee_auto_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire if fee_snapshot was just populated by the auto-mapper
  IF NEW.fee_snapshot IS NOT NULL AND (OLD IS NULL OR OLD.fee_snapshot IS NULL) THEN
    INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, source, severity, changes)
    VALUES (
      NEW.tenant_id,
      NULL,
      'matter',
      NEW.id,
      'fee_auto_mapped',
      'engine:revenue',
      'info',
      jsonb_build_object(
        'template_id',      NEW.fee_snapshot->>'template_id',
        'template_name',    NEW.fee_snapshot->>'template_name',
        'subtotal_cents',   NEW.subtotal_cents,
        'tax_amount_cents', NEW.tax_amount_cents,
        'total_cents',      NEW.total_amount_cents,
        'billing_type',     NEW.billing_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_fee_auto_map ON matters;
CREATE TRIGGER tr_audit_fee_auto_map
  AFTER INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_fee_auto_map();

COMMENT ON FUNCTION fn_audit_fee_auto_map IS 'Audit trail for auto-mapped fee templates on matter creation.';

COMMIT;
