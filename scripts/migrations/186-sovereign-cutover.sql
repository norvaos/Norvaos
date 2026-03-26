/**
 * Migration 186 — Sovereign Cutover (Directive 35.1)
 *
 * The "God-Switch": Flips tenants from Clio-Legacy safety mode to the
 * Sovereign Workspace (Intelligence Hub + Global 15 + Fact-Anchors).
 *
 * 1. Adds ui_version and global_15_enabled to tenants.settings JSONB
 * 2. Adds intelligence_hub feature flag to tenants.feature_flags JSONB
 * 3. Adds preferred_view column to leads (workspace_shell vs legacy)
 * 4. Sets Elevated/Priority leads to default to workspace_shell view
 *
 * Safe: All operations use COALESCE/jsonb_set with fallbacks.
 * Reversible: Set ui_version back to 'v1-legacy' to revert.
 */

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Elevate ALL tenants to Sovereign UI (v2)
--    Writes into the existing settings JSONB column on tenants.
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE tenants
SET settings = jsonb_set(
      jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{ui_version}',
        '"v2-sovereign"'
      ),
      '{global_15_enabled}',
      'true'
    ),
    updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Enable intelligence_hub feature flag for all tenants
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE tenants
SET feature_flags = jsonb_set(
      COALESCE(feature_flags, '{}'::jsonb),
      '{intelligence_hub}',
      'true'
    )
WHERE feature_flags IS NULL
   OR NOT (feature_flags ? 'intelligence_hub');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Add preferred_view column to leads
--    Defaults to 'workspace_shell' (Sovereign). Legacy is 'lead_view'.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS preferred_view TEXT NOT NULL DEFAULT 'workspace_shell';

COMMENT ON COLUMN leads.preferred_view IS
  'UI view preference: workspace_shell (Sovereign) or lead_view (Legacy). Directive 35.1.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Force Elevated/Priority leads to the Sovereign Workspace
--    temperature = ''warm'' maps to "Elevated" in the UI constants.
--    temperature = ''hot'' maps to "Critical".
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE leads
SET preferred_view = 'workspace_shell'
WHERE temperature IN ('warm', 'hot')
  AND (preferred_view IS NULL OR preferred_view = 'lead_view');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Add index for preferred_view lookups (RouteGuard queries this)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_leads_preferred_view
  ON leads (preferred_view)
  WHERE preferred_view = 'workspace_shell';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Ensure ai_drafts table exists (Ghost-Writer / First-Hour metrics depend on it)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id     UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  draft_type    TEXT NOT NULL DEFAULT 'submission_letter',
  title         TEXT,
  content       TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'verified', 'sent', 'archived')),
  hitl_checks   JSONB DEFAULT '{}'::jsonb,
  verified_by   UUID REFERENCES users(id),
  verified_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_drafts' AND policyname = 'ai_drafts_tenant_isolation'
  ) THEN
    CREATE POLICY ai_drafts_tenant_isolation ON ai_drafts
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_drafts_matter ON ai_drafts (matter_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_tenant_created ON ai_drafts (tenant_id, created_at DESC);

COMMIT;
