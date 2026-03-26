-- ============================================================================
-- Migration 180: SENTINEL Emergency Lockdown Protocol + Chain of Custody
-- ============================================================================
-- Directive 2.4: Kill-Switch — auto-revoke session + lock matter on:
--   - 3+ DOCUMENT_TAMPER events from same user in 1 hour
--   - Unauthorized PII_REVEAL from suspicious pattern (rate limit breach)
--
-- Directive 2.5: Chain of Custody — audit report data view for PDF export
-- ============================================================================


-- ── 1. Emergency Lockdown State Table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sentinel_lockdowns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id       UUID        REFERENCES matters(id) ON DELETE SET NULL,
  lockdown_type   TEXT        NOT NULL
                  CHECK (lockdown_type IN ('user_session', 'matter_lock', 'tenant_freeze')),
  trigger_event   TEXT        NOT NULL,  -- e.g. 'DOCUMENT_TAMPER_THRESHOLD', 'PII_BRUTE_FORCE'
  trigger_count   INT         NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_at     TIMESTAMPTZ,
  unlocked_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  details         JSONB       DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sentinel_lockdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY sentinel_lockdowns_admin ON sentinel_lockdowns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.auth_user_id = auth.uid()
        AND r.name IN ('admin', 'super_admin', 'superadmin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_lockdowns_user ON sentinel_lockdowns(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lockdowns_matter ON sentinel_lockdowns(matter_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lockdowns_tenant ON sentinel_lockdowns(tenant_id, is_active);


-- ── 2. Kill-Switch Function ──────────────────────────────────────────────────
-- Called by the app layer or can be invoked directly.
-- Checks recent sentinel_audit_log for threshold breaches and auto-locks.

CREATE OR REPLACE FUNCTION sentinel_emergency_lockdown(
  p_user_id UUID,
  p_tenant_id UUID,
  p_event_type TEXT DEFAULT 'DOCUMENT_TAMPER',
  p_threshold INT DEFAULT 3,
  p_window_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _event_count INT;
  _lockdown_id UUID;
  _user_name TEXT;
  _matter_ids UUID[];
BEGIN
  -- Count recent events of this type from this user within the window
  SELECT COUNT(*)
  INTO _event_count
  FROM sentinel_audit_log
  WHERE user_id = p_user_id::TEXT
    AND event_type = p_event_type
    AND created_at > now() - (p_window_minutes || ' minutes')::INTERVAL;

  -- Below threshold — no action
  IF _event_count < p_threshold THEN
    RETURN jsonb_build_object(
      'locked', false,
      'event_count', _event_count,
      'threshold', p_threshold,
      'message', 'Below lockdown threshold'
    );
  END IF;

  -- Check if already locked
  IF EXISTS (
    SELECT 1 FROM sentinel_lockdowns
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND is_active = true
      AND trigger_event = p_event_type || '_THRESHOLD'
  ) THEN
    RETURN jsonb_build_object(
      'locked', true,
      'event_count', _event_count,
      'already_locked', true,
      'message', 'User already under lockdown for this event type'
    );
  END IF;

  -- Get affected matter IDs
  SELECT ARRAY_AGG(DISTINCT (details->>'matter_id')::UUID)
  INTO _matter_ids
  FROM sentinel_audit_log
  WHERE user_id = p_user_id::TEXT
    AND event_type = p_event_type
    AND created_at > now() - (p_window_minutes || ' minutes')::INTERVAL
    AND details->>'matter_id' IS NOT NULL;

  -- Create lockdown record
  INSERT INTO sentinel_lockdowns (
    tenant_id, user_id, matter_id, lockdown_type, trigger_event, trigger_count, details
  ) VALUES (
    p_tenant_id,
    p_user_id,
    _matter_ids[1],  -- Primary affected matter
    'user_session',
    p_event_type || '_THRESHOLD',
    _event_count,
    jsonb_build_object(
      'affected_matters', _matter_ids,
      'window_minutes', p_window_minutes,
      'threshold', p_threshold,
      'event_type', p_event_type
    )
  )
  RETURNING id INTO _lockdown_id;

  -- Lock affected matters (set status to 'locked')
  IF _matter_ids IS NOT NULL THEN
    UPDATE matters
    SET status = 'locked'
    WHERE id = ANY(_matter_ids)
      AND tenant_id = p_tenant_id
      AND status != 'locked';
  END IF;

  -- Log the lockdown to SENTINEL
  INSERT INTO sentinel_audit_log (
    event_type, severity, tenant_id, user_id,
    table_name, record_id, details
  ) VALUES (
    'EMERGENCY_LOCKDOWN',
    'breach',
    p_tenant_id,
    p_user_id::TEXT,
    'sentinel_lockdowns',
    _lockdown_id::TEXT,
    jsonb_build_object(
      'trigger_event', p_event_type || '_THRESHOLD',
      'event_count', _event_count,
      'threshold', p_threshold,
      'affected_matters', _matter_ids,
      'action', 'User session revoked + matter(s) locked'
    )
  );

  RETURN jsonb_build_object(
    'locked', true,
    'lockdown_id', _lockdown_id,
    'event_count', _event_count,
    'affected_matters', _matter_ids,
    'message', 'EMERGENCY LOCKDOWN: User session revoked and matter(s) locked'
  );
END;
$$;


-- ── 3. Chain of Custody View ─────────────────────────────────────────────────
-- Aggregates all security events for a matter into a single view
-- for PDF export as a "Chain of Custody" report.

CREATE OR REPLACE FUNCTION sentinel_chain_of_custody(
  p_matter_id UUID,
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _result JSONB;
  _pii_reveals JSONB;
  _doc_verifications JSONB;
  _id_verifications JSONB;
  _form_generations JSONB;
  _tamper_alerts JSONB;
  _lockdowns JSONB;
BEGIN
  -- PII Reveals for this matter
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'timestamp', sal.created_at,
    'user_id', sal.user_id,
    'field_name', sal.details->>'field_name',
    'reason', sal.details->>'reason',
    'severity', sal.severity
  ) ORDER BY sal.created_at), '[]'::jsonb)
  INTO _pii_reveals
  FROM sentinel_audit_log sal
  WHERE sal.record_id = p_matter_id::TEXT
    AND sal.tenant_id = p_tenant_id
    AND sal.event_type IN ('PII_REVEAL', 'DATA_MASKING_BYPASS');

  -- Document hash verifications
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'document_id', d.id,
    'file_name', d.file_name,
    'content_hash', LEFT(d.content_hash, 12) || '...',
    'tamper_status', d.tamper_status,
    'verified_at', d.hash_verified_at,
    'uploaded_at', d.created_at
  ) ORDER BY d.created_at), '[]'::jsonb)
  INTO _doc_verifications
  FROM documents d
  WHERE d.matter_id = p_matter_id
    AND d.tenant_id = p_tenant_id
    AND d.content_hash IS NOT NULL;

  -- Identity verifications
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'contact_id', iv.contact_id,
    'provider', iv.provider,
    'method', iv.method,
    'status', iv.status,
    'confidence_score', iv.confidence_score,
    'document_type', iv.document_type,
    'verified_at', iv.verified_at,
    'created_at', iv.created_at
  ) ORDER BY iv.created_at), '[]'::jsonb)
  INTO _id_verifications
  FROM identity_verifications iv
  WHERE iv.matter_id = p_matter_id
    AND iv.tenant_id = p_tenant_id;

  -- Form generations
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'timestamp', sal.created_at,
    'user_id', sal.user_id,
    'form_code', sal.details->>'pack_type',
    'version', sal.details->>'version_number',
    'status', sal.details->>'status'
  ) ORDER BY sal.created_at), '[]'::jsonb)
  INTO _form_generations
  FROM sentinel_audit_log sal
  WHERE sal.record_id = p_matter_id::TEXT
    AND sal.tenant_id = p_tenant_id
    AND sal.event_type = 'FORM_GENERATION';

  -- Tamper alerts
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'timestamp', sal.created_at,
    'file_name', sal.details->>'file_name',
    'expected_hash', sal.details->>'expected_hash',
    'actual_hash', sal.details->>'actual_hash',
    'severity', sal.severity
  ) ORDER BY sal.created_at), '[]'::jsonb)
  INTO _tamper_alerts
  FROM sentinel_audit_log sal
  WHERE sal.record_id = p_matter_id::TEXT
    AND sal.tenant_id = p_tenant_id
    AND sal.event_type = 'DOCUMENT_TAMPER';

  -- Lockdowns
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'locked_at', sl.locked_at,
    'user_id', sl.user_id,
    'trigger', sl.trigger_event,
    'is_active', sl.is_active,
    'unlocked_at', sl.unlocked_at
  ) ORDER BY sl.locked_at), '[]'::jsonb)
  INTO _lockdowns
  FROM sentinel_lockdowns sl
  WHERE sl.matter_id = p_matter_id
    AND sl.tenant_id = p_tenant_id;

  _result := jsonb_build_object(
    'matter_id', p_matter_id,
    'generated_at', now(),
    'pii_reveals', _pii_reveals,
    'document_verifications', _doc_verifications,
    'identity_verifications', _id_verifications,
    'form_generations', _form_generations,
    'tamper_alerts', _tamper_alerts,
    'lockdowns', _lockdowns,
    'summary', jsonb_build_object(
      'total_pii_reveals', jsonb_array_length(_pii_reveals),
      'total_documents_hashed', jsonb_array_length(_doc_verifications),
      'total_id_verifications', jsonb_array_length(_id_verifications),
      'total_form_generations', jsonb_array_length(_form_generations),
      'total_tamper_alerts', jsonb_array_length(_tamper_alerts),
      'total_lockdowns', jsonb_array_length(_lockdowns)
    )
  );

  RETURN _result;
END;
$$;
