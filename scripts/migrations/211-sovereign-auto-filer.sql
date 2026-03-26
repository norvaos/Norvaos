-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 211: Directive 040  -  Sovereign Auto-Filer
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds filing convention settings to tenants for the Sovereign Storage Engine.
-- Three presets: professional (by category), chronological (by date), flat (all-in-one).
--
-- Also adds auto_filed flag to documents table so we can track which docs
-- were renamed/filed by the engine vs manually uploaded.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Filing convention on tenants ──────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS filing_convention TEXT DEFAULT 'professional'
    CHECK (filing_convention IN ('professional', 'chronological', 'flat'));

COMMENT ON COLUMN tenants.filing_convention IS
  'Directive 040: Filing style for auto-filer. '
  'professional = by category, chronological = by date, flat = all-in-one';

-- ── 2. Auto-filed tracking on documents ──────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS auto_filed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_filed_path TEXT,
  ADD COLUMN IF NOT EXISTS original_file_name TEXT;

COMMENT ON COLUMN documents.auto_filed IS 'True if renamed/filed by the Sovereign Auto-Filer';
COMMENT ON COLUMN documents.auto_filed_path IS 'The structured directory path assigned by the auto-filer';
COMMENT ON COLUMN documents.original_file_name IS 'Original filename before auto-rename (for audit trail)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- END Migration 211
-- ═══════════════════════════════════════════════════════════════════════════════
