-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 204: Global Conflict Engine — Directive 005.2
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates:
--   1. search_contacts_fuzzy()      — pg_trgm fuzzy name search on contacts
--   2. search_leads_fuzzy()         — pg_trgm fuzzy name search on leads (via contacts)
--   3. search_matters_by_party()    — fuzzy party search across matter_contacts
--   4. fn_global_conflict_scan()    — comprehensive cross-entity conflict scan
--   5. GIN trigram indexes on leads (via contacts join — indexes on contacts already exist)
--   6. global_conflict_results      — persists scan results
--
-- Prereqs: pg_trgm extension enabled (migration 069), GIN indexes on contacts (existing)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. search_contacts_fuzzy — the missing RPC that conflict-engine.ts calls
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_contacts_fuzzy(
  p_tenant_id UUID,
  p_exclude_id UUID,
  p_search_name TEXT,
  p_threshold REAL DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT c.id, c.first_name, c.last_name,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name))
           ) AS similarity
    FROM contacts c
    WHERE c.tenant_id = p_tenant_id
      AND c.id != p_exclude_id
      AND c.is_archived = false
      AND (
        similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)) > p_threshold
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name)) > p_threshold
      )
    ORDER BY similarity DESC
    LIMIT 20;
END;
$$;

COMMENT ON FUNCTION search_contacts_fuzzy IS 'Directive 005.2: Fuzzy name search on contacts using pg_trgm similarity. Tenant-isolated. Returns top 20 matches above threshold.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. search_leads_fuzzy — fuzzy search leads via their linked contact record
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_leads_fuzzy(
  p_tenant_id UUID,
  p_search_name TEXT,
  p_threshold REAL DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT l.id,
           c.first_name,
           c.last_name,
           c.email_primary AS email,
           c.phone_primary AS phone,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name))
           ) AS similarity
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    WHERE l.tenant_id = p_tenant_id
      AND l.is_closed = false
      AND c.is_archived = false
      AND (
        similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)) > p_threshold
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name)) > p_threshold
      )
    ORDER BY similarity DESC
    LIMIT 20;
END;
$$;

COMMENT ON FUNCTION search_leads_fuzzy IS 'Directive 005.2: Fuzzy name search on leads via linked contacts using pg_trgm. Tenant-isolated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. search_matters_by_party — search matters by party name via matter_contacts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_matters_by_party(
  p_tenant_id UUID,
  p_search_name TEXT,
  p_threshold REAL DEFAULT 0.3
)
RETURNS TABLE (
  matter_id UUID,
  matter_number TEXT,
  matter_title TEXT,
  contact_id UUID,
  contact_name TEXT,
  role TEXT,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT m.id AS matter_id,
           m.matter_number,
           m.title AS matter_title,
           c.id AS contact_id,
           (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))::TEXT AS contact_name,
           mc.role,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name))
           ) AS similarity
    FROM matter_contacts mc
    JOIN contacts c ON c.id = mc.contact_id
    JOIN matters m ON m.id = mc.matter_id
    WHERE mc.tenant_id = p_tenant_id
      AND c.is_archived = false
      AND m.status NOT IN ('closed_lost', 'archived')
      AND (
        similarity(lower(c.first_name || ' ' || c.last_name), lower(p_search_name)) > p_threshold
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(p_search_name)) > p_threshold
      )
    ORDER BY similarity DESC
    LIMIT 30;
END;
$$;

COMMENT ON FUNCTION search_matters_by_party IS 'Directive 005.2: Fuzzy party name search across matter_contacts joined to contacts and matters. Tenant-isolated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_global_conflict_scan — comprehensive cross-entity conflict check
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_global_conflict_scan(
  p_tenant_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_dob DATE DEFAULT NULL,
  p_passport TEXT DEFAULT NULL,
  p_exclude_contact_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_phone_suffix TEXT;
  v_contact_matches JSONB := '[]'::JSONB;
  v_lead_matches JSONB := '[]'::JSONB;
  v_matter_matches JSONB := '[]'::JSONB;
  v_seen_ids TEXT[] := '{}';
  v_score INT := 0;
  v_max_sim REAL := 0;
  v_status TEXT := 'clear';
  rec RECORD;
BEGIN
  -- Build search name
  v_full_name := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  -- Normalise phone: keep last 10 digits for suffix matching
  IF p_phone IS NOT NULL AND length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 7 THEN
    v_phone_suffix := right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 10);
  END IF;

  -- ── Contact matches ──────────────────────────────────────────────────────

  FOR rec IN
    SELECT c.id,
           c.first_name,
           c.last_name,
           c.email_primary,
           c.phone_primary,
           c.date_of_birth,
           c.passport_number,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name))
           ) AS name_sim
    FROM contacts c
    WHERE c.tenant_id = p_tenant_id
      AND c.is_archived = false
      AND (p_exclude_contact_id IS NULL OR c.id != p_exclude_contact_id)
      AND (
        -- Fuzzy name match
        similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)) > 0.3
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name)) > 0.3
        -- Exact email match
        OR (p_email IS NOT NULL AND lower(c.email_primary) = lower(p_email))
        -- Phone suffix match
        OR (v_phone_suffix IS NOT NULL AND right(regexp_replace(c.phone_primary, '[^0-9]', '', 'g'), 10) = v_phone_suffix)
        -- DOB match
        OR (p_dob IS NOT NULL AND c.date_of_birth = p_dob::TEXT)
        -- Passport match
        OR (p_passport IS NOT NULL AND upper(c.passport_number) = upper(p_passport))
      )
    ORDER BY name_sim DESC
    LIMIT 20
  LOOP
    DECLARE
      v_match_fields JSONB := '[]'::JSONB;
      v_sim INT := 0;
      v_cat TEXT := 'possible_duplicate';
    BEGIN
      -- Calculate match fields and weighted similarity
      IF rec.name_sim > 0.3 THEN
        v_match_fields := v_match_fields || jsonb_build_array('fuzzy_name');
        v_sim := v_sim + (rec.name_sim * 20)::INT;  -- fuzzy_name weight: 20
      END IF;

      IF rec.name_sim > 0.95 THEN
        v_match_fields := v_match_fields || jsonb_build_array('exact_name');
        v_sim := v_sim + 30;  -- exact_name weight: 30
      END IF;

      IF p_email IS NOT NULL AND lower(rec.email_primary) = lower(p_email) THEN
        v_match_fields := v_match_fields || jsonb_build_array('email');
        v_sim := v_sim + 25;  -- email_match weight: 25
      END IF;

      IF v_phone_suffix IS NOT NULL AND right(regexp_replace(rec.phone_primary, '[^0-9]', '', 'g'), 10) = v_phone_suffix THEN
        v_match_fields := v_match_fields || jsonb_build_array('phone');
        v_sim := v_sim + 20;  -- phone_match weight: 20
      END IF;

      IF p_dob IS NOT NULL AND rec.date_of_birth = p_dob::TEXT THEN
        v_match_fields := v_match_fields || jsonb_build_array('dob');
        v_sim := v_sim + 20;  -- dob_match weight: 20
      END IF;

      IF p_passport IS NOT NULL AND upper(rec.passport_number) = upper(p_passport) THEN
        v_match_fields := v_match_fields || jsonb_build_array('passport');
        v_sim := v_sim + 25;  -- passport is strong identifier
      END IF;

      -- Cap at 100
      IF v_sim > 100 THEN v_sim := 100; END IF;

      -- Track highest score
      IF v_sim > v_score THEN v_score := v_sim; END IF;

      v_contact_matches := v_contact_matches || jsonb_build_object(
        'entity_id', rec.id,
        'entity_type', 'contact',
        'entity_name', trim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '')),
        'match_fields', v_match_fields,
        'similarity', v_sim,
        'category', v_cat
      );

      v_seen_ids := array_append(v_seen_ids, rec.id::TEXT);
    END;
  END LOOP;

  -- ── Lead matches (leads → contacts join) ─────────────────────────────────

  FOR rec IN
    SELECT l.id AS lead_id,
           c.first_name,
           c.last_name,
           c.email_primary,
           c.phone_primary,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name))
           ) AS name_sim
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    WHERE l.tenant_id = p_tenant_id
      AND l.is_closed = false
      AND c.is_archived = false
      AND (
        similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)) > 0.3
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name)) > 0.3
        OR (p_email IS NOT NULL AND lower(c.email_primary) = lower(p_email))
        OR (v_phone_suffix IS NOT NULL AND right(regexp_replace(c.phone_primary, '[^0-9]', '', 'g'), 10) = v_phone_suffix)
      )
    ORDER BY name_sim DESC
    LIMIT 20
  LOOP
    DECLARE
      v_match_fields JSONB := '[]'::JSONB;
      v_sim INT := 0;
    BEGIN
      IF rec.name_sim > 0.3 THEN
        v_match_fields := v_match_fields || jsonb_build_array('fuzzy_name');
        v_sim := v_sim + (rec.name_sim * 20)::INT;
      END IF;

      IF p_email IS NOT NULL AND lower(rec.email_primary) = lower(p_email) THEN
        v_match_fields := v_match_fields || jsonb_build_array('email');
        v_sim := v_sim + 25;
      END IF;

      IF v_phone_suffix IS NOT NULL AND right(regexp_replace(rec.phone_primary, '[^0-9]', '', 'g'), 10) = v_phone_suffix THEN
        v_match_fields := v_match_fields || jsonb_build_array('phone');
        v_sim := v_sim + 20;
      END IF;

      IF v_sim > 100 THEN v_sim := 100; END IF;
      IF v_sim > v_score THEN v_score := v_sim; END IF;

      v_lead_matches := v_lead_matches || jsonb_build_object(
        'entity_id', rec.lead_id,
        'entity_type', 'lead',
        'entity_name', trim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '')),
        'match_fields', v_match_fields,
        'similarity', v_sim,
        'category', 'possible_duplicate'
      );
    END;
  END LOOP;

  -- ── Matter matches (adverse party roles via matter_contacts) ─────────────

  FOR rec IN
    SELECT m.id AS matter_id,
           m.matter_number,
           m.title AS matter_title,
           c.id AS contact_id,
           c.first_name,
           c.last_name,
           mc.role,
           greatest(
             similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)),
             similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name))
           ) AS name_sim
    FROM matter_contacts mc
    JOIN contacts c ON c.id = mc.contact_id
    JOIN matters m ON m.id = mc.matter_id
    WHERE mc.tenant_id = p_tenant_id
      AND c.is_archived = false
      AND m.status NOT IN ('closed_lost', 'archived')
      AND (p_exclude_contact_id IS NULL OR c.id != p_exclude_contact_id)
      AND (
        similarity(lower(c.first_name || ' ' || c.last_name), lower(v_full_name)) > 0.3
        OR similarity(lower(c.last_name || ', ' || c.first_name), lower(v_full_name)) > 0.3
      )
    ORDER BY name_sim DESC
    LIMIT 30
  LOOP
    DECLARE
      v_match_fields JSONB := '[]'::JSONB;
      v_sim INT := 0;
      v_cat TEXT;
    BEGIN
      -- Determine category based on role
      IF rec.role IN ('adverse_party', 'opposing_party', 'respondent', 'defendant') THEN
        v_cat := 'adverse_party';
        v_sim := v_sim + 40;  -- adverse_party weight: 40
      ELSIF rec.role IN ('former_client') THEN
        v_cat := 'former_client';
        v_sim := v_sim + 25;
      ELSE
        v_cat := 'related_matter';
        v_sim := v_sim + 10;
      END IF;

      IF rec.name_sim > 0.3 THEN
        v_match_fields := v_match_fields || jsonb_build_array('fuzzy_name');
        v_sim := v_sim + (rec.name_sim * 20)::INT;
      END IF;

      IF v_sim > 100 THEN v_sim := 100; END IF;
      IF v_sim > v_score THEN v_score := v_sim; END IF;

      v_matter_matches := v_matter_matches || jsonb_build_object(
        'entity_id', rec.matter_id,
        'entity_type', 'matter',
        'entity_name', trim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '')),
        'match_fields', v_match_fields,
        'similarity', v_sim,
        'category', v_cat,
        'role', rec.role,
        'matter_number', rec.matter_number,
        'matter_title', rec.matter_title,
        'contact_id', rec.contact_id
      );
    END;
  END LOOP;

  -- ── Determine status ─────────────────────────────────────────────────────

  IF v_score >= 50 THEN
    v_status := 'review_required';
  ELSIF v_score >= 25 THEN
    v_status := 'review_suggested';
  ELSE
    v_status := 'clear';
  END IF;

  -- ── Return comprehensive result ──────────────────────────────────────────

  RETURN jsonb_build_object(
    'contacts', v_contact_matches,
    'leads', v_lead_matches,
    'matters', v_matter_matches,
    'score', v_score,
    'status', v_status,
    'total_matches', jsonb_array_length(v_contact_matches) + jsonb_array_length(v_lead_matches) + jsonb_array_length(v_matter_matches)
  );
END;
$$;

COMMENT ON FUNCTION fn_global_conflict_scan IS 'Directive 005.2: Comprehensive cross-entity conflict scan. Searches contacts, leads, and matter_contacts by name (fuzzy), email (exact), phone (suffix), DOB (exact), passport (exact). Returns weighted JSONB result with status classification. SECURITY DEFINER with strict tenant isolation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GIN trigram indexes for leads (via contacts — contacts indexes already exist)
--    Adding indexes on leads table columns used in joins for query planner hints
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_contact_id_tenant ON leads (contact_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_closed ON leads (is_closed) WHERE is_closed = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. global_conflict_results — persists scan results
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS global_conflict_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('contact', 'lead', 'intake')),
  source_entity_id UUID,
  search_inputs JSONB NOT NULL,
  result_data JSONB NOT NULL,
  score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'clear' CHECK (status IN ('clear', 'review_suggested', 'review_required', 'blocked')),
  scanned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE global_conflict_results IS 'Directive 005.2: Stores results of global conflict scans for audit trail and history.';
COMMENT ON COLUMN global_conflict_results.search_inputs IS 'The search parameters used for the scan (first_name, last_name, email, phone, dob, passport).';
COMMENT ON COLUMN global_conflict_results.result_data IS 'Full JSONB scan result including contacts, leads, matters arrays and score.';
COMMENT ON COLUMN global_conflict_results.score IS 'Weighted conflict score (0-100). >=50 review_required, >=25 review_suggested, <25 clear.';
COMMENT ON COLUMN global_conflict_results.status IS 'Conflict status classification derived from score.';

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_gcr_tenant_source
  ON global_conflict_results (tenant_id, source_entity_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_gcr_created_at
  ON global_conflict_results (tenant_id, created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE global_conflict_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_conflict_results_tenant_isolation"
  ON global_conflict_results
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

COMMIT;
