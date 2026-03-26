-- =============================================================================
-- Migration 175  -  SENTINEL AI-Behavior Sentry
-- =============================================================================
--
-- Detects and responds to anomalous PII access patterns that indicate
-- automated exfiltration (AI attacker, compromised session, rogue script).
--
-- Defence layers:
--   1. sentinel_pii_rate_check()  -  callable function that checks if a
--      user/IP has exceeded the PII reveal threshold (50 reveals in 60s)
--   2. sentinel_lock_tenant()  -  emergency function that disables a user
--      and logs a BREACH-severity event
--   3. sentinel_sentry_trigger  -  AFTER INSERT trigger on sentinel_audit_log
--      that auto-fires the rate check on every DATA_MASKING_BYPASS event
--
-- Performance: The trigger only fires on DATA_MASKING_BYPASS events
-- (filtered by WHEN clause). The rate check is a simple COUNT with
-- an indexed timestamp filter  -  sub-millisecond.
--
-- Depends on: migration 161 (sentinel_audit_log), migration 174 (hash chain)
-- =============================================================================


-- ── 1. Rate-check function ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_pii_rate_check(
  p_auth_user_id  UUID,
  p_ip_address    TEXT DEFAULT NULL,
  p_window_secs   INT  DEFAULT 60,
  p_threshold     INT  DEFAULT 50
)
RETURNS TABLE (
  is_blocked       BOOLEAN,
  reveal_count     INT,
  window_seconds   INT,
  threshold        INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT;
BEGIN
  -- Count PII reveals by this user in the sliding window
  SELECT COUNT(*)::INT INTO _count
    FROM sentinel_audit_log
   WHERE event_type = 'DATA_MASKING_BYPASS'
     AND auth_user_id = p_auth_user_id
     AND created_at >= now() - (p_window_secs || ' seconds')::INTERVAL;

  -- If IP is provided, also check IP-based rate (catches shared accounts)
  IF p_ip_address IS NOT NULL THEN
    DECLARE
      _ip_count INT;
    BEGIN
      SELECT COUNT(*)::INT INTO _ip_count
        FROM sentinel_audit_log
       WHERE event_type = 'DATA_MASKING_BYPASS'
         AND ip_address = p_ip_address
         AND created_at >= now() - (p_window_secs || ' seconds')::INTERVAL;

      -- Use the higher of user-based or IP-based count
      IF _ip_count > _count THEN
        _count := _ip_count;
      END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    (_count >= p_threshold),
    _count,
    p_window_secs,
    p_threshold;
END;
$$;

COMMENT ON FUNCTION sentinel_pii_rate_check(UUID, TEXT, INT, INT) IS
  'SENTINEL AI-Behavior Sentry: checks if a user or IP has exceeded the '
  'PII reveal rate limit (default: 50 reveals in 60 seconds). '
  'Returns is_blocked=true if the threshold is breached.';


-- ── 2. Emergency tenant lock function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_lock_user(
  p_auth_user_id  UUID,
  p_reason        TEXT DEFAULT 'AI-Behavior Sentry: excessive PII reveals detected'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id   UUID;
  _tenant_id UUID;
BEGIN
  -- Find the app user
  SELECT id, tenant_id INTO _user_id, _tenant_id
    FROM users
   WHERE auth_user_id = p_auth_user_id;

  IF _user_id IS NULL THEN
    RETURN; -- User not found, nothing to lock
  END IF;

  -- Deactivate the user account
  UPDATE users
     SET is_active = false
   WHERE auth_user_id = p_auth_user_id;

  -- Log the lockout as a BREACH event
  PERFORM sentinel_log_event(
    'DATA_MASKING_BYPASS',
    'breach',
    _tenant_id,
    _user_id,
    'users',
    _user_id,
    jsonb_build_object(
      'action',          'user_locked',
      'reason',          p_reason,
      'auth_user_id',    p_auth_user_id,
      'locked_at',       now()::TEXT,
      'sentry_trigger',  true
    )
  );
END;
$$;

COMMENT ON FUNCTION sentinel_lock_user(UUID, TEXT) IS
  'SENTINEL emergency response: deactivates a user account and logs a '
  'BREACH-severity event. Called automatically by the AI-Behavior Sentry '
  'when excessive PII reveals are detected.';


-- ── 3. Sentry trigger  -  auto-fires on PII reveal events ────────────────────

CREATE OR REPLACE FUNCTION sentinel_sentry_on_pii_reveal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_blocked  BOOLEAN;
  _count       INT;
BEGIN
  -- Only process if we have a user to check
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check rate limit
  SELECT r.is_blocked, r.reveal_count
    INTO _is_blocked, _count
    FROM sentinel_pii_rate_check(
      NEW.auth_user_id,
      NEW.ip_address,
      60,  -- 60-second window
      50   -- 50 reveals threshold
    ) r;

  -- If threshold breached, lock the user
  IF _is_blocked THEN
    PERFORM sentinel_lock_user(
      NEW.auth_user_id,
      format(
        'AI-Behavior Sentry: %s PII reveals in 60 seconds from IP %s',
        _count,
        COALESCE(NEW.ip_address, 'unknown')
      )
    );
  END IF;

  -- AFTER INSERT trigger  -  always return NEW
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sentinel_sentry_on_pii_reveal() IS
  'SENTINEL AI-Behavior Sentry trigger function (migration 175). '
  'Fires AFTER INSERT on sentinel_audit_log for DATA_MASKING_BYPASS events. '
  'Checks the PII reveal rate and auto-locks users who exceed 50 reveals/60s.';


-- ── 4. Attach trigger (filtered to DATA_MASKING_BYPASS only) ────────────────

DROP TRIGGER IF EXISTS trg_sentinel_sentry_pii ON sentinel_audit_log;

CREATE TRIGGER trg_sentinel_sentry_pii
  AFTER INSERT ON sentinel_audit_log
  FOR EACH ROW
  WHEN (NEW.event_type = 'DATA_MASKING_BYPASS')
  EXECUTE FUNCTION sentinel_sentry_on_pii_reveal();


-- ── 5. Index for rate-check performance ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_pii_rate
  ON sentinel_audit_log (event_type, auth_user_id, created_at DESC)
  WHERE event_type = 'DATA_MASKING_BYPASS';

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_pii_ip_rate
  ON sentinel_audit_log (event_type, ip_address, created_at DESC)
  WHERE event_type = 'DATA_MASKING_BYPASS';
