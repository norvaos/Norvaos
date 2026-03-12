-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 060: Add translatable descriptions
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds description_translations JSONB to ircc_forms and document_slot_templates.
-- Shape: { "fr": "...", "ar": "...", "es": "..." }
-- English stays in the existing `description` column.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ircc_forms
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}'::jsonb;

ALTER TABLE document_slot_templates
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}'::jsonb;
