-- ============================================================================
-- Migration 032: Fix review_document_version() action-to-status mapping
-- ============================================================================
-- BUG: The RPC writes p_action directly to review_status and status columns,
-- but the CHECK constraints expect the past-tense forms:
--   Action 'accept'  → CHECK expects 'accepted'
--   Action 'reject'  → CHECK expects 'rejected'
--   Action 'needs_re_upload' → already matches
--
-- Fix: Map action names to the correct status values before writing.
-- ============================================================================

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
  -- Validate action
  IF p_action NOT IN ('accept', 'needs_re_upload', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || p_action);
  END IF;

  -- Map action names to CHECK-constraint-compatible status values
  v_status := CASE p_action
    WHEN 'accept'  THEN 'accepted'
    WHEN 'reject'  THEN 'rejected'
    ELSE p_action  -- 'needs_re_upload' already matches
  END;

  -- Lock and fetch slot
  SELECT * INTO v_slot FROM document_slots
  WHERE id = p_slot_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot not found');
  END IF;

  IF v_slot.current_version = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No document uploaded to review');
  END IF;

  -- Prevent re-review of already finalized versions
  IF v_slot.status IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Current version is already ' || v_slot.status || '. Upload a new version to initiate a new review.');
  END IF;

  v_version_number := v_slot.current_version;

  -- Update version review metadata (use mapped status value)
  UPDATE document_versions SET
    review_status = v_status,
    reviewed_by = p_user_id,
    reviewed_at = now(),
    review_reason = p_reason
  WHERE slot_id = p_slot_id AND version_number = v_version_number;

  -- Update slot status (use mapped status value)
  UPDATE document_slots SET status = v_status
  WHERE id = p_slot_id;

  -- Insert audit log (keep original action name for readability)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- END Migration 032
-- ============================================================================
