-- Migration 188: Vault Drops & Claim Engine — Directive 40.0 §2
--
-- Creates the vault_drops orphan index table and the claim function
-- that moves quarantined documents into a matter's archive when
-- an intake session is converted.
--
-- Flow:
--   1. Concierge vault drop → /api/documents/vault-drop stores file +
--      indexes (temp_session_id, content_hash, storage_path)
--   2. Intake converts to Matter → claim_vault_drops(session_id, matter_id, tenant_id)
--      moves files from quarantine into the matter's document archive
--      without re-upload.

-- ── 1. vault_drops table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_drops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_session_id   TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_size         BIGINT NOT NULL DEFAULT 0,
  mime_type         TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_path      TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'vault_drop',
  claimed_matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  claimed_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS needed — this is a public quarantine table accessed by service role only
-- Admin client bypasses RLS. The claim function runs with SECURITY DEFINER.

CREATE INDEX IF NOT EXISTS idx_vault_drops_session ON vault_drops (temp_session_id);
CREATE INDEX IF NOT EXISTS idx_vault_drops_hash ON vault_drops (content_hash);
CREATE INDEX IF NOT EXISTS idx_vault_drops_unclaimed ON vault_drops (temp_session_id)
  WHERE claimed_matter_id IS NULL;

-- ── 2. Claim function ───────────────────────────────────────────────────────
-- Called when an intake converts to a Matter. Moves orphaned vault drops
-- into the documents table and marks them as claimed.

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
    -- Note: documents uses file_name (varchar) + file_type (varchar), not display_name/mime_type/source
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
