-- Migration: 007-task-overhaul
-- Description: Update task statuses to Monday.com style, add new task columns, enable task attachments

-- Migrate existing task statuses to new values
UPDATE tasks SET status = 'not_started' WHERE status = 'pending';
UPDATE tasks SET status = 'working_on_it' WHERE status = 'in_progress';
UPDATE tasks SET status = 'stuck' WHERE status = 'waiting';
UPDATE tasks SET status = 'done' WHERE status = 'completed';
-- 'cancelled' stays unchanged

-- Add new columns for advanced task management
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timeline_end DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_checkbox BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Index for soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_tasks_is_deleted ON tasks(is_deleted) WHERE is_deleted = false;

-- Add task_id to documents table for task file attachments
ALTER TABLE documents ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_task ON documents(task_id);
