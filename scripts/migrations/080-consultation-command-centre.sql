-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 080: Consultation Command Centre — Controlled Workflow
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates the retainer fee template system and extends existing tables for
-- the controlled consultation-to-retention workflow.
--
-- Key rule: No matter number is created unless all file-opening gates pass.
-- Consultation outcome, retention intent, retainer state, payment state, and
-- file opening are distinct operational layers.
--
-- New tables:
--   1. retainer_fee_templates — fee structure templates per matter_type + person_scope
--
-- Extended tables:
--   2. lead_retainer_packages — add matter_type_id, person_scope, template link
--   3. matters — add person_scope
--
-- Note: lead_consultations.outcome already supports send_retainer, follow_up_later,
--       need_more_documents, client_declined, not_a_fit. We add referred_out and
--       book_follow_up via text column (no CHECK constraint to alter).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. retainer_fee_templates ──────────────────────────────────────────────
--
-- Phase 1: Fee structure templates ONLY (pricing bundles).
-- NOT document-generation templates. Named explicitly to avoid confusion.
--
-- person_scope is a phase-one billing abstraction (single / joint).
-- It should NOT be treated as the final domain model for all practice areas.
-- Future phases may introduce more granular scoping (e.g., family with N dependants).

CREATE TABLE IF NOT EXISTS retainer_fee_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id UUID NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  person_scope TEXT NOT NULL DEFAULT 'single' CHECK (person_scope IN ('single', 'joint')),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Fee structures stored as JSONB arrays
  -- professional_fees: [{ "description": "...", "quantity": 1, "unitPrice": 3500 }]
  -- government_fees:   [{ "description": "...", "amount": 1325 }]
  -- disbursements:     [{ "description": "...", "amount": 50 }]
  professional_fees JSONB NOT NULL DEFAULT '[]'::jsonb,
  government_fees JSONB NOT NULL DEFAULT '[]'::jsonb,
  disbursements JSONB NOT NULL DEFAULT '[]'::jsonb,
  hst_applicable BOOLEAN NOT NULL DEFAULT false,
  billing_type TEXT NOT NULL DEFAULT 'flat_fee',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique: only one default per (tenant, matter_type, person_scope)
CREATE UNIQUE INDEX IF NOT EXISTS uq_retainer_fee_template_default
  ON retainer_fee_templates(tenant_id, matter_type_id, person_scope)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_retainer_fee_templates_lookup
  ON retainer_fee_templates(tenant_id, matter_type_id, person_scope)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_retainer_fee_templates_tenant
  ON retainer_fee_templates(tenant_id);

ALTER TABLE retainer_fee_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retainer_fee_templates_tenant_isolation ON retainer_fee_templates;
CREATE POLICY retainer_fee_templates_tenant_isolation ON retainer_fee_templates
  USING (tenant_id = get_current_tenant_id());

-- ─── 2. Extend lead_retainer_packages ────────────────────────────────────────
-- Link retainer packages to matter type, person scope, and fee template

ALTER TABLE lead_retainer_packages
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id),
  ADD COLUMN IF NOT EXISTS person_scope TEXT DEFAULT 'single' CHECK (person_scope IN ('single', 'joint')),
  ADD COLUMN IF NOT EXISTS retainer_fee_template_id UUID REFERENCES retainer_fee_templates(id),
  ADD COLUMN IF NOT EXISTS template_customized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsible_lawyer_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'flat_fee';

-- ─── 3. Extend matters table ──────────────────────────────────────────────────
-- person_scope: phase-one billing abstraction (single / joint).
-- See note above — this is not the final domain model.

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS person_scope TEXT DEFAULT 'single'
  CHECK (person_scope IN ('single', 'joint'));

-- ─── 4. Extend leads table ────────────────────────────────────────────────────
-- matter_type_id: pre-select the matter type during intake / Core Data so it
-- flows into the consultation outcome without re-entry.
-- person_scope: billing abstraction set early in the lead lifecycle.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id),
  ADD COLUMN IF NOT EXISTS person_scope TEXT DEFAULT 'single'
  CHECK (person_scope IN ('single', 'joint'));
