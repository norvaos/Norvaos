-- Migration 219: Sovereign Conflict Shield (Directive 066)
-- Adds conflict-of-interest tracking to matters.
-- Three states: CLEARED, CONFLICT_FOUND, WAIVER_PENDING
-- Law Society compliance: every conflict certification is audit-logged.

-- Add conflict columns to matters
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS conflict_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (conflict_status IN ('pending', 'cleared', 'conflict_found', 'waiver_pending', 'waiver_approved')),
  ADD COLUMN IF NOT EXISTS conflict_certified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS conflict_certified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_waiver_document_id UUID REFERENCES documents(id),
  ADD COLUMN IF NOT EXISTS conflict_waiver_approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS conflict_waiver_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_notes TEXT;

-- Index for filtering matters by conflict status
CREATE INDEX IF NOT EXISTS idx_matters_conflict_status
  ON matters (tenant_id, conflict_status)
  WHERE conflict_status != 'cleared';

-- RLS: conflict columns inherit existing matters RLS policies (no new policy needed)

COMMENT ON COLUMN matters.conflict_status IS 'Directive 066: pending | cleared | conflict_found | waiver_pending | waiver_approved';
COMMENT ON COLUMN matters.conflict_certified_by IS 'User who certified the conflict search was performed';
COMMENT ON COLUMN matters.conflict_certified_at IS 'Timestamp of conflict certification';
COMMENT ON COLUMN matters.conflict_waiver_document_id IS 'Uploaded waiver document when conflict exists';
