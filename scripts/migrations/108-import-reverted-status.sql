-- Migration 108: Add import_reverted to matters status check constraint
--
-- The rollback engine sets status = 'import_reverted' when undoing an import batch.
-- The existing check constraint only allowed the 6 normal business statuses, causing
-- the rollback update to fail with a constraint violation and silently leave matters
-- in their original status instead of being marked as reverted.
--
-- This value must NEVER appear in business-facing UIs or reports — it is filtered
-- out at the query layer via IMPORT_REVERTED_STATUS from lib/utils/matter-status.ts.

BEGIN;

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS matters_status_check;

ALTER TABLE matters
  ADD CONSTRAINT matters_status_check CHECK (status IN (
    'intake',
    'active',
    'on_hold',
    'closed_won',
    'closed_lost',
    'archived',
    'import_reverted'
  ));

COMMIT;
