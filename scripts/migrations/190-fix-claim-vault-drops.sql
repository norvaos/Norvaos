-- Migration 190: Fix claim_vault_drops column mismatch — Handshake Audit Hotfix
--
-- The original claim function (Migration 188) referenced columns that
-- don't exist on the documents table: display_name, mime_type, source.
--
-- Actual documents columns:
--   file_name (varchar), file_type (varchar), file_size (bigint),
--   storage_path (text), content_hash (text), category (text),
--   uploaded_by (uuid), created_at (timestamptz)
--
-- This migration replaces the function with corrected column mappings.

CREATE OR REPLACE FUNCTION claim_vault_drops(
  p_session_id TEXT,
  p_matter_id UUID,
  p_tenant_id UUID,
  p_claimed_by UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drop RECORD;
  v_claimed INT := 0;
BEGIN
  FOR v_drop IN
    SELECT * FROM vault_drops
    WHERE temp_session_id = p_session_id
      AND claimed_matter_id IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Insert into documents table (the matter's archive)
    INSERT INTO documents (
      tenant_id, matter_id, file_name, file_type, file_size,
      storage_path, content_hash, category,
      uploaded_by, created_at
    ) VALUES (
      p_tenant_id,
      p_matter_id,
      v_drop.file_name,
      v_drop.mime_type,
      v_drop.file_size,
      v_drop.storage_path,
      v_drop.content_hash,
      'client_submitted',
      p_claimed_by,
      v_drop.created_at
    );

    -- Mark the vault drop as claimed
    UPDATE vault_drops
    SET claimed_matter_id = p_matter_id,
        claimed_at = now()
    WHERE id = v_drop.id;

    v_claimed := v_claimed + 1;
  END LOOP;

  RETURN v_claimed;
END;
$$;
