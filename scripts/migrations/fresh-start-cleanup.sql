-- ============================================================================
-- FRESH START CLEANUP
-- Run in Supabase SQL Editor (3 steps  -  run each block separately)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop immutability triggers (run this first)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS prevent_audit_log_mutation ON public.audit_logs;
DROP TRIGGER IF EXISTS prevent_trust_audit_mutation ON public.trust_audit_log;
DROP TRIGGER IF EXISTS prevent_invoice_audit_mutation ON public.invoice_audit_log;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Delete everything and keep config (run this second)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  keeper UUID := 'db2d622e-8e75-4c17-91eb-184075e5ae57';

  -- Config tables to PRESERVE (will NOT be touched)
  config_tables TEXT[] := ARRAY[
    'tenants',
    'practice_areas',
    'matter_types',
    'matter_type_schema',
    'matter_stages',
    'matter_stage_pipelines',
    'case_types',
    'checklist_templates',
    'ircc_form_templates',
    'ircc_stream_forms',
    'ircc_question_sets',
    'ircc_question_set_questions',
    'deadline_types',
    'roles',
    'role_permissions',
    'workflow_templates',
    'workflow_template_deadlines',
    'workflow_template_tasks',
    'fee_templates',
    'fee_template_items',
    'booking_pages',
    'booking_page_overrides',
    'communication_templates',
    'document_slot_templates',
    'document_reminder_configs',
    'intake_forms',
    'invoice_templates',
    'invoice_template_soft_cost_rates',
    'invoice_number_sequences',
    'tax_codes',
    'tax_profiles',
    'tax_registrations',
    'disbursement_categories',
    'operating_bank_accounts',
    'trust_bank_accounts',
    'tenant_onboarding',
    'tenant_onboarding_checklist',
    'tenant_onboarding_wizard',
    'tenant_setup_log',
    'tenant_document_library',
    'email_accounts',
    'email_account_access',
    'platform_connections',
    'microsoft_connections',
    'webhooks',
    'ai_prompt_templates',
    'discount_approval_thresholds',
    'sla_configs',
    'user_invites',
    'user_supervision',
    'users',
    'qbo_sync_mappings',
    'matter_type_section_config'
  ];

  tbl RECORD;
  del_count BIGINT;
  total_deleted BIGINT := 0;
  pass INT;
BEGIN
  -- Run 5 passes to handle FK dependency chains
  FOR pass IN 1..5 LOOP
    FOR tbl IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = 'public'
      WHERE c.column_name = 'tenant_id'
        AND c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name != ALL(config_tables)
      ORDER BY c.table_name
    LOOP
      BEGIN
        -- Delete data from OTHER tenants
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id != $1', tbl.table_name) USING keeper;
        GET DIAGNOSTICS del_count = ROW_COUNT;
        IF del_count > 0 THEN
          total_deleted := total_deleted + del_count;
          RAISE NOTICE 'Pass %: Deleted % rows from % (other tenants)', pass, del_count, tbl.table_name;
        END IF;

        -- Delete transactional data from KEEPER tenant too
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', tbl.table_name) USING keeper;
        GET DIAGNOSTICS del_count = ROW_COUNT;
        IF del_count > 0 THEN
          total_deleted := total_deleted + del_count;
          RAISE NOTICE 'Pass %: Deleted % rows from % (keeper)', pass, del_count, tbl.table_name;
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        IF pass = 5 THEN
          RAISE NOTICE 'Pass %: Still FK-blocked on %', pass, tbl.table_name;
        END IF;
      WHEN OTHERS THEN
        RAISE NOTICE 'Pass %: Error on %: %', pass, tbl.table_name, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  -- Delete other tenant rows
  DELETE FROM public.tenants WHERE id != keeper;
  GET DIAGNOSTICS del_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % other tenant(s)', del_count;

  -- Clean orphaned auth users
  DELETE FROM auth.users
  WHERE id NOT IN (SELECT auth_user_id FROM public.users WHERE auth_user_id IS NOT NULL);
  GET DIAGNOSTICS del_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned auth users', del_count;

  RAISE NOTICE 'Done! Total rows deleted: %', total_deleted;
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Recreate immutability triggers (run this last)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TRIGGER prevent_audit_log_mutation
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Only recreate these if the functions exist:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_trust_audit_mutation') THEN
    EXECUTE 'CREATE TRIGGER prevent_trust_audit_mutation
      BEFORE UPDATE OR DELETE ON public.trust_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_trust_audit_mutation()';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_invoice_audit_mutation') THEN
    EXECUTE 'CREATE TRIGGER prevent_invoice_audit_mutation
      BEFORE UPDATE OR DELETE ON public.invoice_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_invoice_audit_mutation()';
  END IF;
END $$;
