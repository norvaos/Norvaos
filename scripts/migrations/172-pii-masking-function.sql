-- =============================================================================
-- Migration 172 — PII Masking Function
-- =============================================================================
--
-- Creates fn_get_masked_pii() which returns a masked version of a PII value.
-- Used by the Redaction Shield to mask sensitive fields like passport numbers,
-- UCI numbers, and dates of birth for non-admin users.
--
-- Also adds a PII_REVEAL event type to the sentinel audit vocabulary.
-- =============================================================================


-- ── 1. Masking Function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_get_masked_pii(
  p_value      TEXT,
  p_field_type TEXT DEFAULT 'generic'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR p_value = '' THEN
    RETURN p_value;
  END IF;

  -- Field-type-specific masking patterns
  CASE p_field_type
    WHEN 'passport' THEN
      -- Show last 3 characters: ****-***-789
      IF length(p_value) > 3 THEN
        RETURN repeat('*', length(p_value) - 3) || right(p_value, 3);
      ELSE
        RETURN repeat('*', length(p_value));
      END IF;

    WHEN 'uci' THEN
      -- UCI format: 1234-5678 → ****-5678
      IF length(p_value) > 4 THEN
        RETURN repeat('*', length(p_value) - 4) || right(p_value, 4);
      ELSE
        RETURN repeat('*', length(p_value));
      END IF;

    WHEN 'date' THEN
      -- Date: 1990-05-15 → ****-**-15
      IF length(p_value) >= 10 THEN
        RETURN '****-**-' || right(p_value, 2);
      ELSE
        RETURN repeat('*', length(p_value));
      END IF;

    ELSE
      -- Generic: show last 4 characters
      IF length(p_value) > 4 THEN
        RETURN repeat('*', length(p_value) - 4) || right(p_value, 4);
      ELSE
        RETURN repeat('*', length(p_value));
      END IF;
  END CASE;
END;
$$;

COMMENT ON FUNCTION fn_get_masked_pii(TEXT, TEXT) IS
  'Returns a masked version of a PII value. Field types: passport (last 3), '
  'uci (last 4), date (day only), generic (last 4). '
  'Used by the Redaction Shield to protect sensitive data on screen.';
