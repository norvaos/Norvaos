-- Migration 141: Lead Pipeline Stages — Win Probability, Colours, Descriptions, SLA
-- Updates all pipeline_stages rows by name to add:
--   win_probability, color, rotting_days, description, is_win_stage, is_lost_stage
-- Safe to re-run (uses UPDATE ... WHERE name = ...).
-- Applied: 2026-03-19

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVE / OPEN STAGES
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE pipeline_stages SET
  win_probability = 5,
  color           = '#94a3b8',
  rotting_days    = 1,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'A new inquiry has arrived and has not yet been contacted. Assign immediately — leads go cold within hours.'
WHERE name = 'New Inquiry';

UPDATE pipeline_stages SET
  win_probability = 12,
  color           = '#60a5fa',
  rotting_days    = 3,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Initial contact has been made. Goal: qualify the lead and book a consultation within 48 hours.'
WHERE name = 'Contacted';

UPDATE pipeline_stages SET
  win_probability = 32,
  color           = '#818cf8',
  rotting_days    = 5,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Consultation is scheduled. Send a confirmation, intake form link, and any preparation instructions. Confirm 24 hours before.'
WHERE name = 'Appointment Booked';

UPDATE pipeline_stages SET
  win_probability = 10,
  color           = '#fb923c',
  rotting_days    = 2,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Client did not attend the scheduled appointment. Attempt re-contact within 24 hours with a single reschedule offer.'
WHERE name = 'No-Show';

UPDATE pipeline_stages SET
  win_probability = 52,
  color           = '#3b82f6',
  rotting_days    = 5,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Consultation has taken place. Lawyer is assessing eligibility and preparing the retainer proposal. Record outcome in Command Centre.'
WHERE name = 'Appointment Completed';

UPDATE pipeline_stages SET
  win_probability = 70,
  color           = '#f59e0b',
  rotting_days    = 4,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Retainer agreement has been sent to the client. Follow up every 2 days. If not signed within the SLA, move to Follow-Up Active.'
WHERE name = 'Retainer Sent';

UPDATE pipeline_stages SET
  win_probability = 42,
  color           = '#eab308',
  rotting_days    = 7,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Client is considering — they have questions or need more time. Maintain warm contact. Schedule a follow-up call or meeting within 5 days.'
WHERE name = 'Follow-Up Active';

UPDATE pipeline_stages SET
  win_probability = 88,
  color           = '#7c3aed',
  rotting_days    = 3,
  is_win_stage    = false,
  is_lost_stage   = false,
  description     = 'Retainer is signed but payment has not been received. Collect payment immediately — do not begin legal work until payment is confirmed.'
WHERE name = 'Retainer Signed – Payment Pending';

UPDATE pipeline_stages SET
  win_probability  = 100,
  color            = '#22c55e',
  rotting_days     = NULL,
  is_win_stage     = true,
  is_lost_stage    = false,
  description      = 'Client is fully retained — retainer signed AND payment received. Lead auto-converts to an active matter. Legal work may begin.'
WHERE name = 'Retained – Active Matter';

-- ─────────────────────────────────────────────────────────────────────────────
-- CLOSED / LOST STAGES
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE pipeline_stages SET
  win_probability = 0,
  color           = '#9ca3af',
  rotting_days    = NULL,
  is_win_stage    = false,
  is_lost_stage   = true,
  description     = 'Client became unresponsive after initial contact or consultation. After 3 unanswered attempts across 2 channels, close as no response.'
WHERE name = 'Closed – No Response';

UPDATE pipeline_stages SET
  win_probability = 0,
  color           = '#f87171',
  rotting_days    = NULL,
  is_win_stage    = false,
  is_lost_stage   = true,
  description     = 'Client reviewed the retainer but chose not to sign. Note the stated reason (cost, timing, seeking other representation).'
WHERE name = 'Closed – Retainer Not Signed';

UPDATE pipeline_stages SET
  win_probability = 0,
  color           = '#ef4444',
  rotting_days    = NULL,
  is_win_stage    = false,
  is_lost_stage   = true,
  description     = 'Client explicitly declined to proceed after consultation. Record the decline reason for pipeline reporting and future outreach strategy.'
WHERE name = 'Closed – Client Declined';

UPDATE pipeline_stages SET
  win_probability = 0,
  color           = '#dc2626',
  rotting_days    = NULL,
  is_win_stage    = false,
  is_lost_stage   = true,
  description     = 'The client''s matter is outside the firm''s practice areas, expertise, or ethical capacity. Document the reason for referral or declination.'
WHERE name = 'Closed – Not a Fit';

UPDATE pipeline_stages SET
  win_probability  = 100,
  color            = '#10b981',
  rotting_days     = NULL,
  is_win_stage     = true,
  is_lost_stage    = false,
  description      = 'Matter completed successfully for a small/routine file (visitor visa, study permit extension, etc.). Mark for post-matter review and feedback request.'
WHERE name = 'Closed - Matter Completed - Small';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (run after applying to confirm)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT name, win_probability, color, rotting_days, is_win_stage, is_lost_stage
-- FROM pipeline_stages
-- ORDER BY sort_order;
