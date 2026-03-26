-- Migration 198: Microsoft Graph Webhook Subscriptions
-- Replaces polling-based sync with real-time Graph webhooks

BEGIN;

CREATE TABLE IF NOT EXISTS graph_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  connection_id UUID NOT NULL REFERENCES microsoft_connections(id) ON DELETE CASCADE,
  graph_subscription_id TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL DEFAULT 'me/drive/root',
  change_types TEXT NOT NULL DEFAULT 'created,updated,deleted',
  client_state TEXT NOT NULL,
  notification_url TEXT NOT NULL,
  expiration_datetime TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_notification_at TIMESTAMPTZ,
  last_sync_triggered_at TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE graph_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "graph_webhook_subscriptions_tenant_isolation" ON graph_webhook_subscriptions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graph_webhooks_connection ON graph_webhook_subscriptions(connection_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_graph_webhooks_graph_sub_id ON graph_webhook_subscriptions(graph_subscription_id);
CREATE INDEX IF NOT EXISTS idx_graph_webhooks_expiration ON graph_webhook_subscriptions(expiration_datetime) WHERE is_active = true;

-- Service role policy for webhook processing (webhooks come from Microsoft, not a user session)
CREATE POLICY "graph_webhook_subscriptions_service_role" ON graph_webhook_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
