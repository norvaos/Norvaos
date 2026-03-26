-- ============================================================================
-- Migration 129: Refusal Workflow, Closure Columns, Submission Confirmation
-- ============================================================================
-- 1. Extend ircc_correspondence for refusal workflow columns
-- 2. Create refusal_actions audit table
-- 3. Add closure columns to matters
-- 4. Extend matters status check constraint to include 'refused' and
--    'closed_withdrawn' (needed by Task 3 close route)
-- 5. Add submission confirmation columns to matter_intake
--
-- 2026-03-17  -  Sprint 6, Week 2
-- ============================================================================

-- ─── 1. ircc_correspondence: refusal workflow columns ────────────────────────

ALTER TABLE ircc_correspondence
  ADD COLUMN IF NOT EXISTS jr_deadline              DATE,
  ADD COLUMN IF NOT EXISTS jr_basis                 TEXT
    CHECK (jr_basis IN ('inland', 'outside_canada')),
  ADD COLUMN IF NOT EXISTS jr_matter_id             UUID
    REFERENCES matters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reapplication_matter_id  UUID
    REFERENCES matters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_notified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS urgent_task_id           UUID
    REFERENCES tasks(id) ON DELETE SET NULL;

-- ─── 2. refusal_actions audit table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refusal_actions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  correspondence_id UUID        NOT NULL REFERENCES ircc_correspondence(id) ON DELETE CASCADE,
  matter_id         UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  action_type       TEXT        NOT NULL CHECK (action_type IN (
    'jr_deadline_set',
    'urgent_task_created',
    'client_notified',
    'jr_matter_created',
    'reapplication_matter_created'
  )),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ra_matter_id ON refusal_actions(matter_id);
CREATE INDEX IF NOT EXISTS idx_ra_correspondence_id ON refusal_actions(correspondence_id);
CREATE INDEX IF NOT EXISTS idx_ra_tenant_id ON refusal_actions(tenant_id);

ALTER TABLE refusal_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ra_tenant_select ON refusal_actions;
DROP POLICY IF EXISTS ra_tenant_insert ON refusal_actions;

CREATE POLICY "ra_tenant_select" ON refusal_actions
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "ra_tenant_insert" ON refusal_actions
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

COMMENT ON TABLE refusal_actions IS
  'Immutable audit trail for each action taken during an IRCC refusal workflow. '
  'One row per action (jr_deadline_set, urgent_task_created, client_notified, '
  'jr_matter_created, reapplication_matter_created). Sprint 6, Week 2.';

-- ─── 3. matters: closure columns ─────────────────────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ;

-- ─── 4. matters: extend status CHECK to include 'refused' + 'closed_withdrawn' ──
-- The existing constraint from migration 108 allows:
--   'intake','active','on_hold','closed_won','closed_lost','archived','import_reverted'
-- We add 'refused' (set by handle-refusal route) and 'closed_withdrawn' (close route).

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS matters_status_check;

ALTER TABLE matters
  ADD CONSTRAINT matters_status_check CHECK (status IN (
    'intake',
    'active',
    'on_hold',
    'closed_won',
    'closed_lost',
    'closed_withdrawn',
    'refused',
    'archived',
    'import_reverted'
  ));

-- ─── 5. matter_intake: submission confirmation columns ───────────────────────

ALTER TABLE matter_intake
  ADD COLUMN IF NOT EXISTS submission_confirmation_number   TEXT,
  ADD COLUMN IF NOT EXISTS submission_confirmation_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS submission_confirmed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_confirmed_by          UUID
    REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- END Migration 129
-- ============================================================================
