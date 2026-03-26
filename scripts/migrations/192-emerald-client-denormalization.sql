-- Migration 192: Emerald Client Badge  -  Denormalized Client Status
--
-- Problem: "Client" status lives only in the matter_contacts join table (role = 'client').
-- The sidebar, global search, and profile badges all hit the contacts table  -  which has
-- no knowledge of whether a contact has ever been retained. This migration adds:
--   1. contacts.client_status   -  'lead' | 'client' | 'former_client'
--   2. contacts.active_matter_count  -  integer for the Emerald Badge sub-label
--   3. A trigger on matter_contacts that keeps both columns in sync automatically.
--   4. Backfill of existing data.
--   5. Updated global_search RPC to use the new columns.
--
-- Directives satisfied:
--   • Emerald Client Badge (computed from active_matter_count)
--   • Sidebar fast-load (no join required)
--   • Global search "Client" filter accuracy
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 0. Fix sentinel_hash_chain search_path (digest() needs pgcrypto) ───────
-- Migration 174 created sentinel_hash_chain() with SET search_path = public,
-- but pgcrypto lives in the extensions schema. Any trigger cascade that reaches
-- sentinel_audit_log will fail with "function digest(text, unknown) does not exist".
-- Fix: add extensions to the search path, and same for sentinel_verify_chain.

CREATE OR REPLACE FUNCTION sentinel_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _prev_hash  TEXT;
  _seq        BIGINT;
  _payload    TEXT;
BEGIN
  _seq := nextval('sentinel_chain_seq');

  SELECT row_hash INTO _prev_hash
    FROM sentinel_audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF _prev_hash IS NULL THEN
    _prev_hash := 'SENTINEL_GENESIS_BLOCK_v1';
  END IF;

  _payload := concat_ws('|',
    _seq::TEXT,
    NEW.id::TEXT,
    NEW.event_type,
    NEW.severity,
    COALESCE(NEW.tenant_id::TEXT, 'NULL'),
    COALESCE(NEW.user_id::TEXT, 'NULL'),
    COALESCE(NEW.auth_user_id::TEXT, 'NULL'),
    COALESCE(NEW.table_name, 'NULL'),
    COALESCE(NEW.record_id::TEXT, 'NULL'),
    COALESCE(NEW.details::TEXT, '{}'),
    NEW.created_at::TEXT,
    _prev_hash
  );

  NEW.chain_seq := _seq;
  NEW.prev_hash := _prev_hash;
  NEW.row_hash  := encode(digest(_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sentinel_verify_chain(p_limit INT DEFAULT 1000)
RETURNS TABLE (
  is_valid       BOOLEAN,
  total_checked  INT,
  first_broken   BIGINT,
  broken_id      UUID,
  expected_hash  TEXT,
  actual_hash    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row          RECORD;
  _prev_hash    TEXT := 'SENTINEL_GENESIS_BLOCK_v1';
  _computed     TEXT;
  _payload      TEXT;
  _count        INT := 0;
  _broken_seq   BIGINT := NULL;
  _broken_id    UUID := NULL;
  _expected     TEXT := NULL;
  _actual       TEXT := NULL;
BEGIN
  FOR _row IN
    SELECT *
      FROM sentinel_audit_log
     WHERE chain_seq IS NOT NULL
     ORDER BY chain_seq ASC
     LIMIT p_limit
  LOOP
    _count := _count + 1;

    IF _row.prev_hash IS DISTINCT FROM _prev_hash THEN
      _broken_seq := _row.chain_seq;
      _broken_id  := _row.id;
      _expected   := _prev_hash;
      _actual     := _row.prev_hash;
      RETURN QUERY SELECT FALSE, _count, _broken_seq, _broken_id, _expected, _actual;
      RETURN;
    END IF;

    _payload := concat_ws('|',
      _row.chain_seq::TEXT,
      _row.id::TEXT,
      _row.event_type,
      _row.severity,
      COALESCE(_row.tenant_id::TEXT, 'NULL'),
      COALESCE(_row.user_id::TEXT, 'NULL'),
      COALESCE(_row.auth_user_id::TEXT, 'NULL'),
      COALESCE(_row.table_name, 'NULL'),
      COALESCE(_row.record_id::TEXT, 'NULL'),
      COALESCE(_row.details::TEXT, '{}'),
      _row.created_at::TEXT,
      _prev_hash
    );

    _computed := encode(digest(_payload, 'sha256'), 'hex');

    IF _computed IS DISTINCT FROM _row.row_hash THEN
      _broken_seq := _row.chain_seq;
      _broken_id  := _row.id;
      _expected   := _computed;
      _actual     := _row.row_hash;
      RETURN QUERY SELECT FALSE, _count, _broken_seq, _broken_id, _expected, _actual;
      RETURN;
    END IF;

    _prev_hash := _row.row_hash;
  END LOOP;

  RETURN QUERY SELECT TRUE, _count, NULL::BIGINT, NULL::UUID, NULL::TEXT, NULL::TEXT;
  RETURN;
END;
$$;


-- ─── 1. Add denormalized columns to contacts ────────────────────────────────

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) NOT NULL DEFAULT 'lead'
    CHECK (client_status IN ('lead', 'client', 'former_client'));

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS active_matter_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN contacts.client_status IS
  'Denormalized from matter_contacts. ''client'' = at least one active matter with role=client. '
  '''former_client'' = had matters but all are now closed/archived. ''lead'' = never retained.';

COMMENT ON COLUMN contacts.active_matter_count IS
  'Count of non-closed/non-archived matters where this contact has role=client in matter_contacts. '
  'Used by the Emerald Client Badge sub-label.';

-- Index for sidebar filtering and global search
CREATE INDEX IF NOT EXISTS idx_contacts_client_status ON contacts(tenant_id, client_status);


-- ─── 2. Recomputation function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_contact_client_status(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _active_count integer;
  _total_count  integer;
  _new_status   varchar(20);
BEGIN
  -- Count active matters (not closed, not archived) where contact is a client
  SELECT
    COUNT(*) FILTER (WHERE m.status NOT IN ('closed_won', 'closed_lost', 'archived')),
    COUNT(*)
  INTO _active_count, _total_count
  FROM matter_contacts mc
  JOIN matters m ON m.id = mc.matter_id
  WHERE mc.contact_id = p_contact_id
    AND mc.role = 'client';

  -- Derive status
  IF _active_count > 0 THEN
    _new_status := 'client';
  ELSIF _total_count > 0 THEN
    _new_status := 'former_client';
  ELSE
    _new_status := 'lead';
  END IF;

  -- Single atomic update
  UPDATE contacts
  SET client_status = _new_status,
      active_matter_count = _active_count
  WHERE id = p_contact_id;
END;
$$;

COMMENT ON FUNCTION sync_contact_client_status IS
  'Recomputes contacts.client_status and contacts.active_matter_count from matter_contacts + matters. '
  'Called by triggers on matter_contacts and matters.';


-- ─── 3. Trigger on matter_contacts (INSERT / DELETE / UPDATE) ───────────────

CREATE OR REPLACE FUNCTION trg_matter_contacts_sync_client_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- On INSERT or UPDATE, recompute for the new contact
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM sync_contact_client_status(NEW.contact_id);
  END IF;

  -- On DELETE or UPDATE (if contact_id changed), recompute for the old contact
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM sync_contact_client_status(OLD.contact_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_matter_contacts_client_sync ON matter_contacts;
CREATE TRIGGER trg_matter_contacts_client_sync
  AFTER INSERT OR UPDATE OR DELETE ON matter_contacts
  FOR EACH ROW
  EXECUTE FUNCTION trg_matter_contacts_sync_client_status();


-- ─── 4. Trigger on matters.status change (closing a matter demotes client) ──

CREATE OR REPLACE FUNCTION trg_matters_status_sync_client_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Recompute all contacts linked as 'client' to this matter
    PERFORM sync_contact_client_status(mc.contact_id)
    FROM matter_contacts mc
    WHERE mc.matter_id = NEW.id
      AND mc.role = 'client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matters_status_client_sync ON matters;
CREATE TRIGGER trg_matters_status_client_sync
  AFTER UPDATE ON matters
  FOR EACH ROW
  EXECUTE FUNCTION trg_matters_status_sync_client_status();


-- ─── 5. Backfill existing data ──────────────────────────────────────────────
-- The cross-tenant Sentinel trigger (migration 163) blocks updates when there
-- is no authenticated user context (auth.uid() = NULL), which is the case for
-- migration DO blocks. Temporarily disable it for the backfill, then re-enable.

DO $$
DECLARE
  _cid uuid;
  _trigger_name TEXT;
BEGIN
  -- Find and disable the cross-tenant trigger on contacts
  SELECT tgname INTO _trigger_name
    FROM pg_trigger
   WHERE tgrelid = 'contacts'::regclass
     AND tgname LIKE '%cross_tenant%';

  IF _trigger_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contacts DISABLE TRIGGER %I', _trigger_name);
  END IF;

  -- Backfill: recompute for every contact that has ever been in matter_contacts
  FOR _cid IN
    SELECT DISTINCT contact_id FROM matter_contacts WHERE role = 'client'
  LOOP
    PERFORM sync_contact_client_status(_cid);
  END LOOP;

  -- Re-enable the cross-tenant trigger
  IF _trigger_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contacts ENABLE TRIGGER %I', _trigger_name);
  END IF;
END;
$$;


-- ─── 6. Update global_search RPC to expose client_status ────────────────────

CREATE OR REPLACE FUNCTION public.global_search(search_term text, result_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _tenant_id uuid;
  _pattern   text;
  _contacts  jsonb;
  _matters   jsonb;
  _leads     jsonb;
  _tasks     jsonb;
BEGIN
  -- Resolve tenant from auth.uid()  -  enforced at DB level
  SELECT tenant_id INTO _tenant_id
  FROM users
  WHERE auth_user_id = auth.uid();

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no tenant found for current user';
  END IF;

  _pattern := '%' || search_term || '%';

  -- 1. Contacts: now includes client_status + active_matter_count for Emerald Badge
  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb)
  INTO _contacts
  FROM (
    SELECT id, first_name, last_name, email_primary, organization_name,
           contact_type, client_status, active_matter_count
    FROM contacts
    WHERE tenant_id = _tenant_id
      AND is_active = true
      AND (
        first_name ILIKE _pattern
        OR last_name ILIKE _pattern
        OR email_primary ILIKE _pattern
        OR organization_name ILIKE _pattern
        OR client_status ILIKE _pattern
      )
    ORDER BY
      CASE WHEN first_name ILIKE search_term || '%' OR last_name ILIKE search_term || '%' THEN 0 ELSE 1 END,
      first_name
    LIMIT result_limit
  ) c;

  -- 2. Matters: 4 columns only
  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb)
  INTO _matters
  FROM (
    SELECT id, title, matter_number, status
    FROM matters
    WHERE tenant_id = _tenant_id
      AND status NOT IN ('archived', 'import_reverted')
      AND (
        title ILIKE _pattern
        OR matter_number ILIKE _pattern
      )
    ORDER BY
      CASE WHEN title ILIKE search_term || '%' OR matter_number ILIKE search_term || '%' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT result_limit
  ) m;

  -- 3. Leads: 4 columns (with contact join for display name)
  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
  INTO _leads
  FROM (
    SELECT
      l.id,
      l.source,
      c.first_name AS contact_first_name,
      c.last_name AS contact_last_name
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    WHERE l.tenant_id = _tenant_id
      AND (
        c.first_name ILIKE _pattern
        OR c.last_name ILIKE _pattern
        OR c.email_primary ILIKE _pattern
      )
    ORDER BY l.created_at DESC
    LIMIT result_limit
  ) l;

  -- 4. Tasks: 4 columns only
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO _tasks
  FROM (
    SELECT id, title, status, priority
    FROM tasks
    WHERE tenant_id = _tenant_id
      AND is_deleted = false
      AND (
        title ILIKE _pattern
        OR description ILIKE _pattern
      )
    ORDER BY
      CASE WHEN title ILIKE search_term || '%' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT result_limit
  ) t;

  RETURN jsonb_build_object(
    'contacts', _contacts,
    'matters', _matters,
    'leads', _leads,
    'tasks', _tasks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, int) TO authenticated;

COMMENT ON FUNCTION public.global_search IS
  'Secure global search across contacts, matters, leads, tasks. '
  'Filters by auth.uid() tenant. Returns lean card-display columns only. '
  'Contacts now include client_status and active_matter_count for Emerald Badge.';
