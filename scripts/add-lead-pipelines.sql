-- Add practice-area-specific lead pipelines for My Law Office
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  v_tenant_id UUID := 'da1788a2-8baa-4aa5-9733-97510944afac';
  v_pipeline_imm UUID;
  v_pipeline_fam UUID;
  v_pipeline_re UUID;
BEGIN
  -- =========================================================================
  -- Immigration Lead Pipeline
  -- =========================================================================
  INSERT INTO pipelines (tenant_id, name, pipeline_type, practice_area, is_default, is_active)
  VALUES (v_tenant_id, 'Immigration Lead Pipeline', 'lead', 'Immigration', false, true)
  RETURNING id INTO v_pipeline_imm;

  INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days, is_win_stage, is_lost_stage)
  VALUES
    (v_pipeline_imm, v_tenant_id, 'Inquiry Received',        '#94a3b8', 0, 10,  2, false, false),
    (v_pipeline_imm, v_tenant_id, 'Eligibility Assessment',  '#3b82f6', 1, 25,  5, false, false),
    (v_pipeline_imm, v_tenant_id, 'Consultation Scheduled',  '#8b5cf6', 2, 50,  7, false, false),
    (v_pipeline_imm, v_tenant_id, 'Retainer Sent',           '#f59e0b', 3, 75, 10, false, false),
    (v_pipeline_imm, v_tenant_id, 'Retained',                '#22c55e', 4, 100, NULL, true,  false),
    (v_pipeline_imm, v_tenant_id, 'Not Eligible / Lost',     '#ef4444', 5, 0,   NULL, false, true);

  -- =========================================================================
  -- Family Law Lead Pipeline
  -- =========================================================================
  INSERT INTO pipelines (tenant_id, name, pipeline_type, practice_area, is_default, is_active)
  VALUES (v_tenant_id, 'Family Law Lead Pipeline', 'lead', 'Family Law', false, true)
  RETURNING id INTO v_pipeline_fam;

  INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days, is_win_stage, is_lost_stage)
  VALUES
    (v_pipeline_fam, v_tenant_id, 'Initial Contact',     '#94a3b8', 0, 10,  2, false, false),
    (v_pipeline_fam, v_tenant_id, 'Conflict Check',      '#3b82f6', 1, 25,  3, false, false),
    (v_pipeline_fam, v_tenant_id, 'Consultation Booked', '#8b5cf6', 2, 50,  7, false, false),
    (v_pipeline_fam, v_tenant_id, 'Retainer Proposal',   '#f59e0b', 3, 75, 10, false, false),
    (v_pipeline_fam, v_tenant_id, 'Retained',            '#22c55e', 4, 100, NULL, true,  false),
    (v_pipeline_fam, v_tenant_id, 'Declined / Lost',     '#ef4444', 5, 0,   NULL, false, true);

  -- =========================================================================
  -- Real Estate Lead Pipeline
  -- =========================================================================
  INSERT INTO pipelines (tenant_id, name, pipeline_type, practice_area, is_default, is_active)
  VALUES (v_tenant_id, 'Real Estate Lead Pipeline', 'lead', 'Real Estate', false, true)
  RETURNING id INTO v_pipeline_re;

  INSERT INTO pipeline_stages (pipeline_id, tenant_id, name, color, sort_order, win_probability, rotting_days, is_win_stage, is_lost_stage)
  VALUES
    (v_pipeline_re, v_tenant_id, 'New Inquiry',            '#94a3b8', 0, 10,  2, false, false),
    (v_pipeline_re, v_tenant_id, 'Property Review',        '#3b82f6', 1, 25,  5, false, false),
    (v_pipeline_re, v_tenant_id, 'Consultation Scheduled', '#8b5cf6', 2, 50,  7, false, false),
    (v_pipeline_re, v_tenant_id, 'Quote Provided',         '#f59e0b', 3, 75, 10, false, false),
    (v_pipeline_re, v_tenant_id, 'Retained',               '#22c55e', 4, 100, NULL, true,  false),
    (v_pipeline_re, v_tenant_id, 'Lost',                   '#ef4444', 5, 0,   NULL, false, true);

  RAISE NOTICE 'Created 3 practice-area lead pipelines with 18 stages total';
END $$;
