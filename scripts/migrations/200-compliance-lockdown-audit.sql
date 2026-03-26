-- =============================================================================
-- Migration 200  -  Directive 004 / Pillar 1: Compliance Lockdown Audit
-- =============================================================================
--
-- Implements examination-ready immutable audit infrastructure for trust
-- accounting. Satisfies Law Society (LSO By-Law 9) examination requirements:
--
--   1. Hash chain on trust_audit_log (mirrors sentinel pattern from mig 174)
--   2. Mandatory reason_for_change on trust_transactions
--   3. compliance_examination_snapshots table (immutable, RLS-protected)
--   4. rpc_generate_compliance_snapshot  -  one-call exam-ready report
--
-- Depends on: 100 (trust tables), 103 (trust_transaction_log),
--             161/174 (sentinel audit + hash chain), pgcrypto
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ENHANCE trust_audit_log WITH HASH CHAIN
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1.0 Ensure pgcrypto is available ──────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── 1.1 Add hash chain columns + reason_for_change ────────────────────────

ALTER TABLE trust_audit_log
  ADD COLUMN IF NOT EXISTS prev_hash          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS row_hash           TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chain_seq          BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reason_for_change  TEXT NOT NULL DEFAULT 'legacy_entry';

COMMENT ON COLUMN trust_audit_log.prev_hash IS
  'SHA-256 hash of the immediately preceding audit log row. Forms the backward link in the tamper-evident chain.';

COMMENT ON COLUMN trust_audit_log.row_hash IS
  'SHA-256 hash of this row''s content concatenated with prev_hash. Any modification breaks the chain.';

COMMENT ON COLUMN trust_audit_log.chain_seq IS
  'Monotonically increasing sequence number guaranteeing strict ordering under concurrent inserts.';

COMMENT ON COLUMN trust_audit_log.reason_for_change IS
  'Mandatory human-readable reason for the audit event. Required by LSO By-Law 9 for examination readiness.';


-- ── 1.2 Sequence for chain ordering ──────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS trust_audit_chain_seq;

-- Seed the sequence to the current row count if rows already exist
DO $$
DECLARE
  _max BIGINT;
BEGIN
  SELECT COUNT(*) INTO _max FROM trust_audit_log;
  IF _max > 0 THEN
    PERFORM setval('trust_audit_chain_seq', _max);
  END IF;
END;
$$;


-- ── 1.3 Hash chain trigger function ──────────────────────────────────────

CREATE OR REPLACE FUNCTION trust_audit_hash_chain()
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
  _seq := nextval('trust_audit_chain_seq');

  -- Fetch the hash of the most recent preceding row
  SELECT row_hash INTO _prev_hash
    FROM trust_audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  -- Genesis block: if no previous row, use a known seed
  IF _prev_hash IS NULL THEN
    _prev_hash := 'TRUST_AUDIT_GENESIS_BLOCK_v1';
  END IF;

  -- Build the payload to hash: deterministic concatenation of key fields
  _payload := concat_ws('|',
    _seq::TEXT,
    NEW.id::TEXT,
    NEW.action,
    NEW.entity_type,
    NEW.entity_id::TEXT,
    COALESCE(NEW.tenant_id::TEXT, 'NULL'),
    COALESCE(NEW.matter_id::TEXT, 'NULL'),
    NEW.user_id::TEXT,
    COALESCE(NEW.metadata::TEXT, '{}'),
    COALESCE(NEW.reason_for_change, 'NULL'),
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

COMMENT ON FUNCTION trust_audit_hash_chain() IS
  'Trust audit hash chain trigger (migration 200). '
  'Computes a SHA-256 hash for each trust audit log entry, chaining it to the '
  'previous row''s hash. Creates a tamper-evident blockchain-style ledger. '
  'If any row is deleted or modified, trust_audit_verify_chain() will detect it.';


-- ── 1.4 Attach trigger (BEFORE INSERT, fires before immutability guard) ──

DROP TRIGGER IF EXISTS trg_trust_audit_hash_chain ON trust_audit_log;

CREATE TRIGGER trg_trust_audit_hash_chain
  BEFORE INSERT ON trust_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION trust_audit_hash_chain();


-- ── 1.5 Chain verification function ──────────────────────────────────────

CREATE OR REPLACE FUNCTION trust_audit_verify_chain(
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
  _prev_hash    TEXT := 'TRUST_AUDIT_GENESIS_BLOCK_v1';
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
      FROM trust_audit_log
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
      _row.action,
      _row.entity_type,
      _row.entity_id::TEXT,
      COALESCE(_row.tenant_id::TEXT, 'NULL'),
      COALESCE(_row.matter_id::TEXT, 'NULL'),
      _row.user_id::TEXT,
      COALESCE(_row.metadata::TEXT, '{}'),
      COALESCE(_row.reason_for_change, 'NULL'),
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

COMMENT ON FUNCTION trust_audit_verify_chain(INT) IS
  'Walks the trust_audit_log hash chain and verifies each link. '
  'Returns is_valid=true if the chain is intact, or the first broken '
  'link (chain_seq, row_id, expected vs actual hash) if tampered. '
  'Used by compliance snapshots and Law Society examination preparation.';


-- ── 1.6 Index for chain lookups ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trust_audit_chain_seq
  ON trust_audit_log (chain_seq DESC);


-- ── 1.7 Backfill existing rows (hash them in order) ──────────────────────
-- Existing rows that predate this migration get hashed in sequence.

DO $$
DECLARE
  _row          RECORD;
  _prev_hash    TEXT := 'TRUST_AUDIT_GENESIS_BLOCK_v1';
  _payload      TEXT;
  _computed     TEXT;
  _seq          BIGINT := 0;
BEGIN
  -- Temporarily disable the immutability triggers for backfill
  ALTER TABLE trust_audit_log DISABLE TRIGGER trust_audit_log_no_update;
  ALTER TABLE trust_audit_log DISABLE TRIGGER trust_audit_log_no_delete;

  FOR _row IN
    SELECT * FROM trust_audit_log
     WHERE row_hash IS NULL
     ORDER BY created_at ASC
  LOOP
    _seq := _seq + 1;

    _payload := concat_ws('|',
      _seq::TEXT,
      _row.id::TEXT,
      _row.action,
      _row.entity_type,
      _row.entity_id::TEXT,
      COALESCE(_row.tenant_id::TEXT, 'NULL'),
      COALESCE(_row.matter_id::TEXT, 'NULL'),
      _row.user_id::TEXT,
      COALESCE(_row.metadata::TEXT, '{}'),
      COALESCE(_row.reason_for_change, 'NULL'),
      _row.created_at::TEXT,
      _prev_hash
    );

    _computed := encode(digest(_payload, 'sha256'), 'hex');

    UPDATE trust_audit_log
       SET chain_seq = _seq,
           prev_hash = _prev_hash,
           row_hash  = _computed
     WHERE id = _row.id;

    _prev_hash := _computed;
  END LOOP;

  -- Re-enable the immutability triggers
  ALTER TABLE trust_audit_log ENABLE TRIGGER trust_audit_log_no_update;
  ALTER TABLE trust_audit_log ENABLE TRIGGER trust_audit_log_no_delete;

  -- Reset the sequence to continue after backfilled rows
  IF _seq > 0 THEN
    PERFORM setval('trust_audit_chain_seq', _seq);
  END IF;

  RAISE NOTICE 'Migration 200: Backfilled % existing trust_audit_log rows with hash chain', _seq;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD reason_for_change TO trust_transactions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trust_transactions
  ADD COLUMN IF NOT EXISTS reason_for_change TEXT NOT NULL DEFAULT 'legacy_entry';

COMMENT ON COLUMN trust_transactions.reason_for_change IS
  'Mandatory reason for the transaction. Required by LSO By-Law 9 for examination readiness. '
  'Every trust transaction must have a documented justification.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CREATE compliance_examination_snapshots TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_examination_snapshots (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_type             TEXT NOT NULL
    CHECK (snapshot_type IN ('law_society_exam', 'internal_audit', 'annual_review')),
  generated_by              UUID NOT NULL REFERENCES users(id),
  generated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start              DATE NOT NULL,
  period_end                DATE NOT NULL,
  trust_audit_chain_valid   BOOLEAN NOT NULL,
  sentinel_chain_valid      BOOLEAN NOT NULL,
  transaction_count         BIGINT NOT NULL,
  reconciliation_count      BIGINT NOT NULL,
  unresolved_discrepancies  INT NOT NULL DEFAULT 0,
  snapshot_data             JSONB NOT NULL DEFAULT '{}',
  checksum_sha256           TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE compliance_examination_snapshots IS
  'Immutable examination-ready snapshots for Law Society compliance. '
  'Each snapshot captures the state of trust accounting chains, transaction counts, '
  'reconciliation status, and unresolved discrepancies for a given period. '
  'Snapshots are tamper-evident via SHA-256 checksum of the snapshot_data payload. '
  'UPDATE and DELETE are blocked by the compliance_snapshot_immutable_guard trigger.';


-- ── 3.1 RLS  -  tenant isolation, SELECT only for admin role ───────────────

ALTER TABLE compliance_examination_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_snapshots_tenant_admin_select
  ON compliance_examination_snapshots
  FOR SELECT
  USING (
    tenant_id = (SELECT u.tenant_id FROM users u WHERE u.auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users u2
      JOIN roles r ON r.id = u2.role_id
      WHERE u2.auth_user_id = auth.uid()
        AND r.name = 'admin'
    )
  );

COMMENT ON POLICY compliance_snapshots_tenant_admin_select
  ON compliance_examination_snapshots IS
  'Only admin-role users within the same tenant may read compliance snapshots. '
  'Inserts go through the rpc_generate_compliance_snapshot SECURITY DEFINER function.';


-- ── 3.2 Immutability guard  -  prevent UPDATE and DELETE ────────────────────

CREATE OR REPLACE FUNCTION compliance_snapshot_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Compliance examination snapshots are immutable  -  cannot modify or delete records.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION compliance_snapshot_immutable_guard() IS
  'Trigger function that prevents any UPDATE or DELETE on compliance_examination_snapshots. '
  'Enforces the immutability invariant required for Law Society examination evidence.';

CREATE TRIGGER trg_compliance_snapshot_no_update
  BEFORE UPDATE ON compliance_examination_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION compliance_snapshot_immutable_guard();

CREATE TRIGGER trg_compliance_snapshot_no_delete
  BEFORE DELETE ON compliance_examination_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION compliance_snapshot_immutable_guard();


-- ── 3.3 Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_tenant_type
  ON compliance_examination_snapshots (tenant_id, snapshot_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_period
  ON compliance_examination_snapshots (tenant_id, period_start, period_end);


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPC FUNCTION: rpc_generate_compliance_snapshot
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_generate_compliance_snapshot(
  p_tenant_id      UUID,
  p_user_id        UUID,
  p_snapshot_type  TEXT,
  p_period_start   DATE,
  p_period_end     DATE
)
RETURNS compliance_examination_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _trust_chain    RECORD;
  _sentinel_chain RECORD;
  _txn_count      BIGINT;
  _recon_count    BIGINT;
  _unresolved     INT;
  _snapshot_data  JSONB;
  _checksum       TEXT;
  _result         compliance_examination_snapshots;
BEGIN
  -- ── Validate snapshot_type ──────────────────────────────────────────────
  IF p_snapshot_type NOT IN ('law_society_exam', 'internal_audit', 'annual_review') THEN
    RAISE EXCEPTION 'Invalid snapshot_type: %. Must be one of: law_society_exam, internal_audit, annual_review', p_snapshot_type;
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end (%) cannot be before period_start (%)', p_period_end, p_period_start;
  END IF;

  -- ── Run trust audit chain verification ──────────────────────────────────
  SELECT * INTO _trust_chain FROM trust_audit_verify_chain(100000);

  -- ── Run sentinel chain verification ─────────────────────────────────────
  SELECT * INTO _sentinel_chain FROM sentinel_verify_chain(100000);

  -- ── Count transactions in period ────────────────────────────────────────
  SELECT COUNT(*) INTO _txn_count
    FROM trust_transactions
   WHERE tenant_id = p_tenant_id
     AND effective_date >= p_period_start
     AND effective_date <= p_period_end;

  -- ── Count reconciliations in period ─────────────────────────────────────
  SELECT COUNT(*) INTO _recon_count
    FROM trust_reconciliations
   WHERE tenant_id = p_tenant_id
     AND period_start >= p_period_start
     AND period_end <= p_period_end;

  -- ── Count unresolved reconciliation items ───────────────────────────────
  SELECT COUNT(*)::INT INTO _unresolved
    FROM trust_reconciliation_items ri
    JOIN trust_reconciliations r ON r.id = ri.reconciliation_id
   WHERE ri.tenant_id = p_tenant_id
     AND ri.resolved = false
     AND r.period_start >= p_period_start
     AND r.period_end <= p_period_end;

  -- ── Assemble snapshot_data ──────────────────────────────────────────────
  _snapshot_data := jsonb_build_object(
    'generated_at',               now()::TEXT,
    'period',                     jsonb_build_object(
                                    'start', p_period_start::TEXT,
                                    'end',   p_period_end::TEXT
                                  ),
    'trust_audit_chain',          jsonb_build_object(
                                    'is_valid',      COALESCE(_trust_chain.is_valid, false),
                                    'total_checked', COALESCE(_trust_chain.total_checked, 0),
                                    'first_broken',  _trust_chain.first_broken,
                                    'broken_id',     _trust_chain.broken_id::TEXT
                                  ),
    'sentinel_chain',             jsonb_build_object(
                                    'is_valid',      COALESCE(_sentinel_chain.is_valid, false),
                                    'total_checked', COALESCE(_sentinel_chain.total_checked, 0),
                                    'first_broken',  _sentinel_chain.first_broken,
                                    'broken_id',     _sentinel_chain.broken_id::TEXT
                                  ),
    'transaction_summary',        jsonb_build_object(
                                    'total_count',   _txn_count
                                  ),
    'reconciliation_summary',     jsonb_build_object(
                                    'total_count',         _recon_count,
                                    'unresolved_items',    _unresolved
                                  ),
    'snapshot_type',              p_snapshot_type,
    'tenant_id',                  p_tenant_id::TEXT,
    'generated_by',               p_user_id::TEXT
  );

  -- ── Compute SHA-256 checksum of the snapshot_data ───────────────────────
  _checksum := encode(digest(_snapshot_data::TEXT, 'sha256'), 'hex');

  -- ── Insert the snapshot ─────────────────────────────────────────────────
  INSERT INTO compliance_examination_snapshots (
    tenant_id,
    snapshot_type,
    generated_by,
    generated_at,
    period_start,
    period_end,
    trust_audit_chain_valid,
    sentinel_chain_valid,
    transaction_count,
    reconciliation_count,
    unresolved_discrepancies,
    snapshot_data,
    checksum_sha256
  ) VALUES (
    p_tenant_id,
    p_snapshot_type,
    p_user_id,
    now(),
    p_period_start,
    p_period_end,
    COALESCE(_trust_chain.is_valid, false),
    COALESCE(_sentinel_chain.is_valid, false),
    _txn_count,
    _recon_count,
    _unresolved,
    _snapshot_data,
    _checksum
  )
  RETURNING * INTO _result;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION rpc_generate_compliance_snapshot(UUID, UUID, TEXT, DATE, DATE) IS
  'Generates a Law Society examination-ready compliance snapshot. '
  'Verifies both the trust_audit_log and sentinel_audit_log hash chains, '
  'counts transactions and reconciliations in the specified period, '
  'identifies unresolved discrepancies, and produces a signed (SHA-256) '
  'JSON snapshot. The result is immutably stored in compliance_examination_snapshots. '
  'Called via Supabase RPC: supabase.rpc(''rpc_generate_compliance_snapshot'', {...})';


COMMIT;
