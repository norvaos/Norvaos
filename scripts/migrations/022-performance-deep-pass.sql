-- Migration 022: Deep Performance Pass
-- Additional indexes and optimizations found during second performance audit

-- ─── 1. Leads: kanban board hot path (pipeline + stage + status) ─────────────
CREATE INDEX IF NOT EXISTS idx_leads_tenant_pipeline_status
  ON leads(tenant_id, pipeline_id, status)
  WHERE status = 'open';

-- Leads: stage_entered_at for days-in-stage calculation
CREATE INDEX IF NOT EXISTS idx_leads_stage_entered
  ON leads(tenant_id, stage_id, stage_entered_at);

-- ─── 2. Documents: task document counts query ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_task_id
  ON documents(task_id)
  WHERE task_id IS NOT NULL;

-- Documents: matter-scoped document listing
CREATE INDEX IF NOT EXISTS idx_documents_tenant_matter
  ON documents(tenant_id, matter_id);

-- ─── 3. Activities: per-entity timeline (very common query) ──────────────────
CREATE INDEX IF NOT EXISTS idx_activities_entity
  ON activities(entity_type, entity_id, created_at DESC);

-- ─── 4. Notifications: user inbox + unread count ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;

-- ─── 5. Entity tags: tag lookup by entity ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity
  ON entity_tags(entity_type, entity_id);

-- ─── 6. Invoices: tenant + matter scoped listing ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_matter
  ON invoices(tenant_id, matter_id);

-- ─── 7. Appointments: tenant + date range queries ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date
  ON appointments(tenant_id, appointment_date, start_time);

-- ─── 8. Booking pages: tenant active listing ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_booking_pages_tenant_active
  ON booking_pages(tenant_id, created_at DESC)
  WHERE is_active = true;

-- ─── 9. Portal links: matter-scoped active links ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portal_links_matter
  ON portal_links(matter_id)
  WHERE revoked_at IS NULL;

-- ─── 10. Automation execution log: rule + date ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_automation_log_rule
  ON automation_execution_log(tenant_id, automation_rule_id, executed_at DESC);
