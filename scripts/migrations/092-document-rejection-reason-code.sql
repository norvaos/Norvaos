-- ============================================================================
-- Migration 092: Add rejection_reason_code to document_versions
-- ============================================================================
-- Adds a structured rejection reason code to document_versions so the portal
-- can show translated, actionable guidance when a document is rejected.
-- The free-text review_reason is preserved for custom/additional notes.
-- ============================================================================

ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT
    CHECK (rejection_reason_code IN (
      'blurry',
      'corner_cut',
      'not_readable',
      'needs_translation',
      'wrong_document',
      'expired',
      'incomplete',
      'other'
    ));

COMMENT ON COLUMN document_versions.rejection_reason_code IS
  'Structured rejection reason code. Portal translates this into the client''s language with actionable guidance.';
