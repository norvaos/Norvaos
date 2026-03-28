-- Migration 225: Add consultation_fee_cents to matter_types
-- Supports the Revenue Engine: PostIgnitionHub shows dynamic fee on the booking button.

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS consultation_fee_cents INTEGER NOT NULL DEFAULT 25000;

COMMENT ON COLUMN matter_types.consultation_fee_cents
  IS 'Default consultation fee in cents (e.g. 25000 = $250). 0 means free consultation.';
