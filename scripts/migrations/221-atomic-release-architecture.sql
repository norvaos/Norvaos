-- =============================================================================
-- Directive 079: The Atomic Release Architecture
-- =============================================================================
-- Tracks every release/deploy so the God Portal can show version history
-- and provide one-click rollback. Add-only schema  -  no drops, no renames.
-- =============================================================================

-- ── Release Log ──────────────────────────────────────────────────────────────
-- Each deploy (staging or production) records a row here.
-- Rollbacks create a NEW row with `is_rollback = true`.

CREATE TABLE IF NOT EXISTS _release_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT        NOT NULL,           -- semver e.g. "1.2.3"
  build_sha     TEXT        NOT NULL,           -- git commit SHA
  environment   TEXT        NOT NULL DEFAULT 'production'
                            CHECK (environment IN ('production', 'staging', 'development')),
  deploy_slot   TEXT        NOT NULL DEFAULT 'blue'
                            CHECK (deploy_slot IN ('blue', 'green')),
  status        TEXT        NOT NULL DEFAULT 'deploying'
                            CHECK (status IN ('deploying', 'healthy', 'failed', 'rolled_back')),
  deploy_source TEXT        NOT NULL DEFAULT 'ci'
                            CHECK (deploy_source IN ('ci', 'manual', 'rollback')),
  -- Docker image tag (if applicable)
  docker_tag    TEXT,
  -- Health check result
  health_check_passed BOOLEAN DEFAULT FALSE,
  health_check_at     TIMESTAMPTZ,
  -- Rollback tracking
  is_rollback           BOOLEAN   NOT NULL DEFAULT FALSE,
  rolled_back_from_id   UUID      REFERENCES _release_log(id),
  -- Migration tracking  -  how many migrations were applied in this release
  migrations_applied    INT       NOT NULL DEFAULT 0,
  migration_names       TEXT[],   -- array of migration filenames applied
  -- Who triggered
  triggered_by          TEXT,     -- platform admin email or 'ci-pipeline'
  -- Netlify deploy ID for API-level rollback
  netlify_deploy_id     TEXT,
  -- Timestamps
  deployed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  rolled_back_at        TIMESTAMPTZ,
  -- Notes
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_release_log_env_deployed
  ON _release_log (environment, deployed_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_log_status
  ON _release_log (status);

-- ── Migration Guard Log ──────────────────────────────────────────────────────
-- Tracks migration safety classification (add-only vs destructive).
-- The CI pipeline logs each migration here during dry-run analysis.

CREATE TABLE IF NOT EXISTS _migration_guard_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name  TEXT NOT NULL,
  classification  TEXT NOT NULL DEFAULT 'safe'
                  CHECK (classification IN ('safe', 'additive', 'destructive', 'blocked')),
  -- What the migration does
  operations      JSONB NOT NULL DEFAULT '[]',  -- [{type: "ADD_COLUMN", table: "matters", column: "foo"}]
  -- Was it allowed to proceed?
  allowed         BOOLEAN NOT NULL DEFAULT TRUE,
  blocked_reason  TEXT,
  -- Who ran the check
  checked_by      TEXT NOT NULL DEFAULT 'ci-pipeline',
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Linked release
  release_id      UUID REFERENCES _release_log(id)
);

CREATE INDEX IF NOT EXISTS idx_migration_guard_name
  ON _migration_guard_log (migration_name);

-- ── RLS: Only platform admins can read release data ──────────────────────────
-- These tables are read via service_role (API routes behind withNexusAdmin),
-- so we enable RLS but allow service_role full access.

ALTER TABLE _release_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE _migration_guard_log ENABLE ROW LEVEL SECURITY;

-- Service role (used by API routes) gets full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = '_release_log' AND policyname = 'service_role_release_log'
  ) THEN
    CREATE POLICY service_role_release_log ON _release_log
      FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = '_migration_guard_log' AND policyname = 'service_role_migration_guard'
  ) THEN
    CREATE POLICY service_role_migration_guard ON _migration_guard_log
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
