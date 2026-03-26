-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 112  -  Matter Profile System
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Purpose:
--   Add a matter-scoped profile layer on top of contacts.immigration_data.
--
--   Each person in a matter (matter_people) gets a profile_data JSONB column
--   that holds a point-in-time snapshot of their canonical profile at matter
--   creation, plus any matter-specific additions (visa type, purpose of visit,
--   employer, school, etc.).
--
--   When a new matter is opened for an existing client, the carry-forward
--   function copies contacts.immigration_data → matter_people.profile_data.
--   Staff only enter what changed  -  nothing stable is retyped.
--
--   The IRCC form fill engine reads matter_people.profile_data instead of
--   contacts.immigration_data when a matter_id is provided.
--
-- Changes:
--   1. ALTER TABLE matter_people   -  add profile_data, snapshot_taken_at,
--                                    is_locked, profile_version
--   2. CREATE TABLE matter_profile_sync_log  -  audit trail for all carry-forward
--                                             and sync-back events
--   3. CREATE FUNCTION snapshot_contact_profile_to_matter  -  carry-forward
--   4. CREATE FUNCTION sync_matter_profile_to_canonical   -  sync-back
--   5. Indexes
--   6. RLS policies
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Extend matter_people ──────────────────────────────────────────────────

ALTER TABLE public.matter_people
  ADD COLUMN IF NOT EXISTS profile_data         JSONB        DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at    TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_locked            BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_version      INTEGER      NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.matter_people.profile_data IS
  'Full IRCC profile for this person in this matter. Same namespace as '
  'contacts.immigration_data (profile_path keys). Populated by '
  'snapshot_contact_profile_to_matter() at matter creation and updated '
  'by staff during the workbench verification phase. Read by the XFA fill '
  'engine when matterId is provided to generate-pdf.';

COMMENT ON COLUMN public.matter_people.snapshot_taken_at IS
  'Timestamp when contacts.immigration_data was last copied into profile_data. '
  'NULL means no snapshot has been taken (profile_data was entered directly).';

COMMENT ON COLUMN public.matter_people.is_locked IS
  'True once a package has been generated for this matter. Locked profiles '
  'cannot be edited  -  changes require creating a new package version.';

COMMENT ON COLUMN public.matter_people.profile_version IS
  'Incremented on every profile_data update. Used for optimistic concurrency '
  'in the workbench to prevent silent overwrites.';


-- ── 2. matter_profile_sync_log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.matter_profile_sync_log (
  id                UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID          NOT NULL,
  matter_id         UUID          NOT NULL,
  matter_person_id  UUID          NOT NULL,
  contact_id        UUID,
  sync_direction    TEXT          NOT NULL,  -- 'canonical_to_matter' | 'matter_to_canonical'
  fields_synced     TEXT[],                  -- profile_path keys affected; NULL = full snapshot
  synced_by         UUID,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT fk_mpsl_tenant   FOREIGN KEY (tenant_id)        REFERENCES public.tenants(id)        ON DELETE CASCADE,
  CONSTRAINT fk_mpsl_matter   FOREIGN KEY (matter_id)        REFERENCES public.matters(id)        ON DELETE CASCADE,
  CONSTRAINT fk_mpsl_person   FOREIGN KEY (matter_person_id) REFERENCES public.matter_people(id)  ON DELETE CASCADE,
  CONSTRAINT fk_mpsl_contact  FOREIGN KEY (contact_id)       REFERENCES public.contacts(id)       ON DELETE SET NULL,
  CONSTRAINT fk_mpsl_user     FOREIGN KEY (synced_by)        REFERENCES public.users(id)          ON DELETE SET NULL,
  CONSTRAINT chk_mpsl_dir     CHECK (sync_direction IN ('canonical_to_matter', 'matter_to_canonical'))
);

COMMENT ON TABLE public.matter_profile_sync_log IS
  'Append-only audit log for every carry-forward (canonical → matter) and '
  'sync-back (matter → canonical) event. Never update or delete rows here.';


-- ── 3. RLS  -  matter_profile_sync_log ────────────────────────────────────────

ALTER TABLE public.matter_profile_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matter_profile_sync_log_tenant_isolation" ON public.matter_profile_sync_log
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid()
  ));


-- ── 4. Indexes ───────────────────────────────────────────────────────────────

-- Primary lookup: all people in a matter with their profiles
CREATE INDEX IF NOT EXISTS idx_matter_people_matter_profile
  ON public.matter_people (matter_id, person_role)
  WHERE is_active = true;

-- GIN index for JSONB profile queries (field-level search in workbench)
CREATE INDEX IF NOT EXISTS idx_matter_people_profile_data_gin
  ON public.matter_people USING GIN (profile_data);

-- Sync log lookups
CREATE INDEX IF NOT EXISTS idx_mpsl_matter_id
  ON public.matter_profile_sync_log (matter_id);

CREATE INDEX IF NOT EXISTS idx_mpsl_matter_person_id
  ON public.matter_profile_sync_log (matter_person_id);

CREATE INDEX IF NOT EXISTS idx_mpsl_contact_id
  ON public.matter_profile_sync_log (contact_id)
  WHERE contact_id IS NOT NULL;


-- ── 5. snapshot_contact_profile_to_matter ────────────────────────────────────
--
-- Copies contacts.immigration_data → matter_people.profile_data.
-- Called at matter creation (carry-forward) or when staff explicitly
-- requests a refresh of stable biographical data.
--
-- Parameters:
--   p_matter_person_id  UUID    -  the matter_people.id row to populate
--   p_contact_id        UUID    -  the contacts.id to snapshot from
--   p_tenant_id         UUID    -  tenant guard
--   p_synced_by         UUID    -  the users.id performing the action (for audit)
--
-- Returns: profile_version INTEGER  -  the new version number after snapshot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_contact_profile_to_matter(
  p_matter_person_id  UUID,
  p_contact_id        UUID,
  p_tenant_id         UUID,
  p_synced_by         UUID  DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile        JSONB;
  v_matter_id      UUID;
  v_new_version    INTEGER;
BEGIN
  -- Fetch canonical profile from contact
  SELECT immigration_data INTO v_profile
  FROM public.contacts
  WHERE id = p_contact_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found in tenant %', p_contact_id, p_tenant_id;
  END IF;

  -- Default to empty object if contact has no immigration_data yet
  v_profile := COALESCE(v_profile, '{}'::jsonb);

  -- Verify the matter_people row belongs to this tenant and get matter_id
  SELECT matter_id INTO v_matter_id
  FROM public.matter_people
  WHERE id = p_matter_person_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'matter_people row % not found in tenant %', p_matter_person_id, p_tenant_id;
  END IF;

  -- Refuse to snapshot into a locked profile
  IF EXISTS (
    SELECT 1 FROM public.matter_people
    WHERE id = p_matter_person_id AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'Profile for matter_people % is locked. Generate a new package version to make changes.', p_matter_person_id;
  END IF;

  -- Write snapshot into matter_people
  UPDATE public.matter_people
  SET
    profile_data      = v_profile,
    snapshot_taken_at = now(),
    profile_version   = profile_version + 1,
    updated_at        = now()
  WHERE id = p_matter_person_id
    AND tenant_id = p_tenant_id
  RETURNING profile_version INTO v_new_version;

  -- Audit log
  INSERT INTO public.matter_profile_sync_log (
    tenant_id,
    matter_id,
    matter_person_id,
    contact_id,
    sync_direction,
    fields_synced,
    synced_by,
    notes
  ) VALUES (
    p_tenant_id,
    v_matter_id,
    p_matter_person_id,
    p_contact_id,
    'canonical_to_matter',
    NULL,  -- NULL = full snapshot, not field-level
    p_synced_by,
    'Full canonical snapshot at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS UTC')
  );

  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.snapshot_contact_profile_to_matter IS
  'Carry-forward: copies contacts.immigration_data → matter_people.profile_data. '
  'Call at matter creation for each person in the matter. Also available as a '
  'manual refresh when client biographical data has changed since the last snapshot. '
  'Refuses to overwrite a locked profile.';


-- ── 6. sync_matter_profile_to_canonical ──────────────────────────────────────
--
-- Selective sync-back: pushes specific profile_path keys from
-- matter_people.profile_data back to contacts.immigration_data.
--
-- Used after a matter closes when stable data changed during the matter
-- (e.g. new passport, new address) and should carry forward to future matters.
--
-- Parameters:
--   p_matter_person_id  UUID      -  the matter_people.id to sync from
--   p_contact_id        UUID      -  the contacts.id to update
--   p_tenant_id         UUID      -  tenant guard
--   p_fields_to_sync    TEXT[]    -  array of top-level profile keys to merge
--                                  e.g. ARRAY['passport', 'contact_info']
--                                  NULL = merge ALL keys
--   p_synced_by         UUID      -  the users.id performing the action
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_matter_profile_to_canonical(
  p_matter_person_id  UUID,
  p_contact_id        UUID,
  p_tenant_id         UUID,
  p_fields_to_sync    TEXT[]  DEFAULT NULL,
  p_synced_by         UUID    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matter_profile  JSONB;
  v_current_canon   JSONB;
  v_merged          JSONB;
  v_matter_id       UUID;
  v_field           TEXT;
BEGIN
  -- Fetch matter profile
  SELECT profile_data, matter_id INTO v_matter_profile, v_matter_id
  FROM public.matter_people
  WHERE id = p_matter_person_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'matter_people row % not found in tenant %', p_matter_person_id, p_tenant_id;
  END IF;

  -- Fetch current canonical profile
  SELECT COALESCE(immigration_data, '{}'::jsonb) INTO v_current_canon
  FROM public.contacts
  WHERE id = p_contact_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found in tenant %', p_contact_id, p_tenant_id;
  END IF;

  -- Determine what to merge
  IF p_fields_to_sync IS NULL THEN
    -- Full merge: matter profile wins on all keys
    v_merged := v_current_canon || v_matter_profile;
  ELSE
    -- Selective merge: only specified top-level keys
    v_merged := v_current_canon;
    FOREACH v_field IN ARRAY p_fields_to_sync LOOP
      IF v_matter_profile ? v_field THEN
        v_merged := jsonb_set(v_merged, ARRAY[v_field], v_matter_profile -> v_field);
      END IF;
    END LOOP;
  END IF;

  -- Write back to canonical
  UPDATE public.contacts
  SET
    immigration_data = v_merged,
    updated_at       = now()
  WHERE id = p_contact_id
    AND tenant_id = p_tenant_id;

  -- Audit log
  INSERT INTO public.matter_profile_sync_log (
    tenant_id,
    matter_id,
    matter_person_id,
    contact_id,
    sync_direction,
    fields_synced,
    synced_by,
    notes
  ) VALUES (
    p_tenant_id,
    v_matter_id,
    p_matter_person_id,
    p_contact_id,
    'matter_to_canonical',
    p_fields_to_sync,
    p_synced_by,
    CASE
      WHEN p_fields_to_sync IS NULL THEN 'Full matter → canonical sync'
      ELSE 'Selective sync: ' || array_to_string(p_fields_to_sync, ', ')
    END
  );
END;
$$;

COMMENT ON FUNCTION public.sync_matter_profile_to_canonical IS
  'Sync-back: merges selected keys from matter_people.profile_data back into '
  'contacts.immigration_data so future matters carry forward the updated data. '
  'Pass p_fields_to_sync = NULL to merge all keys, or pass specific top-level '
  'keys (e.g. ARRAY[''passport'', ''contact_info'']) for selective sync. '
  'Full audit trail written to matter_profile_sync_log.';


-- ── Done ─────────────────────────────────────────────────────────────────────
