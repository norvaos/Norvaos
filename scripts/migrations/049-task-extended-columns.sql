-- Migration 049: Add extended task columns
-- Adds task_type, category, is_billable, visibility, reminder_date, completion_note
-- These columns were defined in TypeScript types but never migrated to the database.

BEGIN;

-- 1. task_type — classifies the kind of work (call, review, follow_up, etc.)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'other';

-- 2. category — client_facing / internal / administrative
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'internal';

-- 3. is_billable — whether the task counts toward billing
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false;

-- 4. visibility — who can see the task (everyone / assigned_only / team)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'everyone';

-- 5. reminder_date — optional date to trigger a reminder
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_date date;

-- 6. completion_note — optional note added when task is completed
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completion_note text;

-- Index for filtering by task_type and category (common filter patterns)
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks (tenant_id, task_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (tenant_id, category) WHERE is_deleted = false;

-- Index for billable task queries (billing/invoicing workflows)
CREATE INDEX IF NOT EXISTS idx_tasks_billable ON tasks (tenant_id, is_billable) WHERE is_deleted = false AND is_billable = true;

-- Index for reminder queries (notification system)
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks (tenant_id, reminder_date) WHERE is_deleted = false AND reminder_date IS NOT NULL;

COMMIT;
