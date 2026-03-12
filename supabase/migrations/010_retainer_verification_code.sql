-- ============================================================================
-- Migration 010: Retainer Verification Code
--
-- Adds a verification code to retainer packages for paper-sign verification.
-- When a retainer is printed for paper signing, a unique code is generated
-- and embedded in the PDF. On upload of the scanned signed copy, the user
-- must enter this code to verify document authenticity.
-- ============================================================================

ALTER TABLE lead_retainer_packages
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT,
  ADD COLUMN IF NOT EXISTS signing_method TEXT CHECK (signing_method IN ('esign', 'paper'));

-- Index for fast lookup by verification code (used during paper-sign upload)
CREATE INDEX IF NOT EXISTS idx_retainer_packages_verification_code
  ON lead_retainer_packages (verification_code) WHERE verification_code IS NOT NULL;
