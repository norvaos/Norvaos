-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 068  -  Section Field-Level Config & Custom Fields
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds two JSONB columns to matter_type_section_config:
--   1. field_config   -  controls visibility of individual fields per section
--   2. custom_fields  -  defines additional custom fields per section
--
-- Also adds ircc_question_set_codes to matter_types for Phase 3 (IRCC question
-- set assignment per matter type).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add field_config and custom_fields columns ────────────────────────────

ALTER TABLE matter_type_section_config
  ADD COLUMN IF NOT EXISTS field_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';

COMMENT ON COLUMN matter_type_section_config.field_config IS
  'Per-field visibility toggles: { "passport_number": { "visible": false } }';

COMMENT ON COLUMN matter_type_section_config.custom_fields IS
  'Custom field definitions: [{ "key": "uci_number", "label": "UCI Number", "type": "text", "required": false }]';


-- ── 2. Add ircc_question_set_codes to matter_types ───────────────────────────

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS ircc_question_set_codes TEXT[] DEFAULT '{}';

COMMENT ON COLUMN matter_types.ircc_question_set_codes IS
  'IRCC form codes configured for this matter type (e.g., IMM5257, IMM5406)';


-- ── 3. Add portal_visible to appointments ────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN appointments.portal_visible IS
  'Whether this appointment is visible in the client portal';


-- ── 4. Index for portal task queries ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_matter_visibility
  ON tasks(matter_id, visibility) WHERE is_deleted = false;
