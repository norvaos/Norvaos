-- ============================================================================
-- Migration 093: Job Queue Infrastructure
-- ============================================================================
-- Provides async job processing for email sync, Python worker tasks,
-- notifications, OneDrive sync, delegation/break-glass expiry checks, etc.
-- ============================================================================

-- ─── 1. job_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  result JSONB,
  idempotency_key TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. job_run_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id UUID NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_job_runs_dequeue ON job_runs (priority DESC, scheduled_for ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_job_runs_type_tenant ON job_runs (job_type, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_runs_idempotency ON job_runs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs (status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_job_run_logs_job ON job_run_logs (job_run_id);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_job_runs" ON job_runs
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "tenant_isolation_job_run_logs" ON job_run_logs
  USING (job_run_id IN (SELECT id FROM job_runs WHERE tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())));

-- ─── 5. Service role bypass (for worker) ─────────────────────────────────────

CREATE POLICY "service_role_job_runs" ON job_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_job_run_logs" ON job_run_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
