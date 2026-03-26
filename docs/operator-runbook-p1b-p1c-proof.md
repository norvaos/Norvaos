# Operator Runbook  -  Priority 1b + 1c Runtime Proof Execution

**Date:** 2026-03-16
**Requires:** Environment access (see Prerequisites)
**Purpose:** Produce the actual runtime evidence required to close Priority 1b (GHL/Clio token refresh hardening) and Priority 1c (Microsoft Graph bounded retry). Sign-off is withheld until all outputs in this runbook are attached.

---

## Prerequisites

The operator running this must have:

| Credential | Used for |
|-----------|---------|
| `SUPABASE_URL` | DB queries and updates |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role client (bypasses RLS) |
| A `platform_connections` row for GHL (`platform = 'ghl'`, `is_active = true`) | P1b GHL proofs |
| A `platform_connections` row for Clio (`platform = 'clio'`, `is_active = true`) | P1b Clio proofs |
| A `microsoft_connections` row (`is_active = true`) | P1c Microsoft Graph proofs |
| Working OAuth refresh tokens for all three providers | Proof 1 (refresh success) |
| Ability to set DB column values directly (Supabase dashboard SQL editor or psql) | Proofs 2, 3 |

---

## How to produce each output

For each proof, capture the **full console/log output** and the **DB row state** (before and after). Attach these verbatim. Do not summarise.

---

## Part A  -  GHL Proofs

### A1. Expired token → refresh succeeds

**Setup:**
```sql
-- In Supabase SQL editor: force token expiry for the GHL connection
UPDATE platform_connections
SET token_expires_at = NOW() - INTERVAL '10 minutes'
WHERE platform = 'ghl'
  AND is_active = true
  AND id = '<your-ghl-connection-id>';
```

**Execute:** Trigger any GHL import or API call that goes through `ghlFetch`. For example, navigate to the GHL import page and run a contacts fetch, or call:
```bash
# Via API route (requires auth cookie):
curl -s -b cookies.txt https://localhost:3000/api/integrations/ghl/status
```

**Capture:**
- Server log output showing the proactive refresh path executed
- DB row after: `token_expires_at` should be updated to a future time

**Expected log line (structured):** none emitted on success path  -  absence of error log is the signal. The `token_expires_at` update in the DB is the proof.

---

### A2. Refresh failure → `status = 'disconnected'`, `is_active = false`

**Setup:**
```sql
-- Force expiry AND corrupt the refresh token so refresh fails
UPDATE platform_connections
SET token_expires_at = NOW() - INTERVAL '10 minutes',
    refresh_token_encrypted = 'INVALID_TOKEN_FOR_PROOF'
WHERE platform = 'ghl'
  AND is_active = true
  AND id = '<your-ghl-connection-id>';
```

**Execute:** Trigger any GHL import or `ghlFetch` call.

**Capture:**
- Server log line: `ghl.oauth.refresh_failed` with `connection_id` and `error_message`
- DB row after: `status = 'disconnected'`, `is_active = false`

**Expected log line:**
```
{"level":"error","message":"ghl.oauth.refresh_failed","connection_id":"<uuid>","error_message":"GHL token refresh failed: ..."}
```

**Restore after proof:**
```sql
-- Restore the connection for subsequent proofs (replace with real encrypted token)
UPDATE platform_connections
SET refresh_token_encrypted = '<real-encrypted-refresh-token>',
    status = 'connected',
    is_active = true,
    token_expires_at = NOW() + INTERVAL '1 day'
WHERE id = '<your-ghl-connection-id>';
```

---

### A3. Repeated 429 terminates after 5 retries

**Setup:** This requires intercepting the GHL API response. Options:

Option A  -  Use a local mock server:
```bash
# In a separate terminal: simple server that always returns 429
node -e "
const http = require('http')
http.createServer((req, res) => {
  res.writeHead(429, { 'Retry-After': '0', 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'rate limited' }))
}).listen(9001, () => console.log('Mock 429 server on :9001'))
"
```
Then temporarily point `GHL_BASE_URL` to `http://localhost:9001` and trigger a fetch.

Option B  -  If the GHL sandbox account is rate-limited, trigger rapid sequential imports.

**Capture:**
- 5 log lines: `ghl.client.rate_limited` with `retry_count: 1` through `retry_count: 5`
- Final thrown error: `GHL API rate limit exhausted after 5 retries`
- Total elapsed time consistent with 5 × Retry-After delay

**Expected log sequence:**
```
{"level":"warn","message":"ghl.client.rate_limited","connection_id":"...","retry_count":1,"retry_after_sec":0}
{"level":"warn","message":"ghl.client.rate_limited","connection_id":"...","retry_count":2,"retry_after_sec":0}
{"level":"warn","message":"ghl.client.rate_limited","connection_id":"...","retry_count":3,"retry_after_sec":0}
{"level":"warn","message":"ghl.client.rate_limited","connection_id":"...","retry_count":4,"retry_after_sec":0}
{"level":"warn","message":"ghl.client.rate_limited","connection_id":"...","retry_count":5,"retry_after_sec":0}
GhlApiError: GHL API rate limit exhausted after 5 retries (status: 429)
```

---

### A4. Retry-After is honoured

Same setup as A3, but set `Retry-After: 2` on the mock server.

**Capture:** Timestamps from the 5 log lines above showing ~2-second gaps between retries.

---

### A5. Normal request path succeeds

**Setup:** Valid token, no rate limiting.

**Execute:** Trigger any GHL contacts or opportunities fetch.

**Capture:**
- Successful response (contacts list or opportunity count)
- No `ghl.client.rate_limited` or `ghl.oauth.refresh_failed` log lines emitted

---

## Part B  -  Clio Proofs

Identical to Part A with the following substitutions:

| GHL | Clio |
|-----|------|
| `platform = 'ghl'` | `platform = 'clio'` |
| `ghl.oauth.refresh_failed` | `clio.oauth.refresh_failed` |
| `ghl.client.rate_limited` | `clio.client.rate_limited` |
| `GhlApiError` | `ClioApiError` |
| `GHL_BASE_URL` → `http://localhost:9001` | `CLIO_BASE_URL` → `http://localhost:9001` |

### B6. clioPaginateAll partial-results path (additional Clio proof)

**Setup:** Mock server that returns 429 on every request after the first page.

**Execute:** Trigger a large Clio import that uses `clioPaginateAll` (e.g., matters or contacts full import).

**Capture:**
- Log line: `clio.client.pagination_rate_limit_exhausted` with `pages_fetched` and `items_fetched`
- Import completes with partial data (does not hang or crash)

**Expected log line:**
```
{"level":"warn","message":"clio.client.pagination_rate_limit_exhausted","connection_id":"...","pages_fetched":1,"items_fetched":200}
```

---

## Part C  -  Microsoft Graph Proofs

### C1. Repeated 429 terminates after 5 retries

**Setup:** Mock server returning 429:
```bash
node -e "
const http = require('http')
http.createServer((req, res) => {
  res.writeHead(429, { 'Retry-After': '0', 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { message: 'rate limited', code: 'TooManyRequests' } }))
}).listen(9002, () => console.log('Mock Graph 429 server on :9002'))
"
```
Point `MICROSOFT_GRAPH_URL` to `http://localhost:9002` temporarily.

**Execute:** Trigger any email sync or OneDrive operation that calls `graphFetch`.

**Capture:**
- 5 retry sleep cycles visible in timing (5 × `Retry-After` delay)
- Final thrown error: `Graph API rate limit exhausted after 5 retries`
- No stack overflow  -  process remains alive

**Expected error:**
```
GraphError: Graph API rate limit exhausted after 5 retries (status: 429)
```

---

### C2. Retry-After is honoured

Same as C1 with `Retry-After: 2`. Capture timestamps showing ~2-second intervals.

---

### C3. No recursion in live behaviour

**Capture:** Node.js process memory and call stack depth during C1 execution. Confirm the process does not crash and memory does not grow unboundedly across retries.

Acceptable evidence: process still alive after C1 completes; no `RangeError: Maximum call stack size exceeded` in logs.

---

### C4. Normal request path succeeds

**Execute:** Trigger a Graph API call (email list fetch, OneDrive browse, or sync) with a valid token.

**Capture:** Successful response. No retry log lines emitted.

---

## Part D  -  Tenant-scope confirmation (GHL and Clio)

After running A2 and B2, confirm the disconnect write did not affect unrelated rows.

```sql
-- Run immediately after each disconnect proof
-- Confirm only the target row was modified
SELECT id, platform, status, is_active, updated_at
FROM platform_connections
WHERE tenant_id = '<tenant-under-test>'
ORDER BY updated_at DESC;
```

**Capture:** Full result set. Confirm:
- Only the target `connection_id` row has `status = 'disconnected'`, `is_active = false`
- All other `platform_connections` rows for the same tenant are unchanged

---

## Part E  -  UI impact note

After running all proofs, check:
1. Navigate to the integrations settings page for the test tenant
2. Confirm whether `status = 'disconnected'` is surfaced in the UI automatically

**Capture:** Screenshot of the integrations settings page after the disconnect proof.

If the UI does not reflect the disconnected state, record: `UI does not reflect status='disconnected' automatically  -  separate UI concern, not part of this proof set.`

---

## Submission checklist

Attach all of the following to close Priority 1b and 1c:

- [ ] A1: DB before/after showing `token_expires_at` updated
- [ ] A2: Log line `ghl.oauth.refresh_failed` + DB row showing `status='disconnected'`, `is_active=false`
- [ ] A3: 5 `ghl.client.rate_limited` log lines + final `GhlApiError` thrown
- [ ] A4: Timestamps showing Retry-After delay honoured
- [ ] A5: Successful GHL response with no retry logs
- [ ] B1–B5: Clio equivalents of A1–A5
- [ ] B6: `clio.client.pagination_rate_limit_exhausted` log line with partial result count
- [ ] C1: 5 Graph retry cycles + `GraphError` thrown, process alive
- [ ] C2: Graph Retry-After timing evidence
- [ ] C3: No `RangeError` in logs
- [ ] C4: Successful Graph response
- [ ] D: `platform_connections` result set confirming only target row disconnected
- [ ] E: UI screenshot or explicit note that UI does not surface status automatically

When all items are checked, send outputs to the approving party. Sign-off will be granted on receipt.
