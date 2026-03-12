-- Migration 090: Matter Redesign
-- Adds: matter onboarding steps, dynamic intake question schema,
-- intake answers, intake risk flags, IRCC client review,
-- firm address fields, user rep profile fields.

-- ─── 1. Matter onboarding tracking ─────────────────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS matter_onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,        -- 'assignment','key_dates','contacts','case_config','notifications'
  confirmed_at    TIMESTAMPTZ,
  confirmed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(matter_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_matter_onboarding_steps_matter ON matter_onboarding_steps(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_onboarding_steps_tenant ON matter_onboarding_steps(tenant_id);

-- RLS
ALTER TABLE matter_onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_matter_onboarding_steps" ON matter_onboarding_steps
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 2. Dynamic intake question schema per matter type ──────────────────────

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS intake_question_schema JSONB DEFAULT '[]';

-- ─── 3. Matter intake answers (from dynamic question form) ─────────────────
-- (Separate from matter_intake which holds IRCC profile data)

CREATE TABLE IF NOT EXISTS matter_dynamic_intake_answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  answers         JSONB NOT NULL DEFAULT '{}',
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_client BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(matter_id)
);

CREATE INDEX IF NOT EXISTS idx_matter_dynamic_intake_matter ON matter_dynamic_intake_answers(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_dynamic_intake_tenant ON matter_dynamic_intake_answers(tenant_id);

ALTER TABLE matter_dynamic_intake_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_matter_dynamic_intake_answers" ON matter_dynamic_intake_answers
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 4. Intake risk flags (cross-reference intake answers vs IRCC profile) ──

CREATE TABLE IF NOT EXISTS matter_intake_risk_flags (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  source_label    TEXT,                 -- human-readable field name
  intake_value    TEXT,                 -- value from dynamic intake form
  ircc_value      TEXT,                 -- value from ircc_profiles
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(matter_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_intake_risk_flags_matter ON matter_intake_risk_flags(matter_id);
CREATE INDEX IF NOT EXISTS idx_intake_risk_flags_tenant ON matter_intake_risk_flags(tenant_id, severity);

ALTER TABLE matter_intake_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_matter_intake_risk_flags" ON matter_intake_risk_flags
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 5. IRCC client review (plain-English summary → e-sign → file unlock) ──

CREATE TABLE IF NOT EXISTS ircc_client_reviews (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id           UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  signing_request_id  TEXT,             -- external e-sign provider ID
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'signed', 'declined', 'expired')),
  sent_at             TIMESTAMPTZ,
  sent_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  signed_at           TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  download_token      TEXT UNIQUE,      -- fallback: staff uploads signed PDF with this code
  summary_pdf_path    TEXT,             -- storage path for the generated summary PDF
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ircc_client_reviews_matter ON ircc_client_reviews(matter_id);
CREATE INDEX IF NOT EXISTS idx_ircc_client_reviews_tenant ON ircc_client_reviews(tenant_id, status);

ALTER TABLE ircc_client_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_ircc_client_reviews" ON ircc_client_reviews
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 6. Firm address fields (on tenants table) ──────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS address_line1   TEXT,
  ADD COLUMN IF NOT EXISTS address_line2   TEXT,
  ADD COLUMN IF NOT EXISTS city            TEXT,
  ADD COLUMN IF NOT EXISTS province        TEXT,
  ADD COLUMN IF NOT EXISTS postal_code     TEXT,
  ADD COLUMN IF NOT EXISTS country         TEXT DEFAULT 'Canada',
  ADD COLUMN IF NOT EXISTS office_phone    TEXT,
  ADD COLUMN IF NOT EXISTS office_fax      TEXT;

-- ─── 7. User representative profile fields ──────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rep_display_name       TEXT,   -- Name shown on Use of Rep form
  ADD COLUMN IF NOT EXISTS rep_title              TEXT,   -- e.g. "RCIC", "Immigration Lawyer"
  ADD COLUMN IF NOT EXISTS rep_membership_number  TEXT,   -- ICCRC # or Bar #
  ADD COLUMN IF NOT EXISTS rep_phone              TEXT,
  ADD COLUMN IF NOT EXISTS rep_email              TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_url    TEXT;   -- Storage URL for drawn/uploaded signature

-- ─── 8. Reload PostgREST schema cache ──────────────────────────────────────
NOTIFY pgrst, 'reload schema';
