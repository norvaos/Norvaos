-- ============================================================
-- Migration 087: Fix SECURITY DEFINER functions missing SET search_path
-- ============================================================
-- All SECURITY DEFINER functions must include SET search_path = public
-- to prevent schema-hijacking attacks via search_path manipulation.
-- This migration re-declares every affected function with the fix applied.
-- Safe to re-run  -  all statements are CREATE OR REPLACE.
-- ============================================================

-- ── 1. apply_risk_override (025) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_risk_override(
  p_intake_id      UUID,
  p_tenant_id      UUID,
  p_matter_id      UUID,
  p_user_id        UUID,
  p_override_level TEXT,
  p_override_reason TEXT,
  p_previous_level TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_intake RECORD;
  v_history_id UUID;
BEGIN
  -- 1. Update matter_intake with override fields
  UPDATE matter_intake SET
    risk_override_level  = p_override_level,
    risk_override_reason = p_override_reason,
    risk_override_by     = p_user_id,
    risk_override_at     = now()
  WHERE id = p_intake_id
    AND tenant_id = p_tenant_id
  RETURNING * INTO v_intake;

  IF v_intake IS NULL THEN
    RAISE EXCEPTION 'Intake record not found or tenant mismatch';
  END IF;

  -- 2. Insert override history
  INSERT INTO risk_override_history (
    tenant_id, matter_id, intake_id,
    previous_level, new_level, reason, overridden_by
  ) VALUES (
    p_tenant_id, p_matter_id, p_intake_id,
    p_previous_level, p_override_level, p_override_reason, p_user_id
  ) RETURNING id INTO v_history_id;

  -- 3. Insert audit log
  INSERT INTO audit_logs (
    tenant_id, user_id, entity_type, entity_id, action, changes, metadata
  ) VALUES (
    p_tenant_id,
    p_user_id,
    'matter_intake',
    p_intake_id,
    'risk_override',
    jsonb_build_object(
      'before', jsonb_build_object('risk_level', p_previous_level),
      'after',  jsonb_build_object('risk_override_level', p_override_level)
    ),
    jsonb_build_object(
      'matter_id', p_matter_id,
      'override_reason', p_override_reason,
      'history_id', v_history_id
    )
  );

  RETURN to_jsonb(v_intake);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2. upload_document_version (028) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION upload_document_version(
  p_tenant_id     UUID,
  p_slot_id       UUID,
  p_document_id   UUID,
  p_storage_path  TEXT,
  p_file_name     TEXT,
  p_file_size     BIGINT,
  p_file_type     TEXT,
  p_uploaded_by   UUID
)
RETURNS INT AS $$
DECLARE
  v_new_version INT;
BEGIN
  -- Lock the slot row to prevent concurrent version number assignment
  PERFORM id FROM document_slots WHERE id = p_slot_id FOR UPDATE;

  -- Compute next version number atomically
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM document_versions WHERE slot_id = p_slot_id;

  -- Insert version record
  INSERT INTO document_versions (
    tenant_id, slot_id, document_id, version_number,
    storage_path, file_name, file_size, file_type,
    uploaded_by, review_status
  ) VALUES (
    p_tenant_id, p_slot_id, p_document_id, v_new_version,
    p_storage_path, p_file_name, p_file_size, p_file_type,
    p_uploaded_by, 'pending_review'
  );

  -- Update slot to point to new version
  UPDATE document_slots SET
    current_document_id = p_document_id,
    current_version = v_new_version,
    status = 'pending_review'
  WHERE id = p_slot_id;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 3. review_document_version (032  -  latest version) ────────────────────────

CREATE OR REPLACE FUNCTION review_document_version(
  p_tenant_id      UUID,
  p_slot_id        UUID,
  p_user_id        UUID,
  p_action         TEXT,
  p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_slot RECORD;
  v_version_number INT;
  v_status TEXT;
BEGIN
  IF p_action NOT IN ('accept', 'needs_re_upload', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || p_action);
  END IF;

  v_status := CASE p_action
    WHEN 'accept' THEN 'accepted'
    WHEN 'reject' THEN 'rejected'
    ELSE p_action
  END;

  SELECT * INTO v_slot FROM document_slots
  WHERE id = p_slot_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot not found');
  END IF;

  IF v_slot.current_version = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No document uploaded to review');
  END IF;

  IF v_slot.status IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Current version is already ' || v_slot.status || '. Upload a new version to initiate a new review.');
  END IF;

  v_version_number := v_slot.current_version;

  UPDATE document_versions SET
    review_status = v_status,
    reviewed_by = p_user_id,
    reviewed_at = now(),
    review_reason = p_reason
  WHERE slot_id = p_slot_id AND version_number = v_version_number;

  UPDATE document_slots SET status = v_status
  WHERE id = p_slot_id;

  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes, source)
  VALUES (
    p_tenant_id,
    p_user_id,
    'document_' || p_action,
    'document_slot',
    p_slot_id,
    jsonb_build_object(
      'slot_name', v_slot.slot_name,
      'version_number', v_version_number,
      'action', p_action,
      'status', v_status,
      'reason', p_reason
    ),
    'web'
  );

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', p_slot_id,
    'version_number', v_version_number,
    'new_status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4. has_billing_view (033) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_billing_view()
RETURNS BOOLEAN AS $$
DECLARE
  v_role_name TEXT;
  v_permissions JSONB;
BEGIN
  SELECT r.name, r.permissions
    INTO v_role_name, v_permissions
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL THEN RETURN FALSE; END IF;
  IF v_role_name = 'Admin' THEN RETURN TRUE; END IF;

  RETURN COALESCE((v_permissions -> 'billing' ->> 'view')::boolean, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── 5. acquire_idempotency_lock (043) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION acquire_idempotency_lock(
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_lock_id BIGINT;
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'existing_id', NULL);
  END IF;

  v_lock_id := hashtext(p_idempotency_key);
  PERFORM pg_advisory_lock(v_lock_id);

  SELECT id INTO v_existing_id
  FROM workflow_actions
  WHERE idempotency_key = p_idempotency_key
    AND status = 'completed'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    PERFORM pg_advisory_unlock(v_lock_id);
    RETURN jsonb_build_object('locked', false, 'existing_id', v_existing_id);
  END IF;

  RETURN jsonb_build_object('locked', true, 'existing_id', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 6. release_idempotency_lock (043) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION release_idempotency_lock(
  p_idempotency_key TEXT
) RETURNS void AS $$
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_unlock(hashtext(p_idempotency_key));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 7. execute_action_atomic (053  -  latest 18-param version) ─────────────────

CREATE OR REPLACE FUNCTION execute_action_atomic(
  p_tenant_id            UUID,
  p_action_type          TEXT,
  p_action_config        JSONB,
  p_entity_type          TEXT,
  p_entity_id            UUID,
  p_performed_by         UUID,
  p_source               TEXT,
  p_idempotency_key      TEXT    DEFAULT NULL,
  p_previous_state       JSONB   DEFAULT NULL,
  p_new_state            JSONB   DEFAULT NULL,
  p_activity_type        TEXT    DEFAULT NULL,
  p_activity_title       TEXT    DEFAULT NULL,
  p_activity_description TEXT    DEFAULT NULL,
  p_activity_metadata    JSONB   DEFAULT NULL,
  p_activity_matter_id   UUID    DEFAULT NULL,
  p_activity_contact_id  UUID    DEFAULT NULL,
  p_action_label         TEXT    DEFAULT NULL,
  p_shift_id             UUID    DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_action_id   UUID;
  v_activity_id UUID;
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM workflow_actions
    WHERE idempotency_key = p_idempotency_key
      AND status = 'completed'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action_id', v_existing_id,
        'activity_id', NULL,
        'idempotent_hit', true
      );
    END IF;
  END IF;

  INSERT INTO workflow_actions (
    tenant_id, action_type, action_config, entity_type, entity_id,
    performed_by, status, source, idempotency_key, previous_state, new_state,
    shift_id
  ) VALUES (
    p_tenant_id, p_action_type, p_action_config, p_entity_type, p_entity_id,
    p_performed_by, 'completed', p_source, p_idempotency_key, p_previous_state, p_new_state,
    p_shift_id
  )
  RETURNING id INTO v_action_id;

  INSERT INTO audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_performed_by, p_action_type, p_entity_type, p_entity_id,
    jsonb_build_object(
      'source', p_source,
      'workflow_action_id', v_action_id,
      'action_label', COALESCE(p_action_label, p_action_type),
      'shift_id', p_shift_id
    )
  );

  INSERT INTO activities (
    tenant_id, activity_type, title, description,
    entity_type, entity_id, matter_id, contact_id,
    user_id, metadata
  ) VALUES (
    p_tenant_id,
    COALESCE(p_activity_type, p_action_type),
    COALESCE(p_activity_title, p_action_type),
    p_activity_description,
    p_entity_type, p_entity_id,
    p_activity_matter_id, p_activity_contact_id,
    p_performed_by,
    COALESCE(p_activity_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'workflow_action_id', v_action_id,
        'action_type', p_action_type,
        'source', p_source,
        'shift_id', p_shift_id
      )
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'action_id', v_action_id,
    'activity_id', v_activity_id,
    'idempotent_hit', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 8. auto_end_stale_shifts (050) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_end_stale_shifts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE front_desk_shifts
  SET ended_at = now(),
      ended_reason = 'auto_12h'
  WHERE ended_at IS NULL
    AND started_at < now() - INTERVAL '12 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 9. compute_shift_kpis (051) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_shift_kpis(p_shift_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_shift       RECORD;
  v_result      JSONB;
  v_total_actions        INTEGER;
  v_check_ins            INTEGER;
  v_calls_logged         INTEGER;
  v_tasks_completed      INTEGER;
  v_intakes_created      INTEGER;
  v_appointments_managed INTEGER;
  v_notes_created        INTEGER;
  v_emails_logged        INTEGER;
  v_meetings_logged      INTEGER;
  v_notify_staff         INTEGER;
  v_duration_minutes     NUMERIC;
  v_idle_minutes         NUMERIC;
  v_heartbeat_count      INTEGER;
  v_search_count         INTEGER;
  v_contact_opened       INTEGER;
  v_queue_viewed         INTEGER;
BEGIN
  SELECT id, user_id, tenant_id, started_at, ended_at,
         EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60.0 AS duration_min
  INTO v_shift
  FROM front_desk_shifts
  WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Shift not found');
  END IF;

  v_duration_minutes := v_shift.duration_min;

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
    v_total_actions, v_check_ins, v_calls_logged, v_tasks_completed,
    v_intakes_created, v_appointments_managed, v_notes_created,
    v_emails_logged, v_meetings_logged, v_notify_staff
  FROM workflow_actions
  WHERE shift_id = p_shift_id;

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
    v_idle_minutes, v_heartbeat_count, v_search_count, v_contact_opened, v_queue_viewed
  FROM front_desk_events
  WHERE shift_id = p_shift_id;

  v_result := jsonb_build_object(
    'shift_id', v_shift.id,
    'user_id', v_shift.user_id,
    'tenant_id', v_shift.tenant_id,
    'started_at', v_shift.started_at,
    'ended_at', v_shift.ended_at,
    'shift_duration_minutes', ROUND(v_duration_minutes, 1),
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
    'idle_time_minutes', ROUND(v_idle_minutes, 1),
    'active_time_minutes', ROUND(GREATEST(v_duration_minutes - v_idle_minutes, 0), 1),
    'idle_time_ratio', CASE
      WHEN v_duration_minutes > 0 THEN ROUND((v_idle_minutes / v_duration_minutes) * 100, 1)
      ELSE 0
    END,
    'heartbeat_count', v_heartbeat_count,
    'search_count', v_search_count,
    'contacts_opened', v_contact_opened,
    'queue_views', v_queue_viewed
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 10. compute_checkin_response_times (051) ──────────────────────────────────

CREATE OR REPLACE FUNCTION compute_checkin_response_times(p_shift_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_times  NUMERIC[];
  v_avg    NUMERIC;
  v_p95    NUMERIC;
  v_count  INTEGER;
  rec      RECORD;
BEGIN
  v_times := ARRAY[]::NUMERIC[];

  FOR rec IN
    SELECT
      ci.created_at AS checkin_at,
      (
        SELECT MIN(wa2.created_at)
        FROM workflow_actions wa2
        WHERE wa2.shift_id = p_shift_id
          AND wa2.action_type = 'front_desk_notify_staff'
          AND wa2.status = 'completed'
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
    RETURN jsonb_build_object('count', 0, 'avg_minutes', NULL, 'p95_minutes', NULL);
  END IF;

  SELECT array_agg(t ORDER BY t) INTO v_times FROM unnest(v_times) AS t;
  SELECT AVG(t) INTO v_avg FROM unnest(v_times) AS t;
  v_p95 := v_times[GREATEST(CEIL(v_count * 0.95)::INTEGER, 1)];

  RETURN jsonb_build_object(
    'count', v_count,
    'avg_minutes', ROUND(v_avg, 1),
    'p95_minutes', ROUND(v_p95, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 11. compute_day_kpis (051) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_day_kpis(
  p_user_id UUID,
  p_date    DATE
)
RETURNS JSONB AS $$
DECLARE
  v_shift_ids         UUID[];
  v_shift_kpis        JSONB;
  v_sid               UUID;
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
  SELECT array_agg(id) INTO v_shift_ids
  FROM front_desk_shifts
  WHERE user_id = p_user_id AND shift_date = p_date;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 12. create_form_pack_version (052) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION create_form_pack_version(
  p_tenant_id         UUID,
  p_matter_id         UUID,
  p_pack_type         TEXT,
  p_input_snapshot    JSONB,
  p_resolved_fields   JSONB,
  p_mapping_version   TEXT,
  p_template_checksum TEXT,
  p_validation_result JSONB,
  p_generated_by      UUID,
  p_idempotency_key   TEXT,
  p_form_code         TEXT,
  p_storage_path      TEXT,
  p_file_name         TEXT,
  p_file_size         INT,
  p_checksum_sha256   TEXT,
  p_is_final          BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_new_version  INT;
  v_version_id   UUID;
  v_artifact_id  UUID;
  v_existing_id  UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM form_pack_versions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'version_id', v_existing_id,
        'version_number', (SELECT version_number FROM form_pack_versions WHERE id = v_existing_id),
        'artifact_id', (SELECT id FROM form_pack_artifacts WHERE pack_version_id = v_existing_id LIMIT 1),
        'idempotent_hit', true
      );
    END IF;
  END IF;

  PERFORM id FROM matters WHERE id = p_matter_id FOR UPDATE;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM form_pack_versions
  WHERE matter_id = p_matter_id AND pack_type = p_pack_type;

  INSERT INTO form_pack_versions (
    tenant_id, matter_id, pack_type, version_number, status,
    input_snapshot, resolved_fields, mapping_version, template_checksum,
    validation_result, generated_by, idempotency_key
  ) VALUES (
    p_tenant_id, p_matter_id, p_pack_type, v_new_version, 'draft',
    p_input_snapshot, p_resolved_fields, p_mapping_version, p_template_checksum,
    p_validation_result, p_generated_by, p_idempotency_key
  )
  RETURNING id INTO v_version_id;

  INSERT INTO form_pack_artifacts (
    tenant_id, pack_version_id, form_code,
    storage_path, file_name, file_size, checksum_sha256, is_final
  ) VALUES (
    p_tenant_id, v_version_id, p_form_code,
    p_storage_path, p_file_name, p_file_size, p_checksum_sha256, p_is_final
  )
  RETURNING id INTO v_artifact_id;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_new_version,
    'artifact_id', v_artifact_id,
    'idempotent_hit', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 13. approve_form_pack_version (052) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_form_pack_version(
  p_tenant_id   UUID,
  p_version_id  UUID,
  p_approved_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_version_number INT;
  v_pack_type      TEXT;
BEGIN
  SELECT status, version_number, pack_type
  INTO v_current_status, v_version_number, v_pack_type
  FROM form_pack_versions
  WHERE id = p_version_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Version not found');
  END IF;

  IF v_current_status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only draft versions can be approved. Current status: ' || v_current_status);
  END IF;

  UPDATE form_pack_versions SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now()
  WHERE id = p_version_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', p_version_id,
    'version_number', v_version_number,
    'pack_type', v_pack_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 14. add_form_pack_artifact (052) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_form_pack_artifact(
  p_tenant_id       UUID,
  p_version_id      UUID,
  p_form_code       TEXT,
  p_storage_path    TEXT,
  p_file_name       TEXT,
  p_file_size       INT,
  p_checksum_sha256 TEXT,
  p_is_final        BOOLEAN
)
RETURNS UUID AS $$
DECLARE
  v_artifact_id UUID;
BEGIN
  INSERT INTO form_pack_artifacts (
    tenant_id, pack_version_id, form_code,
    storage_path, file_name, file_size, checksum_sha256, is_final
  ) VALUES (
    p_tenant_id, p_version_id, p_form_code,
    p_storage_path, p_file_name, p_file_size, p_checksum_sha256, p_is_final
  )
  RETURNING id INTO v_artifact_id;

  RETURN v_artifact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 15. publish_form_assignment_template (074) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.publish_form_assignment_template(
  p_template_id UUID,
  p_user_id     UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_prev_id  UUID;
BEGIN
  SELECT * INTO v_template
  FROM ircc_form_assignment_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  IF v_template.status = 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template is already published');
  END IF;

  IF v_template.status = 'archived' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot publish an archived template');
  END IF;

  UPDATE ircc_form_assignment_templates
  SET status = 'archived',
      archived_at = now(),
      archived_by = p_user_id,
      updated_at = now()
  WHERE tenant_id = v_template.tenant_id
    AND form_id = v_template.form_id
    AND COALESCE(matter_type_id::text, '') = COALESCE(v_template.matter_type_id::text, '')
    AND COALESCE(case_type_id::text, '') = COALESCE(v_template.case_type_id::text, '')
    AND COALESCE(person_role_scope, '') = COALESCE(v_template.person_role_scope, '')
    AND status = 'published'
    AND id != p_template_id
  RETURNING id INTO v_prev_id;

  IF v_prev_id IS NOT NULL THEN
    INSERT INTO form_assignment_template_history (
      tenant_id, template_id, version, action, previous_state, new_state, changed_by
    ) VALUES (
      v_template.tenant_id,
      v_prev_id,
      (SELECT version FROM ircc_form_assignment_templates WHERE id = v_prev_id),
      'archived',
      jsonb_build_object('status', 'published'),
      jsonb_build_object('status', 'archived', 'reason', 'superseded_by_version_' || v_template.version),
      p_user_id
    );
  END IF;

  UPDATE ircc_form_assignment_templates
  SET status = 'published',
      published_at = now(),
      published_by = p_user_id,
      updated_at = now()
  WHERE id = p_template_id;

  INSERT INTO form_assignment_template_history (
    tenant_id, template_id, version, action, previous_state, new_state, changed_by
  ) VALUES (
    v_template.tenant_id,
    p_template_id,
    v_template.version,
    'published',
    jsonb_build_object('status', v_template.status),
    jsonb_build_object('status', 'published'),
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'version', v_template.version,
    'archived_previous_id', v_prev_id
  );
END;
$$;

-- ── 16. archive_form_assignment_template (074) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.archive_form_assignment_template(
  p_template_id UUID,
  p_user_id     UUID,
  p_reason      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_template RECORD;
BEGIN
  SELECT * INTO v_template
  FROM ircc_form_assignment_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  IF v_template.status != 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only published templates can be archived');
  END IF;

  UPDATE ircc_form_assignment_templates
  SET status = 'archived',
      archived_at = now(),
      archived_by = p_user_id,
      updated_at = now()
  WHERE id = p_template_id;

  INSERT INTO form_assignment_template_history (
    tenant_id, template_id, version, action, previous_state, new_state, changed_by, change_reason
  ) VALUES (
    v_template.tenant_id,
    p_template_id,
    v_template.version,
    'archived',
    jsonb_build_object('status', 'published'),
    jsonb_build_object('status', 'archived'),
    p_user_id,
    p_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'version', v_template.version
  );
END;
$$;
