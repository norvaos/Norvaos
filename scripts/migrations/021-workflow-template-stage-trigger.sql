-- Migration 021: Add trigger_stage_id to workflow_templates
-- Allows workflow templates to be triggered when a matter enters a specific stage
-- (as opposed to only being triggered at matter creation via kit activation)

-- Add trigger_stage_id column
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS trigger_stage_id UUID REFERENCES matter_stages(id) ON DELETE SET NULL;

-- Index for fast lookup during stage advancement
CREATE INDEX IF NOT EXISTS idx_workflow_templates_trigger_stage
  ON workflow_templates (trigger_stage_id)
  WHERE trigger_stage_id IS NOT NULL AND is_active = TRUE;

-- Comment for documentation
COMMENT ON COLUMN workflow_templates.trigger_stage_id IS
  'When set, this template is auto-applied when a matter enters this stage. When NULL, template is applied at matter creation (kit activation).';
