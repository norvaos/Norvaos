-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 191: Scan-to-Autofill Pipeline (Directive 40.0)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds ai_extracted_data JSONB column to vault_drops table so that
-- auto-scanned vault drop files can persist their OCR extraction results
-- for intake form pre-filling.
--
-- The documents table already has ai_extracted_data (added in an earlier migration).
-- This migration ensures vault_drops (public, pre-matter uploads) also carry
-- scan data that can be transferred when the drop is "claimed" by a matter.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add ai_extracted_data to vault_drops if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vault_drops' AND column_name = 'ai_extracted_data'
  ) THEN
    ALTER TABLE vault_drops ADD COLUMN ai_extracted_data JSONB;
    COMMENT ON COLUMN vault_drops.ai_extracted_data IS 'OCR scan results from auto-scan: { detected_document_type, confidence, extracted_fields, raw_text_summary, scanned_at }';
  END IF;
END $$;

-- Ensure documents.ai_extracted_data exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'ai_extracted_data'
  ) THEN
    ALTER TABLE documents ADD COLUMN ai_extracted_data JSONB;
    COMMENT ON COLUMN documents.ai_extracted_data IS 'OCR/AI scan results: { detected_document_type, confidence, extracted_fields, raw_text_summary, scanned_at, scanned_by }';
  END IF;
END $$;

-- Index for efficient lookup of documents with scan data (for useScanPrefill)
CREATE INDEX IF NOT EXISTS idx_documents_ai_extracted_data_not_null
  ON documents (matter_id)
  WHERE ai_extracted_data IS NOT NULL;

-- Index for vault_drops with scan data
CREATE INDEX IF NOT EXISTS idx_vault_drops_ai_extracted_data_not_null
  ON vault_drops (temp_session_id)
  WHERE ai_extracted_data IS NOT NULL;
