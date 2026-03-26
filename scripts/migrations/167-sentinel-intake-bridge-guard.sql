-- =============================================================================
-- Migration 167  -  SENTINEL Intake Bridge Guard
-- =============================================================================
--
-- Zero-Trust check on Lead → Matter conversion. When a matter is INSERT'd
-- with an originating_lead_id, this trigger verifies the lead belongs to the
-- same tenant. If not, the entire transaction FAILS and a critical event is
-- logged to sentinel_audit_log.
--
-- Defence layer: PostgreSQL BEFORE INSERT trigger on matters table.
-- Complements the generic cross-tenant trigger (migration 163) with a
-- domain-specific check on the intake conversion path.
--
-- Depends on: migration 161 (sentinel_log_event function)
-- =============================================================================


-- ── 1. Trigger Function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_guard_intake_bridge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_tenant_id   UUID;
  _acting_user_id   UUID;
  _current_role     TEXT;
BEGIN
  -- Only fires on INSERT when originating_lead_id is set (lead conversion)
  IF NEW.originating_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow service_role to bypass (Supabase admin / server-side operations)
  _current_role := current_setting('role', true);
  IF _current_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Look up the lead's tenant
  SELECT tenant_id INTO _lead_tenant_id
    FROM leads
   WHERE id = NEW.originating_lead_id;

  -- If lead doesn't exist, block (dangling reference)
  IF _lead_tenant_id IS NULL THEN
    -- Resolve acting user for audit
    SELECT id INTO _acting_user_id
      FROM users
     WHERE auth_user_id = auth.uid();

    PERFORM sentinel_log_event(
      'INTAKE_BRIDGE_VIOLATION',
      'critical',
      NEW.tenant_id,
      _acting_user_id,
      'matters',
      NEW.id,
      jsonb_build_object(
        'violation_type',      'dangling_lead_reference',
        'originating_lead_id', NEW.originating_lead_id,
        'matter_tenant_id',    NEW.tenant_id,
        'operation',           TG_OP
      )
    );

    RAISE EXCEPTION
      'SENTINEL-403: Intake Bridge blocked  -  originating lead % does not exist',
      NEW.originating_lead_id
      USING ERRCODE = '42501';
  END IF;

  -- Cross-tenant check: lead tenant must match matter tenant
  IF _lead_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    -- Resolve acting user for audit
    SELECT id INTO _acting_user_id
      FROM users
     WHERE auth_user_id = auth.uid();

    PERFORM sentinel_log_event(
      'INTAKE_BRIDGE_VIOLATION',
      'critical',
      NEW.tenant_id,
      _acting_user_id,
      'matters',
      NEW.id,
      jsonb_build_object(
        'violation_type',       'cross_tenant_conversion',
        'originating_lead_id',  NEW.originating_lead_id,
        'lead_tenant_id',       _lead_tenant_id,
        'matter_tenant_id',     NEW.tenant_id,
        'operation',            TG_OP
      )
    );

    RAISE EXCEPTION
      'SENTINEL-403: Cross-tenant intake conversion denied. Lead tenant: %, Matter tenant: %',
      _lead_tenant_id, NEW.tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Same tenant  -  allow
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sentinel_guard_intake_bridge() IS
  'SENTINEL Zero-Trust trigger: validates that originating_lead_id belongs to '
  'the same tenant as the new matter during Lead → Matter conversion. '
  'Blocks cross-tenant conversions and dangling lead references with SQLSTATE 42501. '
  'Logs all violations to sentinel_audit_log as INTAKE_BRIDGE_VIOLATION (critical).';


-- ── 2. Attach Trigger ────────────────────────────────────────────────────────
-- Idempotent: drop first if re-running

DROP TRIGGER IF EXISTS sentinel_intake_bridge_guard ON matters;

CREATE TRIGGER sentinel_intake_bridge_guard
  BEFORE INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION sentinel_guard_intake_bridge();


-- ── 3. Also guard UPDATE (prevents re-parenting a matter to a foreign lead) ─

DROP TRIGGER IF EXISTS sentinel_intake_bridge_guard_update ON matters;

CREATE TRIGGER sentinel_intake_bridge_guard_update
  BEFORE UPDATE OF originating_lead_id ON matters
  FOR EACH ROW
  WHEN (NEW.originating_lead_id IS DISTINCT FROM OLD.originating_lead_id)
  EXECUTE FUNCTION sentinel_guard_intake_bridge();
