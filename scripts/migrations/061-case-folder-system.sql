-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 061: Case Folder System
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds hierarchical folder templates per matter type and folder instances per
-- matter. Documents/slots can be assigned to folders for organized case files.
--
-- For Spousal Sponsorship, seeds a default folder structure:
--   Account, List of Requirements, Client Information (with subfolders),
--   IRCC Forms, Application Ready to Submit, Submitted Application,
--   IRCC Correspondence, Final Decision
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. matter_folder_templates  -  defines the folder hierarchy per matter type ─

CREATE TABLE IF NOT EXISTS matter_folder_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  matter_type_id          UUID NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  parent_id               UUID REFERENCES matter_folder_templates(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL,
  description             TEXT,
  description_translations JSONB DEFAULT '{}'::jsonb,
  icon                    TEXT,            -- lucide icon name
  sort_order              INTEGER NOT NULL DEFAULT 0,
  folder_type             TEXT NOT NULL DEFAULT 'general',
  auto_assign_category    TEXT,            -- maps to document_slot_templates.category
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (matter_type_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mft_matter_type ON matter_folder_templates(matter_type_id);
CREATE INDEX IF NOT EXISTS idx_mft_parent ON matter_folder_templates(parent_id);

ALTER TABLE matter_folder_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY mft_select ON matter_folder_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY mft_insert ON matter_folder_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY mft_update ON matter_folder_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY mft_delete ON matter_folder_templates
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 2. matter_folders  -  per-matter instances of folder templates ──────────────

CREATE TABLE IF NOT EXISTS matter_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  matter_id   UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  template_id UUID REFERENCES matter_folder_templates(id) ON DELETE SET NULL,
  parent_id   UUID REFERENCES matter_folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (matter_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mf_matter ON matter_folders(matter_id);
CREATE INDEX IF NOT EXISTS idx_mf_parent ON matter_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_mf_template ON matter_folders(template_id);

ALTER TABLE matter_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY mf_select ON matter_folders
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY mf_insert ON matter_folders
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY mf_update ON matter_folders
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY mf_delete ON matter_folders
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 3. Link columns ─────────────────────────────────────────────────────────────

ALTER TABLE document_slots
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES matter_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doc_slots_folder ON document_slots(folder_id)
  WHERE folder_id IS NOT NULL;

ALTER TABLE document_slot_templates
  ADD COLUMN IF NOT EXISTS folder_template_id UUID REFERENCES matter_folder_templates(id) ON DELETE SET NULL;


-- ── 4. Seed Spousal Sponsorship folder templates ─────────────────────────────────

DO $$
DECLARE
  v_tenant   RECORD;
  v_mt_id    UUID;
  -- Root folder IDs
  f_account  UUID;
  f_lor      UUID;
  f_client   UUID;
  f_ircc     UUID;
  f_ready    UUID;
  f_submitted UUID;
  f_corr     UUID;
  f_decision UUID;
BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM matter_types LOOP

    -- Find the Spousal Sponsorship matter type
    SELECT id INTO v_mt_id
    FROM matter_types
    WHERE tenant_id = v_tenant.tenant_id
      AND program_category_key = 'spousal'
      AND is_active = true
    LIMIT 1;

    IF v_mt_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip if already seeded
    IF EXISTS (
      SELECT 1 FROM matter_folder_templates
      WHERE matter_type_id = v_mt_id AND slug = 'account'
    ) THEN
      CONTINUE;
    END IF;

    -- ── Root folders ──

    f_account   := gen_random_uuid();
    f_lor       := gen_random_uuid();
    f_client    := gen_random_uuid();
    f_ircc      := gen_random_uuid();
    f_ready     := gen_random_uuid();
    f_submitted := gen_random_uuid();
    f_corr      := gen_random_uuid();
    f_decision  := gen_random_uuid();

    INSERT INTO matter_folder_templates (id, tenant_id, matter_type_id, parent_id, name, slug, icon, sort_order, folder_type, auto_assign_category) VALUES
      (f_account,   v_tenant.tenant_id, v_mt_id, NULL, 'Account',                      'account',          'User',           1, 'general',        NULL),
      (f_lor,       v_tenant.tenant_id, v_mt_id, NULL, 'List of Requirements',          'list_of_requirements', 'ClipboardList', 2, 'general',     NULL),
      (f_client,    v_tenant.tenant_id, v_mt_id, NULL, 'Client Information',            'client_information', 'Users',          3, 'documents',    NULL),
      (f_ircc,      v_tenant.tenant_id, v_mt_id, NULL, 'IRCC Forms',                    'ircc_forms',       'FileText',        4, 'forms',        NULL),
      (f_ready,     v_tenant.tenant_id, v_mt_id, NULL, 'Application Ready to Submit',   'application_ready', 'PackageCheck',   5, 'general',      NULL),
      (f_submitted, v_tenant.tenant_id, v_mt_id, NULL, 'Submitted Application',         'submitted_application', 'Send',       6, 'correspondence', NULL),
      (f_corr,      v_tenant.tenant_id, v_mt_id, NULL, 'IRCC Correspondence',           'ircc_correspondence', 'Mail',         7, 'correspondence', NULL),
      (f_decision,  v_tenant.tenant_id, v_mt_id, NULL, 'Final Decision',                'final_decision',    'Gavel',          8, 'general',      NULL);

    -- ── Client Information subfolders ──

    INSERT INTO matter_folder_templates (tenant_id, matter_type_id, parent_id, name, slug, icon, sort_order, folder_type, auto_assign_category) VALUES
      (v_tenant.tenant_id, v_mt_id, f_client, 'Dependants',           'client_dependants',    'Baby',   1, 'documents', NULL),
      (v_tenant.tenant_id, v_mt_id, f_client, 'Principal Applicant',  'client_principal',     'UserCheck', 2, 'documents', 'identity'),
      (v_tenant.tenant_id, v_mt_id, f_client, 'Relationship',         'client_relationship',  'Heart',  3, 'documents', 'relationship'),
      (v_tenant.tenant_id, v_mt_id, f_client, 'Sponsor',              'client_sponsor',       'Shield', 4, 'documents', NULL);

    -- ── IRCC Forms subfolders ──

    INSERT INTO matter_folder_templates (tenant_id, matter_type_id, parent_id, name, slug, icon, sort_order, folder_type) VALUES
      (v_tenant.tenant_id, v_mt_id, f_ircc, 'Filled and Signed by Client', 'ircc_signed_by_client', 'PenLine', 1, 'forms');

    -- ── Application Ready to Submit subfolders ──

    INSERT INTO matter_folder_templates (tenant_id, matter_type_id, parent_id, name, slug, icon, sort_order, folder_type, auto_assign_category) VALUES
      (v_tenant.tenant_id, v_mt_id, f_ready, 'IRCC Forms',           'ready_ircc_forms',    'FileText',    1, 'forms',     NULL),
      (v_tenant.tenant_id, v_mt_id, f_ready, 'IRCC Payment',         'ready_ircc_payment',  'CreditCard',  2, 'general',   'financial'),
      (v_tenant.tenant_id, v_mt_id, f_ready, 'Supporting Documents', 'ready_supporting',    'Files',       3, 'documents', NULL);

  END LOOP;
END $$;
