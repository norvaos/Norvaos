-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 222: WebAuthn / Passkeys Infrastructure (Target 13)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates tables for FIDO2 WebAuthn credential management:
--   - user_passkeys: Stores registered passkey credentials (public keys)
--   - webauthn_challenges: Ephemeral challenge records (one-time use)
--
-- RLS: user_passkeys scoped to user_id via auth.uid() junction
-- Challenges auto-expire and are cleaned up by a cron or on consumption.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── user_passkeys ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_passkeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   TEXT NOT NULL,          -- base64url-encoded credential ID
  public_key      TEXT NOT NULL,          -- base64url-encoded COSE public key
  sign_counter    BIGINT NOT NULL DEFAULT 0,
  authenticator_type TEXT NOT NULL DEFAULT 'platform', -- 'platform' | 'cross-platform'
  device_name     TEXT NOT NULL DEFAULT 'Unknown Device',
  aaguid          TEXT DEFAULT '',        -- authenticator AAGUID
  backed_up       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_passkeys_credential UNIQUE (credential_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
  ON user_passkeys(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id
  ON user_passkeys(credential_id) WHERE is_active = true;

-- RLS
ALTER TABLE user_passkeys ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own passkeys
CREATE POLICY user_passkeys_select ON user_passkeys
  FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY user_passkeys_insert ON user_passkeys
  FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY user_passkeys_update ON user_passkeys
  FOR UPDATE
  USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- No delete policy — soft delete via is_active = false

-- ── webauthn_challenges ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,             -- user UUID or '__discoverable__'
  challenge   TEXT NOT NULL,             -- base64url-encoded random challenge
  type        TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for challenge lookup
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_lookup
  ON webauthn_challenges(user_id, challenge, type);

-- Auto-cleanup: index on expires_at for efficient deletion
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry
  ON webauthn_challenges(expires_at);

-- RLS — challenges are managed server-side via service_role
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — all access via admin/service_role client

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_passkeys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_passkeys_updated_at ON user_passkeys;
CREATE TRIGGER trg_user_passkeys_updated_at
  BEFORE UPDATE ON user_passkeys
  FOR EACH ROW
  EXECUTE FUNCTION update_user_passkeys_updated_at();

-- ── Cleanup function for expired challenges ──────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_webauthn_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM webauthn_challenges WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
