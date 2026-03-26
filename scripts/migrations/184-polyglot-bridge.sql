-- ============================================================================
-- Migration 184  -  Polyglot Bridge (Directive 14.0)
-- ============================================================================
-- Adds multilingual support columns for:
--   1. Norva Ear Neural Translation Layer (dual-language transcripts)
--   2. Client language preference tracking
--   3. Bilingual retainer metadata
-- ============================================================================

-- ── Norva Ear: translation columns ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'norva_ear_sessions' AND column_name = 'transcript_english') THEN
    ALTER TABLE norva_ear_sessions ADD COLUMN transcript_english TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'norva_ear_sessions' AND column_name = 'source_language') THEN
    ALTER TABLE norva_ear_sessions ADD COLUMN source_language VARCHAR(5) DEFAULT 'en';
  END IF;
END $$;

COMMENT ON COLUMN norva_ear_sessions.transcript_english IS 'English translation of transcript (NULL if consultation was in English)';
COMMENT ON COLUMN norva_ear_sessions.source_language IS 'ISO 639-1 code of the consultation language (en, fr, es, pa, zh, ar, etc.)';

-- ── Contact: language preference ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'preferred_language') THEN
    ALTER TABLE contacts ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'en';
  END IF;
END $$;

COMMENT ON COLUMN contacts.preferred_language IS 'Client preferred language for intake portal and communications (ISO 639-1)';

-- ── Matter: retainer language config ────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'retainer_language') THEN
    ALTER TABLE matters ADD COLUMN retainer_language VARCHAR(10) DEFAULT 'en';
  END IF;
END $$;

COMMENT ON COLUMN matters.retainer_language IS 'Language pair for retainer agreement (e.g. "en", "en-fr" for bilingual)';
