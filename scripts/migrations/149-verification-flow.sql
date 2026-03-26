-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 149: Verification Flow  -  Field & Document Locking
--
-- Adds verification_status + rejection_reason to field_verifications and
-- document_slots so lawyers can verify or reject individual fields/documents.
-- Verified items become read-only in the Client Portal; rejected items are
-- highlighted for correction.
--
-- Status enum: pending | submitted | verified | rejected
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── field_verifications: add verification_status & rejection_reason ──────────

ALTER TABLE field_verifications
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill: existing rows were created by the verify action, so they are 'verified'.
-- The DEFAULT 'verified' handles this.

-- ── document_slots: add verification columns ─────────────────────────────────

ALTER TABLE document_slots
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

-- ── Indexes for portal queries ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_field_verifications_status
  ON field_verifications (matter_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_document_slots_verification
  ON document_slots (matter_id, verification_status)
  WHERE verification_status IS NOT NULL;

-- ── Add new activity types for the verification flow ─────────────────────────
-- (activity_type is a VARCHAR(30), no enum constraint  -  just documenting)
-- New types: field_verified, field_rejected, document_verified, document_rejected

COMMIT;
