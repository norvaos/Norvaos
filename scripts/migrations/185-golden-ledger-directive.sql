/**
 * Migration 185 — Golden Ledger Directive (20.0)
 *
 * 1. admin_alerts table — system-generated alerts for TRUST_MISMATCH, etc.
 * 2. trust_transactions.reason_code — LedgerGuard enforcement column
 *
 * RLS-enabled, tenant-isolated.
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Admin Alerts — System-generated alerts for admin dashboard
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL,  -- 'TRUST_MISMATCH', 'STAFF_OVERLOAD', etc.
  severity        TEXT NOT NULL DEFAULT 'minor'
                    CHECK (severity IN ('exact', 'minor', 'major', 'critical')),
  title           TEXT NOT NULL,
  description     TEXT,
  entity_type     TEXT,  -- 'matter', 'contact', 'trust_account', etc.
  entity_id       UUID,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one alert per type+entity (upsert-friendly)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_alerts_upsert
  ON admin_alerts (tenant_id, alert_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_alerts_tenant   ON admin_alerts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type     ON admin_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_status   ON admin_alerts (status);

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_alerts_tenant_isolation ON admin_alerts
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. LedgerGuard: Add reason_code to trust_transactions
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trust_transactions' AND column_name = 'reason_code'
  ) THEN
    ALTER TABLE trust_transactions ADD COLUMN reason_code TEXT;
  END IF;
END $$;

COMMENT ON COLUMN trust_transactions.reason_code IS
  'LedgerGuard: Required reason code for every trust modification. '
  'Approved codes: client_deposit, government_fee, professional_fee, disbursement, '
  'client_refund, inter_matter_transfer, bank_fee, interest_credit, opening_balance, '
  'clio_migration, correction, reversal, court_order.';
