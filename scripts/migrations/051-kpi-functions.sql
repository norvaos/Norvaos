-- ============================================================================
-- Migration 051: KPI Computation Functions
-- Functions: compute_shift_kpis(), compute_checkin_response_times()
-- Depends on: 050 (front_desk_shifts, front_desk_events, workflow_actions.shift_id)
-- ============================================================================

BEGIN;

-- ─── 1. compute_shift_kpis ──────────────────────────────────────────────────
-- Aggregates all KPI-relevant metrics for a single shift.
-- Called by GET /api/front-desk/kpis?shiftId=X
-- Returns a JSONB object with raw metric values — threshold evaluation
-- happens in application code (lib/services/front-desk-kpis.ts).

CREATE OR REPLACE FUNCTION compute_shift_kpis(p_shift_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_shift       RECORD;
  v_result      JSONB;
  v_total_actions    INTEGER;
  v_check_ins        INTEGER;
  v_calls_logged     INTEGER;
  v_tasks_completed  INTEGER;
  v_intakes_created  INTEGER;
  v_appointments_managed INTEGER;
  v_notes_created    INTEGER;
  v_emails_logged    INTEGER;
  v_meetings_logged  INTEGER;
  v_notify_staff     INTEGER;
  v_duration_minutes NUMERIC;
  v_idle_minutes     NUMERIC;
  v_heartbeat_count  INTEGER;
  v_search_count     INTEGER;
  v_contact_opened   INTEGER;
  v_queue_viewed     INTEGER;
BEGIN
  -- Get shift metadata
  SELECT id, user_id, tenant_id, started_at, ended_at,
         EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60.0 AS duration_min
  INTO v_shift
  FROM front_desk_shifts
  WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Shift not found');
  END IF;

  v_duration_minutes := v_shift.duration_min;

  -- ── Count actions from workflow_actions linked to this shift ──
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_check_in'),
    COUNT(*) FILTER (WHERE action_type IN ('front_desk_log_call')),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_complete_task'),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_create_intake'),
    COUNT(*) FILTER (WHERE action_type IN ('front_desk_book_appointment', 'front_desk_reschedule', 'front_desk_cancel_no_show')),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_note'),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_log_email'),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_log_meeting'),
    COUNT(*) FILTER (WHERE action_type = 'front_desk_notify_staff')
  INTO
    v_total_actions,
    v_check_ins,
    v_calls_logged,
    v_tasks_completed,
    v_intakes_created,
    v_appointments_managed,
    v_notes_created,
    v_emails_logged,
    v_meetings_logged,
    v_notify_staff
  FROM workflow_actions
  WHERE shift_id = p_shift_id;

  -- ── Count events from front_desk_events linked to this shift ──
  SELECT
    COALESCE(SUM(
      CASE WHEN event_type = 'idle_gap'
        THEN (event_data->>'duration_minutes')::NUMERIC
        ELSE 0
      END
    ), 0),
    COUNT(*) FILTER (WHERE event_type = 'heartbeat'),
    COUNT(*) FILTER (WHERE event_type = 'search_submitted'),
    COUNT(*) FILTER (WHERE event_type = 'contact_opened'),
    COUNT(*) FILTER (WHERE event_type = 'queue_viewed')
  INTO
    v_idle_minutes,
    v_heartbeat_count,
    v_search_count,
    v_contact_opened,
    v_queue_viewed
  FROM front_desk_events
  WHERE shift_id = p_shift_id;

  -- ── Build result ──
  v_result := jsonb_build_object(
    'shift_id', v_shift.id,
    'user_id', v_shift.user_id,
    'tenant_id', v_shift.tenant_id,
    'started_at', v_shift.started_at,
    'ended_at', v_shift.ended_at,
    'shift_duration_minutes', ROUND(v_duration_minutes, 1),

    -- Action counts
    'total_actions', v_total_actions,
    'actions_per_hour', CASE
      WHEN v_duration_minutes > 0 THEN ROUND((v_total_actions::NUMERIC / (v_duration_minutes / 60.0)), 1)
      ELSE 0
    END,
    'check_ins_processed', v_check_ins,
    'calls_logged', v_calls_logged,
    'tasks_completed', v_tasks_completed,
    'intakes_created', v_intakes_created,
    'appointments_managed', v_appointments_managed,
    'notes_created', v_notes_created,
    'emails_logged', v_emails_logged,
    'meetings_logged', v_meetings_logged,
    'notify_staff_count', v_notify_staff,

    -- Derived metrics
    'idle_time_minutes', ROUND(v_idle_minutes, 1),
    'active_time_minutes', ROUND(GREATEST(v_duration_minutes - v_idle_minutes, 0), 1),
    'idle_time_ratio', CASE
      WHEN v_duration_minutes > 0 THEN ROUND((v_idle_minutes / v_duration_minutes) * 100, 1)
      ELSE 0
    END,

    -- Event counts
    'heartbeat_count', v_heartbeat_count,
    'search_count', v_search_count,
    'contacts_opened', v_contact_opened,
    'queue_views', v_queue_viewed
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. compute_checkin_response_times ──────────────────────────────────────
-- Calculates check-in → notify_staff response times for a shift.
-- Measures how quickly the front desk staff handles walk-ins.
-- Returns avg and p95 response times in minutes.

CREATE OR REPLACE FUNCTION compute_checkin_response_times(p_shift_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_times      NUMERIC[];
  v_avg        NUMERIC;
  v_p95        NUMERIC;
  v_count      INTEGER;
  rec          RECORD;
BEGIN
  v_times := ARRAY[]::NUMERIC[];

  -- For each check-in action on this shift, find the time from
  -- check_in_sessions.created_at to the first notify_staff action
  FOR rec IN
    SELECT
      ci.created_at AS checkin_at,
      (
        SELECT MIN(wa2.created_at)
        FROM workflow_actions wa2
        WHERE wa2.shift_id = p_shift_id
          AND wa2.action_type = 'front_desk_notify_staff'
          AND wa2.status = 'completed'
          -- Match by contact_id in action_config
          AND wa2.action_config->>'contactId' = wa.action_config->>'contactId'
          AND wa2.created_at >= ci.created_at
      ) AS first_notify_at
    FROM workflow_actions wa
    JOIN check_in_sessions ci ON ci.id = (wa.action_config->>'sessionId')::UUID
    WHERE wa.shift_id = p_shift_id
      AND wa.action_type = 'front_desk_check_in'
      AND wa.status = 'completed'
  LOOP
    IF rec.first_notify_at IS NOT NULL THEN
      v_times := array_append(v_times,
        EXTRACT(EPOCH FROM (rec.first_notify_at - rec.checkin_at)) / 60.0
      );
    END IF;
  END LOOP;

  v_count := array_length(v_times, 1);

  IF v_count IS NULL OR v_count = 0 THEN
    RETURN jsonb_build_object(
      'count', 0,
      'avg_minutes', NULL,
      'p95_minutes', NULL
    );
  END IF;

  -- Sort for percentile
  SELECT array_agg(t ORDER BY t)
  INTO v_times
  FROM unnest(v_times) AS t;

  -- Calculate avg
  SELECT AVG(t) INTO v_avg FROM unnest(v_times) AS t;

  -- Calculate p95
  v_p95 := v_times[GREATEST(CEIL(v_count * 0.95)::INTEGER, 1)];

  RETURN jsonb_build_object(
    'count', v_count,
    'avg_minutes', ROUND(v_avg, 1),
    'p95_minutes', ROUND(v_p95, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. compute_day_kpis ────────────────────────────────────────────────────
-- Aggregates KPIs across all shifts for a user on a given date.
-- Used by the admin dashboard for daily summaries.

CREATE OR REPLACE FUNCTION compute_day_kpis(
  p_user_id UUID,
  p_date    DATE
)
RETURNS JSONB AS $$
DECLARE
  v_shift_ids  UUID[];
  v_merged     JSONB := '{}'::JSONB;
  v_shift_kpis JSONB;
  v_sid        UUID;
  v_total_actions     INTEGER := 0;
  v_total_checkins    INTEGER := 0;
  v_total_calls       INTEGER := 0;
  v_total_tasks       INTEGER := 0;
  v_total_intakes     INTEGER := 0;
  v_total_appts       INTEGER := 0;
  v_total_notes       INTEGER := 0;
  v_total_emails      INTEGER := 0;
  v_total_meetings    INTEGER := 0;
  v_total_duration    NUMERIC := 0;
  v_total_idle        NUMERIC := 0;
  v_shift_count       INTEGER := 0;
BEGIN
  -- Get all shift IDs for this user on this date
  SELECT array_agg(id)
  INTO v_shift_ids
  FROM front_desk_shifts
  WHERE user_id = p_user_id
    AND shift_date = p_date;

  IF v_shift_ids IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'date', p_date,
      'shift_count', 0,
      'total_actions', 0,
      'message', 'No shifts found for this date'
    );
  END IF;

  v_shift_count := array_length(v_shift_ids, 1);

  -- Aggregate across shifts
  FOREACH v_sid IN ARRAY v_shift_ids LOOP
    v_shift_kpis := compute_shift_kpis(v_sid);

    v_total_actions  := v_total_actions  + COALESCE((v_shift_kpis->>'total_actions')::INTEGER, 0);
    v_total_checkins := v_total_checkins + COALESCE((v_shift_kpis->>'check_ins_processed')::INTEGER, 0);
    v_total_calls    := v_total_calls    + COALESCE((v_shift_kpis->>'calls_logged')::INTEGER, 0);
    v_total_tasks    := v_total_tasks    + COALESCE((v_shift_kpis->>'tasks_completed')::INTEGER, 0);
    v_total_intakes  := v_total_intakes  + COALESCE((v_shift_kpis->>'intakes_created')::INTEGER, 0);
    v_total_appts    := v_total_appts    + COALESCE((v_shift_kpis->>'appointments_managed')::INTEGER, 0);
    v_total_notes    := v_total_notes    + COALESCE((v_shift_kpis->>'notes_created')::INTEGER, 0);
    v_total_emails   := v_total_emails   + COALESCE((v_shift_kpis->>'emails_logged')::INTEGER, 0);
    v_total_meetings := v_total_meetings + COALESCE((v_shift_kpis->>'meetings_logged')::INTEGER, 0);
    v_total_duration := v_total_duration + COALESCE((v_shift_kpis->>'shift_duration_minutes')::NUMERIC, 0);
    v_total_idle     := v_total_idle     + COALESCE((v_shift_kpis->>'idle_time_minutes')::NUMERIC, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'date', p_date,
    'shift_count', v_shift_count,
    'shift_ids', to_jsonb(v_shift_ids),
    'total_actions', v_total_actions,
    'actions_per_hour', CASE
      WHEN v_total_duration > 0 THEN ROUND((v_total_actions::NUMERIC / (v_total_duration / 60.0)), 1)
      ELSE 0
    END,
    'check_ins_processed', v_total_checkins,
    'calls_logged', v_total_calls,
    'tasks_completed', v_total_tasks,
    'intakes_created', v_total_intakes,
    'appointments_managed', v_total_appts,
    'notes_created', v_total_notes,
    'emails_logged', v_total_emails,
    'meetings_logged', v_total_meetings,
    'total_duration_minutes', ROUND(v_total_duration, 1),
    'total_idle_minutes', ROUND(v_total_idle, 1),
    'total_active_minutes', ROUND(GREATEST(v_total_duration - v_total_idle, 0), 1),
    'idle_time_ratio', CASE
      WHEN v_total_duration > 0 THEN ROUND((v_total_idle / v_total_duration) * 100, 1)
      ELSE 0
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Grants ──────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION compute_shift_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION compute_shift_kpis TO service_role;

GRANT EXECUTE ON FUNCTION compute_checkin_response_times TO authenticated;
GRANT EXECUTE ON FUNCTION compute_checkin_response_times TO service_role;

GRANT EXECUTE ON FUNCTION compute_day_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION compute_day_kpis TO service_role;

COMMIT;
