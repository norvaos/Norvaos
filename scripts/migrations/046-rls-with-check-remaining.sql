-- ============================================================================
-- Migration 046: RLS WITH CHECK  -  Remaining Tenant-Scoped Tables
-- ============================================================================
-- Go/No-Go audit revealed 14 tenant-scoped tables that were not covered by
-- migration 045. These tables exist, have tenant_id, but were missing from
-- the tables_to_harden array.
--
-- Applies the same USING + WITH CHECK pattern scoped to `authenticated` role.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tables_to_harden TEXT[] := ARRAY[
    'calendar_event_attendees',
    'client_notifications',
    'document_reminder_configs',
    'document_reminders',
    'document_slot_templates',
    'document_slots',
    'email_logs',
    'ircc_form_templates',
    'ircc_questionnaire_sessions',
    'matter_checklist_items',
    'matter_comments',
    'matter_intake',
    'matter_people',
    'risk_override_history'
  ];
BEGIN
  FOR t IN SELECT unnest(tables_to_harden) LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping %  -  table does not exist', t;
      CONTINUE;
    END IF;

    -- Skip if table doesn't have tenant_id column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      RAISE NOTICE 'Skipping %  -  no tenant_id column', t;
      CONTINUE;
    END IF;

    -- Drop existing tenant isolation policies (various naming patterns)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_rls ON %I', t, t);

    -- Create unified USING + WITH CHECK policy for authenticated users
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
       FOR ALL TO authenticated
       USING (tenant_id = public.get_current_tenant_id())
       WITH CHECK (tenant_id = public.get_current_tenant_id())',
      t, t
    );

    RAISE NOTICE 'Hardened RLS on %', t;
  END LOOP;
END $$;
