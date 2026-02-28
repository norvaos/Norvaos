-- ============================================================================
-- Migration 013: Intake Forms & Submissions
-- ============================================================================
-- Smart intake questionnaire system. Admins build forms in Settings,
-- publish them with a public shareable URL, and submissions auto-create
-- Contacts + Leads.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. intake_forms — form definitions with JSONB field config
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_forms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text,
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  practice_area_id uuid REFERENCES practice_areas(id) ON DELETE SET NULL,
  pipeline_id   uuid REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id      uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'draft',
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT intake_forms_tenant_slug_unique UNIQUE (tenant_id, slug),
  CONSTRAINT intake_forms_status_check CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_tenant ON intake_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_status ON intake_forms(status);

-- --------------------------------------------------------------------------
-- 2. intake_submissions — public form responses
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id       uuid NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  source_ip     text,
  user_agent    text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  status        text NOT NULL DEFAULT 'new',
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT intake_submissions_status_check CHECK (status IN ('new', 'processed', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_intake_submissions_tenant ON intake_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_form ON intake_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_status ON intake_submissions(status);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_created ON intake_submissions(created_at DESC);

-- --------------------------------------------------------------------------
-- 3. RLS Policies
-- --------------------------------------------------------------------------

ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;

-- intake_forms: authenticated tenant users (full CRUD)
CREATE POLICY intake_forms_tenant_select ON intake_forms
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY intake_forms_tenant_insert ON intake_forms
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY intake_forms_tenant_update ON intake_forms
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY intake_forms_tenant_delete ON intake_forms
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- intake_forms: anonymous SELECT for published forms only (public form rendering)
CREATE POLICY intake_forms_public_select ON intake_forms
  FOR SELECT TO anon
  USING (status = 'published' AND is_active = true);

-- intake_submissions: authenticated tenant users (read)
CREATE POLICY intake_submissions_tenant_select ON intake_submissions
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY intake_submissions_tenant_insert ON intake_submissions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY intake_submissions_tenant_update ON intake_submissions
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- intake_submissions: anonymous INSERT (public form submission)
CREATE POLICY intake_submissions_public_insert ON intake_submissions
  FOR INSERT TO anon
  WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4. Seed: sample intake forms for Immigration practice
-- --------------------------------------------------------------------------

DO $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
  v_practice_area_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
BEGIN
  -- Get the tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- Get the first user
  SELECT id INTO v_user_id FROM users WHERE tenant_id = v_tenant_id LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Get Immigration practice area
  SELECT id INTO v_practice_area_id FROM practice_areas
  WHERE tenant_id = v_tenant_id AND name ILIKE '%immigration%' AND is_active = true
  LIMIT 1;

  -- Get a lead pipeline + first stage for auto-lead creation
  SELECT p.id, ps.id INTO v_pipeline_id, v_stage_id
  FROM pipelines p
  JOIN pipeline_stages ps ON ps.pipeline_id = p.id
  WHERE p.tenant_id = v_tenant_id AND p.pipeline_type = 'lead' AND p.is_active = true
  ORDER BY p.is_default DESC, ps.sort_order ASC
  LIMIT 1;

  -- Form 1: Immigration Consultation Request
  INSERT INTO intake_forms (tenant_id, name, slug, description, fields, settings, practice_area_id, pipeline_id, stage_id, status, is_active, created_by)
  VALUES (
    v_tenant_id,
    'Immigration Consultation Request',
    'immigration-consultation',
    'Request a consultation with our immigration team. We''ll review your case and get back to you within 24 hours.',
    '[
      {"id": "f1", "field_type": "text", "label": "First Name", "placeholder": "Enter your first name", "is_required": true, "sort_order": 0, "mapping": "first_name"},
      {"id": "f2", "field_type": "text", "label": "Last Name", "placeholder": "Enter your last name", "is_required": true, "sort_order": 1, "mapping": "last_name"},
      {"id": "f3", "field_type": "email", "label": "Email Address", "placeholder": "you@example.com", "is_required": true, "sort_order": 2, "mapping": "email_primary"},
      {"id": "f4", "field_type": "phone", "label": "Phone Number", "placeholder": "+1 (555) 000-0000", "is_required": false, "sort_order": 3, "mapping": "phone_primary"},
      {"id": "f5", "field_type": "select", "label": "Type of Immigration Matter", "is_required": true, "sort_order": 4, "options": [{"label": "Express Entry", "value": "express_entry"}, {"label": "Family Sponsorship", "value": "family_sponsorship"}, {"label": "Work Permit", "value": "work_permit"}, {"label": "Study Permit", "value": "study_permit"}, {"label": "Visitor Visa", "value": "visitor_visa"}, {"label": "Other", "value": "other"}]},
      {"id": "f6", "field_type": "select", "label": "Current Country of Residence", "is_required": true, "sort_order": 5, "options": [{"label": "Canada", "value": "canada"}, {"label": "United States", "value": "usa"}, {"label": "India", "value": "india"}, {"label": "Philippines", "value": "philippines"}, {"label": "Nigeria", "value": "nigeria"}, {"label": "Other", "value": "other"}]},
      {"id": "f7", "field_type": "textarea", "label": "Brief Description of Your Situation", "placeholder": "Please describe your immigration situation and what help you need...", "is_required": false, "sort_order": 6, "mapping": "notes"}
    ]'::jsonb,
    '{"success_message": "Thank you for your consultation request! Our immigration team will review your case and contact you within 24 hours."}'::jsonb,
    v_practice_area_id,
    v_pipeline_id,
    v_stage_id,
    'published',
    true,
    v_user_id
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Form 2: General Inquiry (draft)
  INSERT INTO intake_forms (tenant_id, name, slug, description, fields, settings, status, is_active, created_by)
  VALUES (
    v_tenant_id,
    'General Inquiry Form',
    'general-inquiry',
    'Have a question? Fill out this form and we''ll get back to you.',
    '[
      {"id": "g1", "field_type": "text", "label": "Full Name", "placeholder": "Your full name", "is_required": true, "sort_order": 0, "mapping": "first_name"},
      {"id": "g2", "field_type": "email", "label": "Email", "placeholder": "you@example.com", "is_required": true, "sort_order": 1, "mapping": "email_primary"},
      {"id": "g3", "field_type": "phone", "label": "Phone", "placeholder": "+1 (555) 000-0000", "is_required": false, "sort_order": 2, "mapping": "phone_primary"},
      {"id": "g4", "field_type": "textarea", "label": "Your Message", "placeholder": "How can we help you?", "is_required": true, "sort_order": 3, "mapping": "notes"}
    ]'::jsonb,
    '{"success_message": "Thank you for reaching out! We''ll respond within 1 business day."}'::jsonb,
    'draft',
    true,
    v_user_id
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

END $$;

COMMIT;
