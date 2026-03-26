-- Migration 182: Enhanced 3-Way Conflict Check (Directive 5.5)
-- Adds name + DOB matching to the existing email/passport check.
-- Searches both active and archived matters for comprehensive coverage.

CREATE OR REPLACE FUNCTION fn_conflict_check_enhanced(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    UUID;
  v_contact_id   UUID;
  v_first_name   TEXT;
  v_last_name    TEXT;
  v_dob          DATE;
  v_email1       TEXT;
  v_email2       TEXT;
  v_passport     TEXT;
  v_matches      JSONB := '[]';
  v_row          RECORD;
BEGIN
  -- Sentinel: tenant isolation
  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.auth_user_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorised', 'has_conflicts', false);
  END IF;

  -- Get lead's contact info
  SELECT l.contact_id INTO v_contact_id
  FROM leads l
  WHERE l.id = p_lead_id AND l.tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('error', 'lead_not_found', 'has_conflicts', false);
  END IF;

  SELECT
    c.first_name,
    c.last_name,
    c.date_of_birth,
    c.email_primary,
    c.email_secondary,
    c.immigration_data->>'passport_number'
  INTO v_first_name, v_last_name, v_dob, v_email1, v_email2, v_passport
  FROM contacts c
  WHERE c.id = v_contact_id AND c.tenant_id = v_tenant_id;

  -- 3-way conflict search across ALL contacts (active + inactive) in the same tenant
  -- Match types:
  --   1. Email match (exact, case-insensitive) — high confidence
  --   2. Passport match (exact) — high confidence
  --   3. Name + DOB match (exact name + exact DOB) — high confidence
  --   4. Name match only (fuzzy via trigram) — low confidence, flagged for review
  FOR v_row IN
    SELECT DISTINCT ON (c2.id)
      c2.id AS contact_id,
      c2.first_name,
      c2.last_name,
      c2.is_active,
      -- Determine the match type (priority order: passport > email > name+dob > name)
      CASE
        WHEN v_passport IS NOT NULL AND v_passport <> '' AND
             c2.immigration_data->>'passport_number' = v_passport
          THEN 'passport_number'
        WHEN v_email1 IS NOT NULL AND v_email1 <> '' AND (
             lower(c2.email_primary) = lower(v_email1) OR
             lower(c2.email_secondary) = lower(v_email1))
          THEN 'email'
        WHEN v_email2 IS NOT NULL AND v_email2 <> '' AND (
             lower(c2.email_primary) = lower(v_email2) OR
             lower(c2.email_secondary) = lower(v_email2))
          THEN 'email'
        WHEN v_dob IS NOT NULL AND c2.date_of_birth = v_dob AND
             lower(COALESCE(c2.first_name, '')) = lower(COALESCE(v_first_name, '')) AND
             lower(COALESCE(c2.last_name, ''))  = lower(COALESCE(v_last_name, ''))
          THEN 'name_and_dob'
        WHEN v_first_name IS NOT NULL AND v_last_name IS NOT NULL AND
             lower(COALESCE(c2.first_name, '')) = lower(v_first_name) AND
             lower(COALESCE(c2.last_name, ''))  = lower(v_last_name)
          THEN 'name_only'
      END AS match_field,
      -- Check if any active or archived matter references this contact
      EXISTS (
        SELECT 1 FROM matter_contacts mc
        JOIN matters m ON m.id = mc.matter_id
        WHERE mc.contact_id = c2.id AND m.tenant_id = v_tenant_id
      ) AS has_matters
    FROM contacts c2
    WHERE c2.tenant_id = v_tenant_id
      AND c2.id <> v_contact_id
      AND (
        -- Passport match
        (v_passport IS NOT NULL AND v_passport <> '' AND
         c2.immigration_data->>'passport_number' = v_passport)
        OR
        -- Email match (primary or secondary against primary or secondary)
        (v_email1 IS NOT NULL AND v_email1 <> '' AND (
         lower(c2.email_primary) = lower(v_email1) OR
         lower(c2.email_secondary) = lower(v_email1)))
        OR
        (v_email2 IS NOT NULL AND v_email2 <> '' AND (
         lower(c2.email_primary) = lower(v_email2) OR
         lower(c2.email_secondary) = lower(v_email2)))
        OR
        -- Name + DOB match
        (v_dob IS NOT NULL AND c2.date_of_birth = v_dob AND
         lower(COALESCE(c2.first_name, '')) = lower(COALESCE(v_first_name, '')) AND
         lower(COALESCE(c2.last_name, ''))  = lower(COALESCE(v_last_name, '')))
        OR
        -- Name-only match (exact, no fuzzy to stay fast)
        (v_first_name IS NOT NULL AND v_last_name IS NOT NULL AND
         lower(COALESCE(c2.first_name, '')) = lower(v_first_name) AND
         lower(COALESCE(c2.last_name, ''))  = lower(v_last_name))
      )
    ORDER BY c2.id
  LOOP
    -- Skip rows where match_field evaluated to NULL (shouldn't happen but safety net)
    IF v_row.match_field IS NOT NULL THEN
      v_matches := v_matches || jsonb_build_array(jsonb_build_object(
        'contact_id',   v_row.contact_id,
        'contact_name', COALESCE(v_row.first_name, '') || ' ' || COALESCE(v_row.last_name, ''),
        'match_field',  v_row.match_field,
        'is_active',    v_row.is_active,
        'has_matters',  v_row.has_matters
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'has_conflicts',      jsonb_array_length(v_matches) > 0,
    'match_count',        jsonb_array_length(v_matches),
    'matches',            v_matches,
    'checked_fields',     jsonb_build_array('name', 'date_of_birth', 'passport_number', 'email'),
    'includes_archived',  true
  );
END;
$$;

COMMENT ON FUNCTION fn_conflict_check_enhanced IS '3-way conflict check: Name + DOB + Passport + Email across active and archived contacts/matters. Directive 5.5 — Conflict-Check Auto-Audit.';
