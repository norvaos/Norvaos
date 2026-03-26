-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 178 — IRCC Submission Checklist
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks per-matter submission state as lawyers push data to the IRCC portal.
-- Each row = one checklist item (form upload, fee payment, photo, etc.)
-- Status syncs globally — visible in matter shell, side-by-side engine, and reports.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ircc_submission_checklist (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  matter_id      UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,

  -- Item definition
  item_key       TEXT NOT NULL,           -- e.g. 'imm5257_upload', 'photo_upload', 'fee_payment'
  label          TEXT NOT NULL,           -- human-readable label
  category       TEXT NOT NULL DEFAULT 'form',  -- 'form' | 'document' | 'fee' | 'biometric' | 'other'
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_required    BOOLEAN NOT NULL DEFAULT true,

  -- State
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in_progress', 'completed', 'not_applicable', 'blocked')),
  completed_at   TIMESTAMPTZ,
  completed_by   UUID REFERENCES users(id),
  notes          TEXT,

  -- IRCC portal reference
  ircc_ref       TEXT,                    -- confirmation number or reference from portal

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (matter_id, item_key)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE ircc_submission_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_submission_checklist_tenant
  ON ircc_submission_checklist
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ircc_sub_checklist_matter
  ON ircc_submission_checklist(matter_id);

CREATE INDEX IF NOT EXISTS idx_ircc_sub_checklist_status
  ON ircc_submission_checklist(matter_id, status);

-- ── Updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_ircc_sub_checklist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ircc_sub_checklist_updated_at ON ircc_submission_checklist;
CREATE TRIGGER trg_ircc_sub_checklist_updated_at
  BEFORE UPDATE ON ircc_submission_checklist
  FOR EACH ROW EXECUTE FUNCTION fn_ircc_sub_checklist_updated_at();

-- ── Seed: Default checklist template (reusable per matter) ───────────────────
-- These are the standard items for a TRV (Temporary Resident Visa) submission.
-- The API will clone these into each matter when the SBS tab is first opened.

-- No static seed — items are created dynamically per matter based on form pack type.
