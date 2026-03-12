-- 079: Add client visibility and requirement columns to ircc_form_fields
-- Supports dynamic questionnaire configuration from uploaded PDF form fields.

ALTER TABLE ircc_form_fields
  ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_client_required BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient portal queries
CREATE INDEX IF NOT EXISTS idx_ircc_form_fields_client_visible
  ON ircc_form_fields(form_id) WHERE is_client_visible = true;

-- Allow portal to reference DB form IDs alongside legacy form_codes
ALTER TABLE ircc_questionnaire_sessions
  ADD COLUMN IF NOT EXISTS form_ids UUID[] DEFAULT '{}';
