-- ============================================================================
-- Migration 008: Add matter_type_id and person_scope to leads table
-- These columns support the consultation workflow where a lead's matter type
-- is selected in Core Data before conversion. matter_type_id drives all
-- downstream automation (kit activation, document slots, stage pipelines).
-- ============================================================================

-- 1. Add matter_type_id column with FK to matter_types
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id) ON DELETE SET NULL;

-- 2. Add person_scope column (single, couple, family)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS person_scope VARCHAR(20) DEFAULT 'single'
    CHECK (person_scope IN ('single', 'couple', 'family'));

-- 3. Index for filtering leads by matter type
CREATE INDEX IF NOT EXISTS idx_leads_matter_type
  ON leads (matter_type_id) WHERE matter_type_id IS NOT NULL;

-- 4. Fix RLS policy on leads — add WITH CHECK for UPDATE/INSERT support
-- Drop the old USING-only policy and recreate with both clauses
DO $$
BEGIN
  -- Drop old policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'tenant_isolation_leads'
  ) THEN
    DROP POLICY tenant_isolation_leads ON leads;
  END IF;

  -- Create new policy with both USING and WITH CHECK
  CREATE POLICY tenant_isolation_leads ON leads
    FOR ALL TO authenticated
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());
END;
$$;
