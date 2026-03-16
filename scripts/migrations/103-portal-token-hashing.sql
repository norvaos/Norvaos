-- Migration 103: Portal Token Hashing
-- Converts portal_links.token from plaintext to SHA-256 hash storage.
-- Uses SHA-256 (not bcrypt) because tokens must be looked up by hash on every request
-- without iterating all rows. SHA-256 is sufficient for high-entropy random tokens.
--
-- Cutover plan:
--   1. Add token_hash column
--   2. Populate token_hash from existing plaintext tokens
--   3. Create index on token_hash
--   4. Application code will be updated to:
--      - On token creation: store SHA-256(token) in token_hash, set token = 'REDACTED'
--      - On token lookup: hash the incoming token, query by token_hash
--   5. After deployment and verification, drop the plaintext token column (separate migration)

-- Step 1: Add token_hash column
ALTER TABLE portal_links
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Step 2: Populate from existing plaintext tokens using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE portal_links
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL AND token != 'REDACTED' AND token_hash IS NULL;

-- Step 3: Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_portal_links_token_hash
  ON portal_links (token_hash)
  WHERE token_hash IS NOT NULL;

-- Step 4: Redact existing plaintext tokens
-- Only redact tokens that have been successfully hashed
UPDATE portal_links
SET token = 'REDACTED'
WHERE token_hash IS NOT NULL AND token != 'REDACTED';

-- Step 5: Add rate limiting tracking columns
ALTER TABLE portal_links
  ADD COLUMN IF NOT EXISTS last_rate_limit_hit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rate_limit_count INTEGER DEFAULT 0;

-- Note: The plaintext 'token' column is kept for now but contains 'REDACTED'.
-- A future migration will drop it after confirming all code paths use token_hash.
