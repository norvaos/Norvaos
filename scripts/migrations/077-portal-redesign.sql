-- 077-portal-redesign.sql
-- Portal redesign: guided workspace with strict business rules
-- Adds columns for: matter-type default instructions, calendar client visibility,
-- message read tracking, and invoice "required before work" flag.

-- 1. Matter-type default portal instructions
-- Provides default instructions for all portal links created under this matter type.
-- Per-link metadata.instructions overrides these defaults entirely if set.
ALTER TABLE matter_types ADD COLUMN IF NOT EXISTS portal_instructions TEXT;

-- 2. Calendar client visibility
-- Allows internal events to be hidden from the client portal.
-- Default true so existing events remain visible (no breaking change).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN DEFAULT true;

-- 3. Message read tracking on portal links
-- Stores the last time the portal client viewed the messages section.
-- Messages with created_at > client_read_at are considered unread.
ALTER TABLE portal_links ADD COLUMN IF NOT EXISTS client_read_at TIMESTAMPTZ;

-- 4. Invoice "required before work" flag
-- When true, this invoice must be paid before the portal shows "awaiting review" state.
-- Default false so existing invoices don't block portal status.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS required_before_work BOOLEAN DEFAULT false;
