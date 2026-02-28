-- Add billing / subscription tables for LexCRM
-- Run this in Supabase SQL Editor

-- =========================================================================
-- Add stripe_customer_id to tenants table
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;
  END IF;
END $$;

-- =========================================================================
-- Subscriptions table — one-per-tenant subscription tracking
-- =========================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trialing',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'One-per-tenant subscription tracking. plan_tier: trial|starter|professional|enterprise. status: trialing|active|past_due|cancelled|incomplete. billing_interval: month|year.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cust ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_tenant_isolation" ON subscriptions
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- =========================================================================
-- Billing invoices table — payment history
-- =========================================================================
CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'draft',
  invoice_url TEXT,
  invoice_pdf TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_invoices IS 'Payment history synced from Stripe. amount is in cents. status: draft|open|paid|failed|void|uncollectible.';

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe ON billing_invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created ON billing_invoices(created_at DESC);

-- RLS
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_invoices_tenant_isolation" ON billing_invoices
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- =========================================================================
-- Plan features table — global config for feature gating per plan
-- =========================================================================
CREATE TABLE IF NOT EXISTS plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_tier TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  limit_value INTEGER,
  UNIQUE(plan_tier, feature_key)
);

COMMENT ON TABLE plan_features IS 'Global config table (no tenant_id, no RLS). Controls which features each plan tier gets. limit_value NULL or -1 means unlimited.';

-- No RLS — public read config table

-- =========================================================================
-- Seed plan_features with default limits
-- -1 = unlimited, NULL = not applicable (for boolean features)
-- =========================================================================
INSERT INTO plan_features (plan_tier, feature_key, enabled, limit_value) VALUES
  -- Trial tier
  ('trial', 'contacts',   true, 100),
  ('trial', 'matters',    true, 25),
  ('trial', 'users',      true, 2),
  ('trial', 'storage_gb', true, 1),
  ('trial', 'documents',  true, NULL),
  ('trial', 'leads',      true, NULL),
  ('trial', 'tasks',      true, NULL),

  -- Starter tier
  ('starter', 'contacts',   true, 500),
  ('starter', 'matters',    true, 100),
  ('starter', 'users',      true, 3),
  ('starter', 'storage_gb', true, 5),
  ('starter', 'documents',  true, NULL),
  ('starter', 'leads',      true, NULL),
  ('starter', 'tasks',      true, NULL),
  ('starter', 'pipeline',   true, NULL),
  ('starter', 'notes',      true, NULL),

  -- Professional tier
  ('professional', 'contacts',    true, -1),
  ('professional', 'matters',     true, -1),
  ('professional', 'users',       true, 10),
  ('professional', 'storage_gb',  true, 25),
  ('professional', 'documents',   true, NULL),
  ('professional', 'leads',       true, NULL),
  ('professional', 'tasks',       true, NULL),
  ('professional', 'pipeline',    true, NULL),
  ('professional', 'notes',       true, NULL),
  ('professional', 'api_access',  true, NULL),
  ('professional', 'audit_logs',  true, NULL),

  -- Enterprise tier
  ('enterprise', 'contacts',    true, -1),
  ('enterprise', 'matters',     true, -1),
  ('enterprise', 'users',       true, -1),
  ('enterprise', 'storage_gb',  true, -1),
  ('enterprise', 'documents',   true, NULL),
  ('enterprise', 'leads',       true, NULL),
  ('enterprise', 'tasks',       true, NULL),
  ('enterprise', 'pipeline',    true, NULL),
  ('enterprise', 'notes',       true, NULL),
  ('enterprise', 'api_access',  true, NULL),
  ('enterprise', 'sso',         true, NULL),
  ('enterprise', 'white_label', true, NULL),
  ('enterprise', 'audit_logs',  true, NULL)
ON CONFLICT (plan_tier, feature_key) DO UPDATE SET
  enabled     = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value;
