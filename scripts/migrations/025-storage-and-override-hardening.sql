-- ============================================================================
-- Migration 025: Storage Lockdown + Transactional Risk Override
-- ============================================================================
-- Two security hardening items:
-- A. Storage RLS: Deny client-side writes/deletes to the documents bucket.
--    Only the server (service_role / admin client) can upload or remove files.
--    Authenticated clients can still download files scoped to their tenant.
-- B. Transactional Risk Override RPC: Single atomic function that updates
--    matter_intake, inserts risk_override_history, and writes an audit log.
--    If any step fails the entire transaction rolls back  -  no partial writes.
-- ============================================================================

-- ─── A. Storage RLS Policies ────────────────────────────────────────────────

-- Enable RLS on storage.objects (idempotent  -  Supabase may already have it on)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT (download) files in their tenant folder
-- The upload path is: {tenant_id}/{timestamp}-{random}.{ext}
-- storage.foldername(name) returns the path segments; [1] is the tenant_id prefix
DROP POLICY IF EXISTS storage_tenant_select ON storage.objects;
CREATE POLICY storage_tenant_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- No INSERT, UPDATE, or DELETE policies for the authenticated role.
-- This means authenticated clients CANNOT upload, modify, or delete storage objects.
-- Only service_role (admin client used in API routes) can write/delete.

-- ─── B. Transactional Risk Override RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_risk_override(
  p_intake_id      UUID,
  p_tenant_id      UUID,
  p_matter_id      UUID,
  p_user_id        UUID,
  p_override_level TEXT,
  p_override_reason TEXT,
  p_previous_level TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_intake RECORD;
  v_history_id UUID;
BEGIN
  -- 1. Update matter_intake with override fields
  UPDATE matter_intake SET
    risk_override_level  = p_override_level,
    risk_override_reason = p_override_reason,
    risk_override_by     = p_user_id,
    risk_override_at     = now()
  WHERE id = p_intake_id
    AND tenant_id = p_tenant_id
  RETURNING * INTO v_intake;

  IF v_intake IS NULL THEN
    RAISE EXCEPTION 'Intake record not found or tenant mismatch';
  END IF;

  -- 2. Insert override history (mandatory  -  failure rolls back everything)
  INSERT INTO risk_override_history (
    tenant_id, matter_id, intake_id,
    previous_level, new_level, reason, overridden_by
  ) VALUES (
    p_tenant_id, p_matter_id, p_intake_id,
    p_previous_level, p_override_level, p_override_reason, p_user_id
  ) RETURNING id INTO v_history_id;

  -- 3. Insert audit log (mandatory  -  failure rolls back everything)
  INSERT INTO audit_logs (
    tenant_id, user_id, entity_type, entity_id, action, changes, metadata
  ) VALUES (
    p_tenant_id,
    p_user_id,
    'matter_intake',
    p_intake_id,
    'risk_override',
    jsonb_build_object(
      'before', jsonb_build_object('risk_level', p_previous_level),
      'after',  jsonb_build_object('risk_override_level', p_override_level)
    ),
    jsonb_build_object(
      'matter_id', p_matter_id,
      'override_reason', p_override_reason,
      'history_id', v_history_id
    )
  );

  -- Return the updated intake row as JSONB
  RETURN to_jsonb(v_intake);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done: Storage locked down, risk override is now a single atomic transaction
