-- Migration tracking table
-- Run this ONCE on each environment (dev, staging, production)
-- Tracks which migrations have been applied to prevent re-runs

CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT -- optional SHA256 of the migration file
);

COMMENT ON TABLE _migrations IS 'Tracks applied database migrations. Do not modify manually.';

-- Seed with already-applied migrations
INSERT INTO _migrations (name, applied_at) VALUES
  ('001_initial_schema',        '2026-02-20T00:00:00Z'),
  ('002_documents_notes_audit', '2026-02-24T00:00:00Z'),
  ('003_lead_pipelines',        '2026-02-24T00:00:00Z'),
  ('004_billing_subscriptions', '2026-02-25T00:00:00Z')
ON CONFLICT (name) DO NOTHING;
