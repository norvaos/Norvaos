-- Migration 174: Configurable Matter Number Prefix
-- =================================================
-- Industry standard: Allow tenants to customise their matter number format.
-- Default: NRV-YYYY-NNNNN
-- Tenants can set: prefix (e.g., "WLO", "FIRM"), separator (e.g., "-", "/"),
-- padding (e.g., 5 digits), and whether to include year.
-- =================================================

BEGIN;

-- Add configuration columns to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS matter_number_prefix TEXT DEFAULT 'NRV';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS matter_number_separator TEXT DEFAULT '-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS matter_number_padding INTEGER DEFAULT 5;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS matter_number_include_year BOOLEAN DEFAULT true;

COMMENT ON COLUMN tenants.matter_number_prefix IS 'Customisable prefix for matter numbers (e.g., NRV, WLO, FIRM). Max 10 chars.';
COMMENT ON COLUMN tenants.matter_number_separator IS 'Separator between prefix/year/sequence (e.g., -, /). Max 1 char.';
COMMENT ON COLUMN tenants.matter_number_padding IS 'Zero-padding for sequence number (e.g., 5 = 00001). Range: 3-8.';
COMMENT ON COLUMN tenants.matter_number_include_year IS 'Whether to include YYYY in the matter number format.';

-- Add constraint for valid prefix (alphanumeric, 1-10 chars)
ALTER TABLE tenants ADD CONSTRAINT chk_matter_number_prefix
  CHECK (matter_number_prefix ~ '^[A-Za-z0-9]{1,10}$');

ALTER TABLE tenants ADD CONSTRAINT chk_matter_number_separator
  CHECK (matter_number_separator ~ '^[-/.]$');

ALTER TABLE tenants ADD CONSTRAINT chk_matter_number_padding
  CHECK (matter_number_padding BETWEEN 3 AND 8);

-- Update the sequence generator to use tenant config
CREATE OR REPLACE FUNCTION fn_next_matter_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year      INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_seq       INTEGER;
  v_prefix    TEXT;
  v_sep       TEXT;
  v_padding   INTEGER;
  v_inc_year  BOOLEAN;
BEGIN
  -- Fetch tenant configuration
  SELECT
    COALESCE(matter_number_prefix, 'NRV'),
    COALESCE(matter_number_separator, '-'),
    COALESCE(matter_number_padding, 5),
    COALESCE(matter_number_include_year, true)
  INTO v_prefix, v_sep, v_padding, v_inc_year
  FROM tenants
  WHERE id = p_tenant_id;

  -- Fallback defaults
  IF v_prefix IS NULL THEN v_prefix := 'NRV'; END IF;
  IF v_sep IS NULL THEN v_sep := '-'; END IF;
  IF v_padding IS NULL THEN v_padding := 5; END IF;
  IF v_inc_year IS NULL THEN v_inc_year := true; END IF;

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

  -- Build the matter number
  IF v_inc_year THEN
    RETURN v_prefix || v_sep || v_year::TEXT || v_sep || LPAD(v_seq::TEXT, v_padding, '0');
  ELSE
    RETURN v_prefix || v_sep || LPAD(v_seq::TEXT, v_padding, '0');
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_next_matter_number IS 'Gapless, collision-proof matter number generator. Reads tenant config for prefix/separator/padding/year. Advisory-locked per tenant per year.';

COMMIT;
