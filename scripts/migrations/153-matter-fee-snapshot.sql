-- Migration 153: Add fee snapshot to matters table
-- Stores a frozen copy of the fee template at matter creation time
-- Template changes won't affect existing matters

ALTER TABLE matters ADD COLUMN IF NOT EXISTS fee_snapshot JSONB;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS applicant_location TEXT DEFAULT 'inside_canada';
ALTER TABLE matters ADD COLUMN IF NOT EXISTS client_province TEXT;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(6,4) DEFAULT 0;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS tax_label TEXT DEFAULT 'HST';
ALTER TABLE matters ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER;

COMMENT ON COLUMN matters.fee_snapshot IS 'Frozen copy of fee template at creation. Structure: { professional_fees: [], government_fees: [], disbursements: [], template_name: string, template_id: uuid }';
COMMENT ON COLUMN matters.applicant_location IS 'inside_canada or outside_canada - determines tax treatment';
COMMENT ON COLUMN matters.client_province IS 'ISO province code (ON, BC, etc) for tax rate lookup';
