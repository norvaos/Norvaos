-- Phase 3A: Add task_type, category, reminder_date, is_billable, completion_note, visibility to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type     TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS reminder_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_billable   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS visibility    TEXT DEFAULT 'everyone';

-- Check constraints
ALTER TABLE tasks
  ADD CONSTRAINT chk_task_type CHECK (task_type IN ('call','document_collection','form_filling','review','follow_up','meeting','other')),
  ADD CONSTRAINT chk_task_category CHECK (category IN ('client_facing','internal','administrative')),
  ADD CONSTRAINT chk_task_visibility CHECK (visibility IN ('everyone','assigned_only','team'));

-- Index for common filters
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(tenant_id, task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(tenant_id, category);
