-- Migration 211: AI Intelligence Matrix (Directive 036)
-- Adds model_used column to ai_interactions (if missing),
-- adds ai_monthly_quota_cents to tenant settings,
-- and creates an index for usage dashboard queries.

-- ─── Ensure model_used column exists ────────────────────────────────────────
-- (Some environments already have it; this is idempotent.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_interactions' AND column_name = 'model_used'
  ) THEN
    ALTER TABLE ai_interactions ADD COLUMN model_used text;
  END IF;
END $$;

-- ─── Ensure cost_cents column exists ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_interactions' AND column_name = 'cost_cents'
  ) THEN
    ALTER TABLE ai_interactions ADD COLUMN cost_cents integer DEFAULT 0;
  END IF;
END $$;

-- ─── Ensure duration_ms column exists ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_interactions' AND column_name = 'duration_ms'
  ) THEN
    ALTER TABLE ai_interactions ADD COLUMN duration_ms integer;
  END IF;
END $$;

-- ─── Index for usage dashboard queries (tenant + date range) ────────────────
CREATE INDEX IF NOT EXISTS idx_ai_interactions_tenant_created
  ON ai_interactions (tenant_id, created_at DESC);

-- ─── Index for monthly quota calculation ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_interactions_tenant_month_cost
  ON ai_interactions (tenant_id, created_at)
  WHERE cost_cents IS NOT NULL AND cost_cents > 0;

-- ─── Add extracted_text to documents (for transcript/OCR storage) ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'extracted_text'
  ) THEN
    ALTER TABLE documents ADD COLUMN extracted_text text;
  END IF;
END $$;

-- ─── Add ai_metadata JSONB to documents (for OCR/transcript metadata) ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'ai_metadata'
  ) THEN
    ALTER TABLE documents ADD COLUMN ai_metadata jsonb;
  END IF;
END $$;

-- ─── Comment ────────────────────────────────────────────────────────────────
COMMENT ON COLUMN ai_interactions.model_used IS 'AI model identifier (whisper-v3-turbo, gemini-1.5-flash, gpt-4o-mini, claude-sonnet)';
COMMENT ON COLUMN ai_interactions.cost_cents IS 'Estimated cost in cents for this interaction';
