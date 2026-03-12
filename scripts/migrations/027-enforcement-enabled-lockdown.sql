-- ============================================================================
-- Migration 027: Lock enforcement_enabled to Admin Role + Audit Trail
-- ============================================================================
-- Security hardening for the enforcement_enabled flag on matter_types.
-- Without this, any authenticated tenant user could flip the flag via
-- direct Supabase client calls, bypassing the entire UEE.
--
-- 1. Trigger: restrict enforcement_enabled changes to users with Admin role
-- 2. Trigger: auto-insert audit_logs when enforcement_enabled changes
-- ============================================================================

-- ─── 1. Restrict enforcement_enabled to Admin role ────────────────────────────

CREATE OR REPLACE FUNCTION restrict_enforcement_enabled_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_role_name TEXT;
BEGIN
  -- Only fire if enforcement_enabled is actually changing
  IF NEW.enforcement_enabled IS NOT DISTINCT FROM OLD.enforcement_enabled THEN
    RETURN NEW;
  END IF;

  -- Look up the current user's role
  SELECT u.id, r.name INTO v_user_id, v_role_name
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.auth_user_id = auth.uid();

  -- Only Admin role can toggle enforcement_enabled
  IF v_role_name IS NULL OR v_role_name != 'Admin' THEN
    RAISE EXCEPTION 'Only Admin users can change the enforcement_enabled flag. Current role: %', COALESCE(v_role_name, 'none');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_restrict_enforcement_enabled'
  ) THEN
    CREATE TRIGGER trg_restrict_enforcement_enabled
      BEFORE UPDATE ON matter_types
      FOR EACH ROW EXECUTE FUNCTION restrict_enforcement_enabled_change();
  END IF;
END $$;

-- ─── 2. Audit log when enforcement_enabled changes ───────────────────────────

CREATE OR REPLACE FUNCTION audit_enforcement_enabled_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Only fire if enforcement_enabled actually changed
  IF NEW.enforcement_enabled IS NOT DISTINCT FROM OLD.enforcement_enabled THEN
    RETURN NEW;
  END IF;

  -- Look up the current user
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = auth.uid();

  -- Insert audit log entry
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    changes,
    source
  ) VALUES (
    NEW.tenant_id,
    v_user_id,
    CASE WHEN NEW.enforcement_enabled THEN 'enforcement_enabled' ELSE 'enforcement_disabled' END,
    'matter_type',
    NEW.id,
    jsonb_build_object(
      'matter_type_name', NEW.name,
      'previous_value', OLD.enforcement_enabled,
      'new_value', NEW.enforcement_enabled
    ),
    'web'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_enforcement_enabled'
  ) THEN
    CREATE TRIGGER trg_audit_enforcement_enabled
      AFTER UPDATE ON matter_types
      FOR EACH ROW EXECUTE FUNCTION audit_enforcement_enabled_change();
  END IF;
END $$;

-- ============================================================================
-- END Migration 027
-- ============================================================================
