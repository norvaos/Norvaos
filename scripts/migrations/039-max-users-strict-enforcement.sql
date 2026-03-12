-- Migration 039: max_users strict enforcement
-- tenants.max_users is the sole source of truth for user limits.
-- Removes the old COALESCE fallback. If max_users IS NULL the trigger
-- rejects the INSERT rather than silently defaulting.
--
-- This is a DROP-and-REPLACE of the function body only — the trigger
-- (trg_users_max_enforcement) remains unchanged and does not need re-creation.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_max_users()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  -- Read the authoritative limit from the tenant row
  SELECT max_users INTO max_allowed
    FROM tenants
    WHERE id = NEW.tenant_id;

  -- Guard: every tenant MUST have an explicit max_users value
  IF max_allowed IS NULL THEN
    RAISE EXCEPTION 'Tenant % has no max_users configured — cannot enforce user limit', NEW.tenant_id;
  END IF;

  -- Count active users (excluding the row being inserted, which is not yet committed)
  SELECT count(*) INTO current_count
    FROM users
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'User limit reached: tenant allows % active users', max_allowed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
