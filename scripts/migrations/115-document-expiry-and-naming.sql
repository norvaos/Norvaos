-- 115-document-expiry-and-naming.sql
-- Adds expiry tracking to document_slots and naming template to matter_types.

ALTER TABLE document_slots
  ADD COLUMN IF NOT EXISTS expiry_date date;

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS document_naming_template text;

COMMENT ON COLUMN document_slots.expiry_date IS
  'Optional expiry date for this document slot. NULL = no expiry. Used for passport, visa, work permit tracking.';
COMMENT ON COLUMN matter_types.document_naming_template IS
  'Token template for auto-naming uploaded files. Example: {matter_number}_{slot_name}_{date}. NULL = no auto-naming.';
