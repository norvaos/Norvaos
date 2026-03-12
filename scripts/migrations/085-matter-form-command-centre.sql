-- Migration 085: Matter Form Command Centre Integration
-- Adds columns to matters to link pipeline (from matter type), fee template,
-- and follow-up staff — all sourced from settings, never hardcoded.

-- 1. Matter stage pipeline: which pipeline (from matter_stage_pipelines) is active
--    for this matter. Derived from matter_type + user selection at creation.
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS matter_stage_pipeline_id UUID REFERENCES matter_stage_pipelines(id) ON DELETE SET NULL;

-- 2. Fee template: which retainer fee template was applied at creation
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS fee_template_id UUID REFERENCES retainer_fee_templates(id) ON DELETE SET NULL;

-- 3. Follow-up lawyer / staff: person responsible for client follow-up
--    (distinct from responsible_lawyer and originating_lawyer)
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS followup_lawyer_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Indexes for FK lookups and list filtering
CREATE INDEX IF NOT EXISTS idx_matters_matter_stage_pipeline_id ON matters(matter_stage_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_matters_fee_template_id ON matters(fee_template_id);
CREATE INDEX IF NOT EXISTS idx_matters_followup_lawyer_id ON matters(followup_lawyer_id);
