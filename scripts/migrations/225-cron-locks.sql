-- Distributed cron job locking (SC-CRIT-01 from Forensic Audit)
CREATE TABLE IF NOT EXISTS cron_locks (
  lock_id TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  locked_by TEXT
);

-- Auto-cleanup expired locks
CREATE INDEX IF NOT EXISTS idx_cron_locks_expires ON cron_locks(expires_at);
