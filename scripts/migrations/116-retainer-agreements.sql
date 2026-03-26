-- ============================================================================
-- Migration 116: retainer_agreements  -  Matter-scoped retainer generation flow
-- ============================================================================
-- Creates the retainer_agreements table for the 6-step generation modal.
-- Separate from lead_retainer_packages (which tracks pre-matter retainers).
-- ============================================================================

CREATE TABLE IF NOT EXISTS retainer_agreements (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id             UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,

  -- Billing structure (Step 1)
  billing_type          TEXT        NOT NULL DEFAULT 'flat_fee',
  -- 'flat_fee' | 'hourly' | 'contingency' | 'hybrid'
  flat_fee_amount       NUMERIC(12,2),
  hourly_rate           NUMERIC(12,2),
  estimated_hours       NUMERIC(8,2),
  contingency_pct       NUMERIC(5,2),

  -- Scope of services (Step 2)
  scope_of_services     TEXT,

  -- Fee schedule (Step 3)  -  JSONB array of { description, amount, quantity }
  fee_schedule          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  hst_applicable        BOOLEAN      NOT NULL DEFAULT true,
  hst_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.13,
  subtotal_cents        INTEGER      NOT NULL DEFAULT 0,
  tax_amount_cents      INTEGER      NOT NULL DEFAULT 0,
  total_amount_cents    INTEGER      NOT NULL DEFAULT 0,

  -- Signing method (Step 4)
  signing_method        TEXT        NOT NULL DEFAULT 'manual',
  -- 'docusign' | 'manual' | 'in_person'

  -- Status lifecycle
  status                TEXT        NOT NULL DEFAULT 'draft',
  -- 'draft' | 'sent_for_signing' | 'signed' | 'voided'
  signed_at             TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,
  voided_reason         TEXT,

  -- Post-signing automation
  matter_auto_created   BOOLEAN     NOT NULL DEFAULT false,
  stage_advanced        BOOLEAN     NOT NULL DEFAULT false,

  -- Audit
  created_by            UUID        REFERENCES users(id),
  updated_by            UUID        REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_retainer_agreements_matter_id  ON retainer_agreements(matter_id);
CREATE INDEX IF NOT EXISTS idx_retainer_agreements_tenant_id  ON retainer_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retainer_agreements_status     ON retainer_agreements(status);

-- RLS
ALTER TABLE retainer_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retainer_agreements_tenant_select" ON retainer_agreements
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "retainer_agreements_tenant_insert" ON retainer_agreements
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "retainer_agreements_tenant_update" ON retainer_agreements
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
