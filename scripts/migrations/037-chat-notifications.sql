-- Migration 037: Chat & Notification Infrastructure
-- Adds RLS policies for chat and notification tables,
-- performance indexes, and enables Supabase Realtime.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RLS on notifications table (was missing)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_tenant_isolation
  ON notifications
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RLS on chat tables (were missing)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_channels_tenant_isolation
  ON chat_channels
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_tenant_isolation
  ON chat_messages
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Performance indexes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant
  ON chat_channels(tenant_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
  ON chat_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON notifications(tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Enable Supabase Realtime on key tables
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE matter_comments;

COMMIT;
