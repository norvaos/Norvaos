-- Migration 167: Secure Global Search RPC
-- Single-call search across contacts, matters, leads, tasks.
-- Filters by auth.uid() at the database level  -  no tenant_id passed from client.
-- Returns only columns needed for the search result card (lean payload).

CREATE OR REPLACE FUNCTION public.global_search(search_term text, result_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- 1. Contacts: 6 columns only
  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb)
  INTO _contacts
  FROM (
    SELECT id, first_name, last_name, email_primary, organization_name, contact_type
    FROM contacts
    WHERE tenant_id = _tenant_id
      AND is_active = true
      AND (
        first_name ILIKE _pattern
        OR last_name ILIKE _pattern
        OR email_primary ILIKE _pattern
        OR organization_name ILIKE _pattern
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

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.global_search(text, int) TO authenticated;

COMMENT ON FUNCTION public.global_search IS
  'Secure global search across contacts, matters, leads, tasks. '
  'Filters by auth.uid() tenant. Returns lean card-display columns only.';
