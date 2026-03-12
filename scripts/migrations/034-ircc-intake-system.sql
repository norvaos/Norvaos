-- Migration 034: IRCC Smart Intake System
-- Creates tables for IRCC form templates and questionnaire sessions.
-- The actual profile data is stored in contacts.immigration_data (JSONB).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. IRCC Form Templates — defines which profile fields each IRCC form needs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ircc_form_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_code     TEXT NOT NULL,            -- 'IMM5257', 'IMM5406', etc.
  form_name     TEXT NOT NULL,            -- 'Application for Visitor Visa'
  form_version  TEXT NOT NULL DEFAULT '1',
  description   TEXT,
  sections      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- sections: Array of { id, title, description, sort_order, fields: Array<FieldMapping> }
  -- FieldMapping: { profile_path, ircc_field_name, label, field_type, options, is_required, placeholder, description, sort_order }
  pdf_template_path TEXT,                 -- Path to blank IRCC PDF (Supabase Storage or /public)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, form_code, form_version)
);

CREATE INDEX IF NOT EXISTS idx_ircc_form_templates_tenant
  ON ircc_form_templates(tenant_id);

-- RLS
ALTER TABLE ircc_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_templates_tenant_isolation
  ON ircc_form_templates
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Allow anonymous read of active templates (for portal rendering)
CREATE POLICY ircc_form_templates_anon_read
  ON ircc_form_templates
  FOR SELECT
  TO anon
  USING (is_active = true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. IRCC Questionnaire Sessions — tracks data collection for a contact
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ircc_questionnaire_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  matter_id       UUID REFERENCES matters(id) ON DELETE SET NULL,
  form_codes      TEXT[] NOT NULL,         -- e.g. {'IMM5257','IMM5406'}
  status          TEXT NOT NULL DEFAULT 'in_progress',
  progress        JSONB DEFAULT '{}'::jsonb,  -- { completed_sections: [], current_section: '' }
  completed_at    TIMESTAMPTZ,
  portal_link_id  UUID,                    -- References portal_links if initiated via portal
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ircc_session_status_check CHECK (status IN ('in_progress','completed','abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_ircc_sessions_tenant
  ON ircc_questionnaire_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ircc_sessions_contact
  ON ircc_questionnaire_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_ircc_sessions_matter
  ON ircc_questionnaire_sessions(matter_id);

-- RLS
ALTER TABLE ircc_questionnaire_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_sessions_tenant_isolation
  ON ircc_questionnaire_sessions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Allow anonymous read/update for portal sessions (validated via portal_link_id)
CREATE POLICY ircc_sessions_anon_read
  ON ircc_questionnaire_sessions
  FOR SELECT
  TO anon
  USING (portal_link_id IS NOT NULL);

CREATE POLICY ircc_sessions_anon_update
  ON ircc_questionnaire_sessions
  FOR UPDATE
  TO anon
  USING (portal_link_id IS NOT NULL);

COMMIT;
