-- ============================================================================
-- Migration 045: RLS WITH CHECK on All Tenant-Scoped Tables
-- ============================================================================
-- Phase 7 Fix 6: Defense-in-depth for multi-tenant isolation.
--
-- Problem: Migration 043 added USING + WITH CHECK to matters, contacts, leads,
-- activities, and dob_lockouts. ~30+ other tenant-scoped tables only have USING
-- policies  -  they prevent cross-tenant reads but allow inserts/updates with a
-- wrong tenant_id.
--
-- Fix: Apply USING + WITH CHECK to ALL tenant-scoped tables. Uses the cached
-- get_current_tenant_id() function (same as 043). Scoped to `authenticated` role
-- to avoid conflicting with existing anonymous/public policies (e.g. booking_pages
-- public read, intake_submissions anonymous insert).
--
-- Note: Service-role (admin client) bypasses RLS regardless, so these policies
-- only affect authenticated user sessions.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tables_to_harden TEXT[] := ARRAY[
    -- Core tables (initial schema)
    'roles', 'users', 'api_keys', 'tags', 'entity_tags',
    'contact_relationships', 'pipelines', 'pipeline_stages',
    'practice_areas', 'matter_contacts', 'task_templates', 'tasks',
    'time_entries', 'document_folders', 'documents', 'document_requests',
    'document_templates', 'communications', 'email_templates',
    'appointments', 'booking_links', 'invoices', 'payments',
    'chat_channels', 'chat_messages', 'custom_field_definitions',
    'contracts',
    -- Automation tables
    'workflow_automations', 'automation_logs', 'automation_queue',
    -- Marketing tables
    'marketing_lists', 'marketing_campaigns', 'unsubscribes',
    -- UI tables
    'saved_views', 'ai_interactions',
    -- Multi-practice tables (migration 009)
    'matter_types', 'matter_stage_pipelines', 'matter_stages',
    'deadline_types', 'matter_type_schema', 'matter_custom_data',
    'workflow_templates', 'matter_stage_state',
    -- Booking tables (migration 020)
    'booking_pages', 'booking_page_overrides',
    -- Intake tables (migration 013)
    'intake_forms', 'intake_submissions',
    -- Risk tables (migration 024)
    'risk_assessments',
    -- Document engine (migration 028)
    'document_versions', 'checklist_items',
    -- Portal + notifications
    'portal_links', 'notifications', 'push_subscriptions',
    -- Billing
    'retainer_presets',
    -- Controlled workflow (migrations 042-043)
    'check_in_sessions', 'workflow_actions', 'meeting_outcomes',
    'booking_appointments', 'user_invites',
    -- Tables already hardened in 043 (re-applied for idempotency)
    'matters', 'contacts', 'leads', 'activities', 'dob_lockouts'
  ];
BEGIN
  FOR t IN SELECT unnest(tables_to_harden) LOOP
    -- Skip if table doesn't exist (defensive  -  some tables may not exist in all envs)
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
