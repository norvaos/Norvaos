-- Migration 212: Sovereign Naming Architect
-- ============================================
-- Extends the matter naming system (migration 174) to support full
-- template-based naming with client, type, date, and random tokens.
-- Backward-compatible: when matter_naming_template IS NULL, legacy
-- prefix/sep/year/padding logic is preserved unchanged.
--
-- Tokens: {YYYY}, {YY}, {MM}, {PREFIX}, {CLIENT_LAST}, {TYPE_CODE},
--         {INC_NUM}, {RANDOM_HEX}, {SEP}
-- ============================================

BEGIN;

-- ============================================================
-- PART 1: Add template column to tenants
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS matter_naming_template TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.matter_naming_template IS
  'Sovereign Naming template. Tokens: {YYYY}, {YY}, {MM}, {PREFIX}, {CLIENT_LAST}, {TYPE_CODE}, {INC_NUM}, {RANDOM_HEX}. NULL = legacy format.';

-- ============================================================
-- PART 2: Replace fn_next_matter_number with template support
-- ============================================================

CREATE OR REPLACE FUNCTION fn_next_matter_number(
  p_tenant_id   UUID,
  p_client_last TEXT DEFAULT NULL,
  p_type_code   TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year       INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month      TEXT    := LPAD(EXTRACT(MONTH FROM NOW())::TEXT, 2, '0');
  v_seq        INTEGER;
  v_prefix     TEXT;
  v_sep        TEXT;
  v_padding    INTEGER;
  v_inc_year   BOOLEAN;
  v_template   TEXT;
  v_result     TEXT;
BEGIN
  -- Fetch tenant configuration
  SELECT
    COALESCE(matter_number_prefix, 'NRV'),
    COALESCE(matter_number_separator, '-'),
    COALESCE(matter_number_padding, 5),
    COALESCE(matter_number_include_year, true),
    matter_naming_template
  INTO v_prefix, v_sep, v_padding, v_inc_year, v_template
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

  -- --------------------------------------------------------
  -- TEMPLATE MODE: parse tokens and build the matter number
  -- --------------------------------------------------------
  IF v_template IS NOT NULL THEN
    v_result := v_template;

    v_result := REPLACE(v_result, '{YYYY}',       v_year::TEXT);
    v_result := REPLACE(v_result, '{YY}',         RIGHT(v_year::TEXT, 2));
    v_result := REPLACE(v_result, '{MM}',         v_month);
    v_result := REPLACE(v_result, '{PREFIX}',     v_prefix);
    v_result := REPLACE(v_result, '{CLIENT_LAST}', UPPER(COALESCE(p_client_last, 'UNNAMED')));
    v_result := REPLACE(v_result, '{TYPE_CODE}',  UPPER(COALESCE(p_type_code, 'GEN')));
    v_result := REPLACE(v_result, '{INC_NUM}',    LPAD(v_seq::TEXT, v_padding, '0'));
    v_result := REPLACE(v_result, '{RANDOM_HEX}', UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4)));
    v_result := REPLACE(v_result, '{SEP}',        v_sep);

    RETURN v_result;
  END IF;

  -- --------------------------------------------------------
  -- LEGACY MODE: prefix-year-seq (unchanged from migration 174)
  -- --------------------------------------------------------
  IF v_inc_year THEN
    RETURN v_prefix || v_sep || v_year::TEXT || v_sep || LPAD(v_seq::TEXT, v_padding, '0');
  ELSE
    RETURN v_prefix || v_sep || LPAD(v_seq::TEXT, v_padding, '0');
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_next_matter_number IS
  'Gapless, collision-proof matter number generator. Supports template mode (Sovereign Naming) and legacy prefix/year/seq mode. Advisory-locked per tenant per year.';

-- ============================================================
-- PART 3: Update trigger to pass client_last and type_code
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_assign_matter_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_last TEXT := NULL;
  v_type_code   TEXT := NULL;
BEGIN
  IF NEW.matter_number IS NULL OR NEW.matter_number = '' THEN
    -- Attempt to resolve client last name from the primary contact
    -- on the matter_contacts junction (may not exist yet at INSERT time,
    -- so we also check contacts directly via the originating lead).
    -- Note: matter_contacts rows are typically created AFTER the matter,
    -- so this lookup is best-effort for the trigger. The UI should
    -- prefer fn_preview_matter_number for accurate previews.
    BEGIN
      SELECT c.last_name INTO v_client_last
      FROM matter_contacts mc
      JOIN contacts c ON c.id = mc.contact_id
      WHERE mc.matter_id = NEW.id
        AND mc.is_primary = true
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_client_last := NULL;
    END;

    -- Resolve type_code from matter_types.name (first 3 uppercase chars)
    IF NEW.matter_type_id IS NOT NULL THEN
      BEGIN
        SELECT UPPER(LEFT(mt.name, 3)) INTO v_type_code
        FROM matter_types mt
        WHERE mt.id = NEW.matter_type_id;
      EXCEPTION WHEN OTHERS THEN
        v_type_code := NULL;
      END;
    END IF;

    NEW.matter_number := fn_next_matter_number(
      NEW.tenant_id,
      v_client_last,
      v_type_code
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_auto_assign_matter_number IS
  'BEFORE INSERT trigger on matters. Resolves client last name and type code, then delegates to fn_next_matter_number for Sovereign Naming or legacy format.';

-- Recreate the trigger (idempotent)
DROP TRIGGER IF EXISTS tr_auto_matter_number ON matters;
CREATE TRIGGER tr_auto_matter_number
  BEFORE INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_matter_number();

-- ============================================================
-- PART 4: Preview function (non-incrementing peek)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_preview_matter_number(
  p_tenant_id   UUID,
  p_client_last TEXT DEFAULT NULL,
  p_type_code   TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_year       INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month      TEXT    := LPAD(EXTRACT(MONTH FROM NOW())::TEXT, 2, '0');
  v_next_val   INTEGER;
  v_prefix     TEXT;
  v_sep        TEXT;
  v_padding    INTEGER;
  v_inc_year   BOOLEAN;
  v_template   TEXT;
  v_result     TEXT;
BEGIN
  -- Fetch tenant configuration
  SELECT
    COALESCE(matter_number_prefix, 'NRV'),
    COALESCE(matter_number_separator, '-'),
    COALESCE(matter_number_padding, 5),
    COALESCE(matter_number_include_year, true),
    matter_naming_template
  INTO v_prefix, v_sep, v_padding, v_inc_year, v_template
  FROM tenants
  WHERE id = p_tenant_id;

  -- Fallback defaults
  IF v_prefix IS NULL THEN v_prefix := 'NRV'; END IF;
  IF v_sep IS NULL THEN v_sep := '-'; END IF;
  IF v_padding IS NULL THEN v_padding := 5; END IF;
  IF v_inc_year IS NULL THEN v_inc_year := true; END IF;

  -- Peek at the next sequence value WITHOUT incrementing
  SELECT COALESCE(ms.next_val, 1) INTO v_next_val
  FROM matter_number_sequences ms
  WHERE ms.tenant_id = p_tenant_id
    AND ms.year = v_year;

  -- If no row exists yet, next value would be 1
  IF v_next_val IS NULL THEN
    v_next_val := 1;
  END IF;

  -- --------------------------------------------------------
  -- TEMPLATE MODE
  -- --------------------------------------------------------
  IF v_template IS NOT NULL THEN
    v_result := v_template;

    v_result := REPLACE(v_result, '{YYYY}',       v_year::TEXT);
    v_result := REPLACE(v_result, '{YY}',         RIGHT(v_year::TEXT, 2));
    v_result := REPLACE(v_result, '{MM}',         v_month);
    v_result := REPLACE(v_result, '{PREFIX}',     v_prefix);
    v_result := REPLACE(v_result, '{CLIENT_LAST}', UPPER(COALESCE(p_client_last, 'UNNAMED')));
    v_result := REPLACE(v_result, '{TYPE_CODE}',  UPPER(COALESCE(p_type_code, 'GEN')));
    v_result := REPLACE(v_result, '{INC_NUM}',    LPAD(v_next_val::TEXT, v_padding, '0'));
    v_result := REPLACE(v_result, '{RANDOM_HEX}', '____');  -- placeholder; random differs each call
    v_result := REPLACE(v_result, '{SEP}',        v_sep);

    RETURN v_result;
  END IF;

  -- --------------------------------------------------------
  -- LEGACY MODE
  -- --------------------------------------------------------
  IF v_inc_year THEN
    RETURN v_prefix || v_sep || v_year::TEXT || v_sep || LPAD(v_next_val::TEXT, v_padding, '0');
  ELSE
    RETURN v_prefix || v_sep || LPAD(v_next_val::TEXT, v_padding, '0');
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_preview_matter_number IS
  'Non-incrementing preview of the next matter number. For live UI previews. {RANDOM_HEX} shown as ____ since it changes per call.';

COMMIT;
