-- ============================================================
-- 143: Rebuild "Core Intake & Retainer Pipeline" Stages
-- ============================================================
-- Renames existing stages to match the firm's desired pipeline:
--   1  New Inquiry              (5%)
--   2  Contacted                (15%)
--   3  Appointment Booked       (32%)
--   4  No-Show                  (10%)
--   5  Appointment Completed    (52%)
--   6  Retainer Sent            (70%)
--   7  Follow-Up Active         (42%)  ← NEW
--   8  Retainer Signed – Payment Pending  (88%)
--   9  Retained – Active Matter (100% WIN)
--  10  Closed – No Response     (0% LOST)
--  11  Closed – Retainer Not Signed (0% LOST)
--  12  Closed – Client Declined (0% LOST)
--  13  Closed – Not a Fit       (0% LOST)
--  14  Closed – Matter Completed – Small (100% WIN)
--
-- Strategy: UPDATE existing rows (preserves IDs → preserves
-- lead.stage_id FK references).  INSERT only the new
-- "Follow-Up Active" stage.
-- Safe to re-run — all operations are idempotent.
-- ============================================================

DO $$
DECLARE
  v_pip_id   UUID;
  v_tenant_id UUID;
BEGIN
  -- ── Locate the pipeline ──────────────────────────────────
  SELECT id, tenant_id INTO v_pip_id, v_tenant_id
    FROM pipelines
   WHERE name = 'Core Intake & Retainer Pipeline'
   LIMIT 1;

  IF v_pip_id IS NULL THEN
    RAISE NOTICE '[143] No "Core Intake & Retainer Pipeline" found — skipping.';
    RETURN;
  END IF;

  RAISE NOTICE '[143] Rebuilding stages for pipeline % (tenant %)', v_pip_id, v_tenant_id;

  -- ── 1. New Inquiry — keep name, update values ─────────────
  UPDATE pipeline_stages SET
    sort_order      = 1,
    win_probability = 5,
    color           = '#94a3b8',
    rotting_days    = 1,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'A new enquiry has arrived and has not yet been contacted. Assign immediately — leads go cold within hours.'
  WHERE pipeline_id = v_pip_id AND name = 'New Inquiry';

  -- ── 2. Contact Attempted → Contacted ────────────────────
  UPDATE pipeline_stages SET
    name            = 'Contacted',
    sort_order      = 2,
    win_probability = 15,
    color           = '#60a5fa',
    rotting_days    = 3,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Initial contact made. Goal: qualify the lead and book a consultation within 48 hours.'
  WHERE pipeline_id = v_pip_id AND name = 'Contact Attempted';

  -- ── 3. Contacted – Qualification Complete → Appointment Booked
  UPDATE pipeline_stages SET
    name            = 'Appointment Booked',
    sort_order      = 3,
    win_probability = 32,
    color           = '#818cf8',
    rotting_days    = 5,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Consultation scheduled. Send confirmation, intake form link, and prep instructions. Confirm 24 hours before.'
  WHERE pipeline_id = v_pip_id AND name = 'Contacted – Qualification Complete';

  -- ── 4. Consultation Booked → No-Show ────────────────────
  UPDATE pipeline_stages SET
    name            = 'No-Show',
    sort_order      = 4,
    win_probability = 10,
    color           = '#fb923c',
    rotting_days    = 2,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Client did not attend the scheduled appointment. Attempt re-contact within 24 hours with a single reschedule offer.'
  WHERE pipeline_id = v_pip_id AND name = 'Consultation Booked';

  -- ── 5. Consultation Completed → Appointment Completed ───
  -- (may have a leading space — use TRIM or LIKE)
  UPDATE pipeline_stages SET
    name            = 'Appointment Completed',
    sort_order      = 5,
    win_probability = 52,
    color           = '#3b82f6',
    rotting_days    = 5,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Consultation completed. Lawyer assessing eligibility and preparing retainer proposal. Record outcome in Command Centre.'
  WHERE pipeline_id = v_pip_id AND TRIM(name) = 'Consultation Completed';

  -- ── 6. Retainer Sent — fix leading space, update values ──
  UPDATE pipeline_stages SET
    name            = 'Retainer Sent',
    sort_order      = 6,
    win_probability = 70,
    color           = '#f59e0b',
    rotting_days    = 4,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Retainer sent to client. Follow up every 2 days. If not signed within the SLA, move to Follow-Up Active.'
  WHERE pipeline_id = v_pip_id AND TRIM(name) = 'Retainer Sent';

  -- ── 7. INSERT Follow-Up Active (new stage) ────────────────
  INSERT INTO pipeline_stages
    (tenant_id, pipeline_id, name, sort_order, win_probability, color, rotting_days, is_win_stage, is_lost_stage, description)
  VALUES
    (v_tenant_id, v_pip_id, 'Follow-Up Active', 7, 42, '#eab308', 7, false, false,
     'Client is considering — has questions or needs more time. Maintain warm contact. Schedule a follow-up call within 5 days.')
  ON CONFLICT DO NOTHING;

  -- If already exists with different values, update it
  UPDATE pipeline_stages SET
    sort_order      = 7,
    win_probability = 42,
    color           = '#eab308',
    rotting_days    = 7,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Client is considering — has questions or needs more time. Maintain warm contact. Schedule a follow-up call within 5 days.'
  WHERE pipeline_id = v_pip_id AND name = 'Follow-Up Active';

  -- ── 8. Retainer Signed – Payment Pending — fix space/sort ─
  UPDATE pipeline_stages SET
    name            = 'Retainer Signed – Payment Pending',
    sort_order      = 8,
    win_probability = 88,
    color           = '#7c3aed',
    rotting_days    = 3,
    is_win_stage    = false,
    is_lost_stage   = false,
    description     = 'Retainer signed but payment not received. Collect immediately — do not begin legal work until payment confirmed.'
  WHERE pipeline_id = v_pip_id AND TRIM(name) = 'Retainer Signed – Payment Pending';

  -- ── 9. Retained – Active Matter ─────────────────────────
  UPDATE pipeline_stages SET
    sort_order      = 9,
    win_probability = 100,
    color           = '#22c55e',
    rotting_days    = NULL,
    is_win_stage    = true,
    is_lost_stage   = false,
    description     = 'Client fully retained — retainer signed AND payment received. Lead auto-converts to an active matter. Legal work may begin.'
  WHERE pipeline_id = v_pip_id AND name = 'Retained – Active Matter';

  -- ── 10-13. Closed (lost) stages — update sort orders ─────
  UPDATE pipeline_stages SET sort_order = 10, win_probability = 0, color = '#9ca3af',
    is_win_stage = false, is_lost_stage = true, rotting_days = NULL,
    description = 'Client became unresponsive. After 3 unanswered attempts across 2 channels, close as no response.'
  WHERE pipeline_id = v_pip_id AND name = 'Closed – No Response';

  UPDATE pipeline_stages SET sort_order = 11, win_probability = 0, color = '#f87171',
    is_win_stage = false, is_lost_stage = true, rotting_days = NULL,
    description = 'Client reviewed the retainer but chose not to sign. Note the stated reason.'
  WHERE pipeline_id = v_pip_id AND name = 'Closed – Retainer Not Signed';

  UPDATE pipeline_stages SET sort_order = 12, win_probability = 0, color = '#ef4444',
    is_win_stage = false, is_lost_stage = true, rotting_days = NULL,
    description = 'Client explicitly declined to proceed after consultation. Record the decline reason.'
  WHERE pipeline_id = v_pip_id AND name = 'Closed – Client Declined';

  UPDATE pipeline_stages SET sort_order = 13, win_probability = 0, color = '#dc2626',
    is_win_stage = false, is_lost_stage = true, rotting_days = NULL,
    description = 'Matter outside firm''s practice areas, expertise, or ethical capacity. Document the reason.'
  WHERE pipeline_id = v_pip_id AND name = 'Closed – Not a Fit';

  -- ── 14. Closed – Matter Completed – Small (WIN) ──────────
  UPDATE pipeline_stages SET
    sort_order      = 14,
    win_probability = 100,
    color           = '#10b981',
    rotting_days    = NULL,
    is_win_stage    = true,
    is_lost_stage   = false,
    description     = 'Matter completed successfully for a small/routine file. Mark for post-matter review and feedback request.'
  WHERE pipeline_id = v_pip_id AND TRIM(name) ILIKE '%Matter Completed%Small%';

  RAISE NOTICE '[143] Pipeline stages rebuilt successfully for %', v_pip_id;
END;
$$;
