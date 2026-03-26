-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 210: Directive 033  -  Sovereign Brand Injection
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds branding fields to tenants for the Sovereign Letterhead Engine:
--   - signature_url: Principal's digital signature (transparent PNG)
--   - letterhead_layout: Layout preset ('classic' | 'modern' | 'minimal')
--   - legal_disclaimer: Mandatory footer disclaimer text
--
-- Also creates firm_branding_metadata for extended branding state:
--   - Tracks when branding was activated (brand_activated_at)
--   - Stores extracted dominant colour from logo
--   - Tracks letterhead version for cache-busting
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend tenants table with branding fields ─────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS letterhead_layout TEXT DEFAULT 'classic'
    CHECK (letterhead_layout IN ('classic', 'modern', 'minimal')),
  ADD COLUMN IF NOT EXISTS legal_disclaimer TEXT,
  ADD COLUMN IF NOT EXISTS brand_activated_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.signature_url IS 'URL to Principal Lawyer digital signature (transparent PNG in firm-assets bucket)';
COMMENT ON COLUMN tenants.letterhead_layout IS 'Letterhead preset: classic (logo left), modern (logo centre), minimal (text only)';
COMMENT ON COLUMN tenants.legal_disclaimer IS 'Mandatory legal disclaimer printed in document footers';
COMMENT ON COLUMN tenants.brand_activated_at IS 'Timestamp when the Sovereign Brand Identity was first activated';

-- ── 2. Firm branding metadata table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS firm_branding_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Logo analysis
  logo_dominant_color TEXT,           -- Hex colour extracted from logo (e.g. '#1a3b65')
  logo_width_px INT,
  logo_height_px INT,

  -- Letterhead versioning (cache-bust when branding changes)
  letterhead_version INT NOT NULL DEFAULT 1,

  -- Audit
  activated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id)
);

-- RLS
ALTER TABLE firm_branding_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_branding_metadata_tenant_isolation"
  ON firm_branding_metadata
  FOR ALL
  USING (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid()));

-- Index
CREATE INDEX IF NOT EXISTS idx_firm_branding_metadata_tenant
  ON firm_branding_metadata(tenant_id);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION fn_update_firm_branding_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firm_branding_metadata_updated ON firm_branding_metadata;
CREATE TRIGGER trg_firm_branding_metadata_updated
  BEFORE UPDATE ON firm_branding_metadata
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_firm_branding_metadata_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- END Migration 210
-- ═══════════════════════════════════════════════════════════════════════════════
