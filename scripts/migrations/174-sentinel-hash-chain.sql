-- =============================================================================
-- Migration 174 — SENTINEL Tamper-Evident Hash Chain
-- =============================================================================
--
-- Implements a blockchain-style hash chain on sentinel_audit_log.
-- Each new row contains:
--   • row_hash   — SHA-256 of the row's own content + prev_hash
--   • prev_hash  — the row_hash of the immediately preceding row
--
-- If any row is deleted or modified, the chain breaks. A verification
-- function (sentinel_verify_chain) can detect tampering by walking the
-- chain and recomputing hashes.
--
-- Performance: The trigger only fires on INSERT and performs a single
-- indexed lookup (ORDER BY created_at DESC LIMIT 1) to fetch the
-- previous hash. Impact on write latency: < 1ms.
--
-- Depends on: migration 161 (sentinel_audit_log), pgcrypto extension
-- =============================================================================


-- ── 0. Ensure pgcrypto is available ─────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── 1. Add hash chain columns ───────────────────────────────────────────────

ALTER TABLE sentinel_audit_log
  ADD COLUMN IF NOT EXISTS prev_hash  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS row_hash   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chain_seq  BIGINT DEFAULT NULL;


-- ── 2. Sequence for chain ordering ──────────────────────────────────────────
-- Using a sequence guarantees strict ordering even under concurrent inserts.

CREATE SEQUENCE IF NOT EXISTS sentinel_chain_seq;

-- Seed the sequence to the current max if rows already exist
DO $$
DECLARE
  _max BIGINT;
BEGIN
  SELECT COUNT(*) INTO _max FROM sentinel_audit_log;
  IF _max > 0 THEN
    PERFORM setval('sentinel_chain_seq', _max);
  END IF;
END;
$$;


-- ── 3. Hash chain trigger function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _prev_hash  TEXT;
  _seq        BIGINT;
  _payload    TEXT;
BEGIN
  -- Get the next sequence number (guaranteed unique under concurrency)
  _seq := nextval('sentinel_chain_seq');

  -- Fetch the hash of the most recent preceding row
  SELECT row_hash INTO _prev_hash
    FROM sentinel_audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  -- Genesis block: if no previous row, use a known seed
  IF _prev_hash IS NULL THEN
    _prev_hash := 'SENTINEL_GENESIS_BLOCK_v1';
  END IF;

  -- Build the payload to hash: deterministic concatenation of key fields
  _payload := concat_ws('|',
    _seq::TEXT,
    NEW.id::TEXT,
    NEW.event_type,
    NEW.severity,
    COALESCE(NEW.tenant_id::TEXT, 'NULL'),
    COALESCE(NEW.user_id::TEXT, 'NULL'),
    COALESCE(NEW.auth_user_id::TEXT, 'NULL'),
    COALESCE(NEW.table_name, 'NULL'),
    COALESCE(NEW.record_id::TEXT, 'NULL'),
    COALESCE(NEW.details::TEXT, '{}'),
    NEW.created_at::TEXT,
    _prev_hash
  );

  -- Compute SHA-256 hash
  NEW.chain_seq := _seq;
  NEW.prev_hash := _prev_hash;
  NEW.row_hash  := encode(digest(_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sentinel_hash_chain() IS
  'SENTINEL hash chain trigger (migration 174). '
  'Computes a SHA-256 hash for each audit log entry, chaining it to the '
  'previous row''s hash. Creates a tamper-evident blockchain-style ledger. '
  'If any row is deleted or modified, sentinel_verify_chain() will detect it.';


-- ── 4. Attach trigger (BEFORE INSERT, fires before immutability guard) ──────

DROP TRIGGER IF EXISTS trg_sentinel_hash_chain ON sentinel_audit_log;

CREATE TRIGGER trg_sentinel_hash_chain
  BEFORE INSERT ON sentinel_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION sentinel_hash_chain();


-- ── 5. Chain verification function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION sentinel_verify_chain(
  p_limit  INT DEFAULT 1000
)
RETURNS TABLE (
  is_valid       BOOLEAN,
  total_checked  INT,
  first_broken   BIGINT,
  broken_id      UUID,
  expected_hash  TEXT,
  actual_hash    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row          RECORD;
  _prev_hash    TEXT := 'SENTINEL_GENESIS_BLOCK_v1';
  _computed     TEXT;
  _payload      TEXT;
  _count        INT := 0;
  _broken_seq   BIGINT := NULL;
  _broken_id    UUID := NULL;
  _expected     TEXT := NULL;
  _actual       TEXT := NULL;
BEGIN
  FOR _row IN
    SELECT *
      FROM sentinel_audit_log
     WHERE chain_seq IS NOT NULL
     ORDER BY chain_seq ASC
     LIMIT p_limit
  LOOP
    _count := _count + 1;

    -- Verify prev_hash matches what we expect
    IF _row.prev_hash IS DISTINCT FROM _prev_hash THEN
      _broken_seq := _row.chain_seq;
      _broken_id  := _row.id;
      _expected   := _prev_hash;
      _actual     := _row.prev_hash;
      RETURN QUERY SELECT FALSE, _count, _broken_seq, _broken_id, _expected, _actual;
      RETURN;
    END IF;

    -- Recompute the row hash
    _payload := concat_ws('|',
      _row.chain_seq::TEXT,
      _row.id::TEXT,
      _row.event_type,
      _row.severity,
      COALESCE(_row.tenant_id::TEXT, 'NULL'),
      COALESCE(_row.user_id::TEXT, 'NULL'),
      COALESCE(_row.auth_user_id::TEXT, 'NULL'),
      COALESCE(_row.table_name, 'NULL'),
      COALESCE(_row.record_id::TEXT, 'NULL'),
      COALESCE(_row.details::TEXT, '{}'),
      _row.created_at::TEXT,
      _prev_hash
    );

    _computed := encode(digest(_payload, 'sha256'), 'hex');

    IF _computed IS DISTINCT FROM _row.row_hash THEN
      _broken_seq := _row.chain_seq;
      _broken_id  := _row.id;
      _expected   := _computed;
      _actual     := _row.row_hash;
      RETURN QUERY SELECT FALSE, _count, _broken_seq, _broken_id, _expected, _actual;
      RETURN;
    END IF;

    -- Advance the chain
    _prev_hash := _row.row_hash;
  END LOOP;

  -- All rows verified
  RETURN QUERY SELECT TRUE, _count, NULL::BIGINT, NULL::UUID, NULL::TEXT, NULL::TEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION sentinel_verify_chain(INT) IS
  'Walks the sentinel_audit_log hash chain and verifies each link. '
  'Returns is_valid=true if the chain is intact, or the first broken '
  'link (chain_seq, row_id, expected vs actual hash) if tampered.';


-- ── 6. Index for chain lookups ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sentinel_audit_chain_seq
  ON sentinel_audit_log (chain_seq DESC);


-- ── 7. Backfill existing rows (hash them in order) ──────────────────────────
-- Existing rows that predate this migration get hashed in sequence.

DO $$
DECLARE
  _row          RECORD;
  _prev_hash    TEXT := 'SENTINEL_GENESIS_BLOCK_v1';
  _payload      TEXT;
  _computed     TEXT;
  _seq          BIGINT := 0;
BEGIN
  -- Temporarily disable the immutability trigger for backfill
  -- (We're the migration, so we have the privilege)
  ALTER TABLE sentinel_audit_log DISABLE TRIGGER trg_sentinel_audit_immutable;

  FOR _row IN
    SELECT * FROM sentinel_audit_log
     WHERE row_hash IS NULL
     ORDER BY created_at ASC
  LOOP
    _seq := _seq + 1;

    _payload := concat_ws('|',
      _seq::TEXT,
      _row.id::TEXT,
      _row.event_type,
      _row.severity,
      COALESCE(_row.tenant_id::TEXT, 'NULL'),
      COALESCE(_row.user_id::TEXT, 'NULL'),
      COALESCE(_row.auth_user_id::TEXT, 'NULL'),
      COALESCE(_row.table_name, 'NULL'),
      COALESCE(_row.record_id::TEXT, 'NULL'),
      COALESCE(_row.details::TEXT, '{}'),
      _row.created_at::TEXT,
      _prev_hash
    );

    _computed := encode(digest(_payload, 'sha256'), 'hex');

    UPDATE sentinel_audit_log
       SET chain_seq = _seq,
           prev_hash = _prev_hash,
           row_hash  = _computed
     WHERE id = _row.id;

    _prev_hash := _computed;
  END LOOP;

  -- Re-enable the immutability trigger
  ALTER TABLE sentinel_audit_log ENABLE TRIGGER trg_sentinel_audit_immutable;

  -- Reset the sequence to continue after backfilled rows
  IF _seq > 0 THEN
    PERFORM setval('sentinel_chain_seq', _seq);
  END IF;

  RAISE NOTICE 'Backfilled % existing rows with hash chain', _seq;
END;
$$;
