-- 082: Portal Shared Documents
-- Adds columns to support firm-to-client document sharing via the portal.
-- client_viewed_at is set ONCE on first view and never overwritten.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_shared_with_client BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS shared_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_viewed_at TIMESTAMPTZ;

-- Composite index for portal shared document queries (matter-scoped, shared only)
CREATE INDEX IF NOT EXISTS idx_documents_shared_portal
  ON documents (matter_id, shared_at DESC)
  WHERE is_shared_with_client = true;
