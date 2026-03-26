-- =============================================================================
-- Migration 213: Directive 044  -  Sovereign First-Path Onboarding
-- =============================================================================
--
-- Adds walkthrough tracking to the users table so the Emerald Path GPS
-- only activates on a user's first visit to a matter workspace.
--
-- Also adds ghost_document_templates for pre-rendering required doc placeholders.
-- =============================================================================

-- 1. Walkthrough flag on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_completed_onboarding_walkthrough BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.has_completed_onboarding_walkthrough IS
  'Directive 044: True once the user has completed the Emerald Path first-day walkthrough.';

-- 2. Ghost document defaults per matter type (for Sentinel Ghosting)
-- These define which documents should appear as greyed-out placeholders
-- before any file is uploaded, so the user sees "what's missing."
-- We store this as a JSONB column on matter_types rather than a separate table
-- since it's tightly coupled to the matter type definition.
ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS ghost_document_config JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN matter_types.ghost_document_config IS
  'Directive 044: Array of {slot_name, category, is_required} defining ghost doc placeholders.';

-- =============================================================================
-- END Migration 213
-- =============================================================================
