-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLAIN ANALYZE for checkSeatLimit() queries
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this against a seeded database to verify that the three count queries
-- in checkSeatLimit() and the on-read expiration update all use index scans,
-- not sequential scans.
--
-- Expected indexes (from migrations 039 + 040):
--   - users: already indexed on (tenant_id, is_active) via RLS policies
--   - user_invites: idx_user_invites_tenant_status_expires (tenant_id, status, expires_at)
--   - user_invites: idx_user_invites_tenant_email_active UNIQUE (tenant_id, email) WHERE status='pending'
--
-- Usage:
--   psql $DATABASE_URL -f scripts/explain-seat-limit-queries.sql
--
-- What to look for:
--   ✅ "Index Scan" or "Index Only Scan" in each query plan
--   ❌ "Seq Scan" means the index is missing or not being used
-- ═══════════════════════════════════════════════════════════════════════════

-- Pick a sample tenant_id for testing. Replace if needed.
-- In a real run, use: SELECT id FROM tenants LIMIT 1;

\echo '══════════════════════════════════════════════════════════════════'
\echo 'Query 1: Active user count (checkSeatLimit)'
\echo '══════════════════════════════════════════════════════════════════'

EXPLAIN ANALYZE
SELECT count(*)
FROM users
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND is_active = true;

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Query 2: Non-expired pending invite count (checkSeatLimit)'
\echo '══════════════════════════════════════════════════════════════════'

EXPLAIN ANALYZE
SELECT count(*)
FROM user_invites
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND status = 'pending'
  AND expires_at > now();

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Query 3: Tenant max_users lookup (checkSeatLimit)'
\echo '══════════════════════════════════════════════════════════════════'

EXPLAIN ANALYZE
SELECT max_users
FROM tenants
WHERE id = (SELECT id FROM tenants LIMIT 1);

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Query 4: On-read expiration UPDATE (checkSeatLimit fire-and-forget)'
\echo '══════════════════════════════════════════════════════════════════'

-- Wrap in a transaction and ROLLBACK so we don't actually mutate data
BEGIN;

EXPLAIN ANALYZE
UPDATE user_invites
SET status = 'expired'
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND status = 'pending'
  AND expires_at < now();

ROLLBACK;

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Query 5: Cron bulk expiration UPDATE (expire-invites cron)'
\echo '══════════════════════════════════════════════════════════════════'

BEGIN;

EXPLAIN ANALYZE
UPDATE user_invites
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at < now();

ROLLBACK;

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Index verification: list all indexes on user_invites'
\echo '══════════════════════════════════════════════════════════════════'

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_invites'
ORDER BY indexname;

\echo ''
\echo '══════════════════════════════════════════════════════════════════'
\echo 'Index verification: list all indexes on users'
\echo '══════════════════════════════════════════════════════════════════'

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users'
ORDER BY indexname;

\echo ''
\echo 'Done. Verify all queries show Index Scan or Index Only Scan.'
\echo 'If any show Seq Scan, add the missing index before shipping.'
