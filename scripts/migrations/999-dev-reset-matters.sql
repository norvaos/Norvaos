-- ============================================================================
-- Migration 999: DEV RESET  -  Delete all matters (bypass immutable triggers)
--
-- This function uses TRUNCATE (which bypasses row-level BEFORE DELETE triggers)
-- to clear tables that have immutable DELETE protection, then deletes matters.
--
-- USAGE: Run this migration ONCE in the Supabase SQL editor, then call:
--   SELECT dev_reset_matters();
-- ============================================================================

CREATE OR REPLACE FUNCTION dev_reset_matters()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matters_count INT;
BEGIN
  -- Step 1: TRUNCATE tables with immutable DELETE triggers.
  -- TRUNCATE bypasses FOR EACH ROW BEFORE DELETE triggers in PostgreSQL.
  -- Order matters: clear tables that reference workflow_actions / form_pack_versions first.

  -- meeting_outcomes references workflow_actions → clear it first
  TRUNCATE TABLE meeting_outcomes;

  -- workflow_actions has no_delete trigger → TRUNCATE bypasses it
  TRUNCATE TABLE workflow_actions;

  -- form_pack_artifacts references form_pack_versions → clear it first
  TRUNCATE TABLE form_pack_artifacts;

  -- form_pack_versions has no_delete trigger → TRUNCATE bypasses it
  TRUNCATE TABLE form_pack_versions;

  -- Step 2: Null out leads.converted_matter_id (restrictive FK, no CASCADE)
  UPDATE leads SET converted_matter_id = NULL WHERE converted_matter_id IS NOT NULL;

  -- Step 3: Delete all matters  -  ON DELETE CASCADE handles all remaining child tables
  -- (ircc_profiles, form_packs, matter_deadlines, matter_stage_state, portal_links,
  --  booking_appointments, check_in_sessions, calendar_events, communications,
  --  matter_invoices, compliance_snapshots, case_folders, etc.)
  DELETE FROM matters;

  SELECT COUNT(*) INTO v_matters_count FROM matters;

  RETURN jsonb_build_object(
    'success', true,
    'matters_remaining', v_matters_count
  );
END;
$$;

-- Grant execute to the service role so it can be called via RPC
GRANT EXECUTE ON FUNCTION dev_reset_matters() TO service_role;
