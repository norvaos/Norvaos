-- Migration 150: SECURITY DEFINER function for Judicial Review matter creation
-- Replaces the createAdminClient() RLS bypass in POST /api/matters/[id]/create-jr-matter
--
-- Problem: PostgREST evaluates RLS on the RETURNING clause of an INSERT before
-- the row is committed. The check_matter_access() function fails for brand-new
-- matters because no access paths exist yet. This forced use of the service-role
-- (admin) key, bypassing RLS entirely.
--
-- Solution: A SECURITY DEFINER function that performs its own access validation
-- internally, then inserts the matter with elevated privileges in a controlled way.

CREATE OR REPLACE FUNCTION create_judicial_review_matter(
  p_source_matter_id UUID,
  p_matter_type_id   UUID DEFAULT NULL,
  p_auth_user_id     UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_row        RECORD;
  v_source_matter   RECORD;
  v_resolved_mt_id  UUID;
  v_new_matter      RECORD;
BEGIN
  -- 1. Resolve the caller's user row and validate role
  SELECT u.id, u.tenant_id, r.name AS role_name
  INTO v_user_row
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.auth_user_id = p_auth_user_id
    AND u.is_active = true
  LIMIT 1;

  IF v_user_row IS NULL THEN
    RAISE EXCEPTION 'User not found or inactive';
  END IF;

  IF v_user_row.role_name NOT IN ('Lawyer', 'Admin') THEN
    RAISE EXCEPTION 'Forbidden: Lawyer or Admin role required';
  END IF;

  -- 2. Verify source matter exists and belongs to the same tenant
  SELECT id, tenant_id, title, practice_area_id, responsible_lawyer_id, originating_lawyer_id
  INTO v_source_matter
  FROM matters
  WHERE id = p_source_matter_id
    AND tenant_id = v_user_row.tenant_id;

  IF v_source_matter IS NULL THEN
    RAISE EXCEPTION 'Source matter not found or access denied';
  END IF;

  -- 3. Resolve matter_type_id if not provided
  v_resolved_mt_id := p_matter_type_id;

  IF v_resolved_mt_id IS NULL THEN
    SELECT id INTO v_resolved_mt_id
    FROM matter_types
    WHERE tenant_id = v_user_row.tenant_id
      AND LOWER(name) LIKE '%judicial%'
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_resolved_mt_id IS NULL THEN
    SELECT id INTO v_resolved_mt_id
    FROM matter_types
    WHERE tenant_id = v_user_row.tenant_id
      AND UPPER(name) LIKE '%JR%'
      AND is_active = true
    LIMIT 1;
  END IF;

  -- 4. Insert the new JR matter
  INSERT INTO matters (
    tenant_id,
    title,
    description,
    practice_area_id,
    matter_type_id,
    responsible_lawyer_id,
    originating_lawyer_id,
    status,
    priority,
    billing_type,
    date_opened,
    custom_fields,
    created_by
  ) VALUES (
    v_user_row.tenant_id,
    'Judicial Review  -  ' || v_source_matter.title,
    'Judicial Review matter linked from: ' || v_source_matter.title || ' (' || p_source_matter_id || ')',
    v_source_matter.practice_area_id,
    v_resolved_mt_id,
    COALESCE(v_source_matter.responsible_lawyer_id, v_user_row.id),
    v_source_matter.originating_lawyer_id,
    'active',
    'urgent',
    'flat_fee',
    CURRENT_DATE,
    jsonb_build_object(
      'parent_matter_id', p_source_matter_id,
      'matter_relationship', 'judicial_review'
    ),
    v_user_row.id
  )
  RETURNING * INTO v_new_matter;

  -- 5. Return the new matter as JSONB
  RETURN to_jsonb(v_new_matter);
END;
$$;

-- Grant to authenticated users (RLS is enforced inside the function)
GRANT EXECUTE ON FUNCTION create_judicial_review_matter(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION create_judicial_review_matter IS
  'Creates a Judicial Review matter linked to a source matter. '
  'Validates caller role and source matter access internally. '
  'Replaces the createAdminClient() bypass in the API route.';
