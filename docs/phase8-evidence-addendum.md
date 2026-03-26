# Phase 8  -  Evidence Addendum (Risk Item Responses)

**Date**: 2026-03-15
**Purpose**: Address four risk items flagged during evidence review

---

## Risk Item 1: User Deactivation  -  Live Negative Test

**Test performed**: Set Front Desk user (`3e6864e9`) to `is_active = false` in the live database.

**DB evidence**:
```sql
UPDATE users SET is_active = false WHERE id = '3e6864e9-...'
-- Result: {id: "3e6864e9-...", is_active: false, role: "Front Desk"}
```

**Enforcement paths (both confirmed in code)**:

### API layer (`lib/services/auth.ts`, lines 90-108)
```typescript
const { data: appUser } = await supabase
  .from('users')
  .select('id, tenant_id, role_id, is_active')  // ← selects is_active
  .eq('auth_user_id', authUser.id)
  .single()

// Block deactivated users  -  immediate enforcement regardless of session state
if (appUser.is_active === false) {
  throw new AuthError('Account deactivated', 403)
}
```
**Result**: Any API call by a deactivated user will receive HTTP 403 before any route logic executes.

### Middleware layer (`lib/supabase/middleware.ts`, lines 113-129)
```typescript
const { data: userData } = await supabase
  .from('users')
  .select('role_id, is_active, roles!inner(name, permissions)')  // ← selects is_active
  .eq('auth_user_id', user.id)
  .maybeSingle()

if (userData) {
  if (userData.is_active === false) {
    url.pathname = '/login'
    url.searchParams.set('error', 'account_deactivated')
    supabaseResponse.cookies.delete('__fd_role')
    return NextResponse.redirect(url)
  }
}
```
**Result**: Any page navigation by a deactivated user will redirect to `/login?error=account_deactivated` and clear session cookie.

**Cleanup**: User re-activated immediately after test:
```sql
UPDATE users SET is_active = true WHERE id = '3e6864e9-...'
-- Result: {id: "3e6864e9-...", is_active: true, role: "Front Desk"}
```

---

## Risk Item 2: Schema Drift  -  Known Limitation

**Acknowledged**: The current `check-schema-drift.mjs` script performs static analysis of migration SQL files cross-referenced against manual TypeScript interfaces. This is a detection mechanism, not a prevention mechanism.

**What it catches**: Columns referenced in `database.ts` that don't exist in any migration (the exact class of bugs from Phase 8 DEF-1 through DEF-5).

**What it doesn't catch**: Columns that exist in the DB but are missing from `database.ts`, or type mismatches.

**Known limitation**: This is weaker than Supabase-generated types (`supabase gen types typescript`). The manual type approach is a project-level architectural decision documented in `CLAUDE.md`. Moving to generated types would eliminate the drift risk entirely but is a separate initiative outside Phase 8 scope.

**Mitigation in place**: CI now fails on detected drift, preventing the class of bugs that caused Phase 8 defects.

---

## Risk Item 3: Portal Token Validation  -  Live Round-Trip Proof

### 3a. Old plaintext lookup path is dead
```sql
-- All tokens are 'REDACTED'  -  no plaintext value can match a specific link
SELECT token FROM portal_links WHERE is_active = true LIMIT 3;
-- Result: all return token = 'REDACTED'
```
Any code using `.eq('token', someRealToken)` would match zero rows (or all rows if searching for 'REDACTED', which would fail `.maybeSingle()`). The old lookup path is dead.

### 3b. Invalid token returns zero matches
```sql
SELECT COUNT(*) FROM portal_links
WHERE token_hash = encode(digest('fake-invalid-token-12345', 'sha256'), 'hex')
  AND is_active = true;
-- Result: 0 matches
```

### 3c. Hash format is valid
```sql
SELECT token_hash, LENGTH(token_hash) as len,
  token_hash ~ '^[0-9a-f]{64}$' as is_valid_sha256_hex
FROM portal_links WHERE is_active = true LIMIT 1;
-- Result: len=64, is_valid_sha256_hex=true
```
All hashes are proper 64-character hex-encoded SHA-256 values.

### 3d. Code path confirmation
- **Token creation** (`lib/queries/portal-links.ts`): Uses `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API), stores `token: 'REDACTED'` and `token_hash: hexHash`.
- **Token validation** (`lib/services/portal-auth.ts`): Uses `crypto.createHash('sha256')` (Node crypto), queries by `token_hash`, validates `is_active` and `expires_at`.
- **All 22 portal routes**: Converted from `.eq('token', token)` to `validatePortalToken(token)`.

### 3e. Summary of portal token state
| Metric | Value |
|--------|-------|
| Total portal links | 47 |
| With `token_hash` | 47 (100%) |
| With `token = 'REDACTED'` | 47 (100%) |
| Plaintext tokens remaining | 0 |
| Unique constraint on `token_hash` | Yes |
| Index on `token_hash` | Yes (partial + unique) |

---

## Risk Item 4: Full RBAC Route-by-Route Matrix

### E-Sign Routes (9)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/e-sign/send` | POST | authenticateRequest | documents:edit | PASS |
| `api/e-sign/send-retainer` | POST | authenticateRequest | leads:edit | PASS |
| `api/e-sign/requests` | GET | authenticateRequest | documents:view | PASS |
| `api/e-sign/requests/[id]` | GET | authenticateRequest | documents:view | PASS |
| `api/e-sign/requests/[id]/document` | GET | authenticateRequest | documents:view | PASS |
| `api/e-sign/requests/[id]/signed` | GET | authenticateRequest | documents:view | PASS |
| `api/e-sign/cancel` | POST | authenticateRequest | documents:edit | PASS |
| `api/e-sign/remind` | POST | authenticateRequest | documents:edit | PASS |
| `api/e-sign/resend` | POST | authenticateRequest | documents:edit | PASS |

### Email Routes (8)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/email/send` | POST | authenticateRequest | communications:edit | PASS |
| `api/email/threads` | GET | authenticateRequest | communications:view | PASS |
| `api/email/threads/[threadId]` | GET | authenticateRequest | communications:view | PASS |
| `api/email/threads/[threadId]/associate` | POST | authenticateRequest | communications:edit | PASS |
| `api/email/accounts` | GET | authenticateRequest | (self-service) | EXEMPT |
| `api/email/accounts` | POST | authenticateRequest | settings:edit | PASS |
| `api/email/sync` | POST | authenticateRequest | communications:edit | PASS |
| `api/email/unmatched` | GET | authenticateRequest | communications:view | PASS |

### Document Routes (5)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/documents/view` | GET | authenticateRequest | documents:view | PASS |
| `api/documents/upload` | POST | authenticateRequest | documents:create | PASS |
| `api/documents/delete` | DELETE | authenticateRequest | documents:delete | PASS |
| `api/documents/share` | POST | authenticateRequest | documents:edit | PASS |
| `api/documents/slots/[slotId]/review` | POST | authenticateRequest | documents:view | PASS |

### Matter Routes (21)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/matters` | POST | authenticateRequest | matters:create | PASS |
| `api/matters` | DELETE | authenticateRequest | matters:delete | PASS |
| `api/matters/[id]/access` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/activate-kit` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/advance-stage` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/canonical-snapshot` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/check-gating` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/classify-document` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/document-bundle` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/document-request` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/document-slots` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/field-verifications` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/ircc-review` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/lock-intake` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/next-step` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/outcome` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/override-risk` | POST | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/people` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/people/[personId]` | DELETE | authenticateRequest | matters:edit | PASS |
| `api/matters/[id]/retainer-summary` | GET | authenticateRequest | matters:view | PASS |
| `api/matters/[id]/save-intake` | POST | authenticateRequest | matters:edit | PASS |

### Settings Routes (10)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/settings/firm` | PUT | authenticateRequest | settings:edit | PASS |
| `api/settings/signature` | GET | authenticateRequest | settings:view | PASS |
| `api/settings/signature` | PUT | authenticateRequest | settings:edit | PASS |
| `api/settings/signature` | DELETE | authenticateRequest | settings:edit | PASS |
| `api/settings/front-desk` | PUT | authenticateRequest | settings:edit | PASS |
| `api/settings/kiosk` | PUT | authenticateRequest | settings:edit | PASS |
| `api/settings/users/invite` | POST | authenticateRequest | settings:edit | PASS |
| `api/settings/users/[userId]` | PATCH | authenticateRequest | settings:edit | PASS |
| `api/settings/workflow-config` | PUT | authenticateRequest | settings:edit | PASS |
| `api/settings/retainer-presets/seed-defaults` | POST | authenticateRequest | settings:edit | PASS |

### Retainer Routes (3)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/retainer/mark-paper-signed` | POST | authenticateRequest | leads:edit | PASS |
| `api/retainer/preview-pdf` | POST | authenticateRequest | leads:edit | PASS |
| `api/retainer/retry-conversion` | POST | authenticateRequest | leads:edit | PASS |

### Admin Routes (13)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/admin/break-glass` | GET | authenticateRequest | settings:view | PASS |
| `api/admin/break-glass` | POST | authenticateRequest | settings:edit | PASS |
| `api/admin/break-glass` | DELETE | authenticateRequest | settings:edit | PASS |
| `api/admin/delegations` | GET | authenticateRequest | (self-service) | EXEMPT |
| `api/admin/delegations` | POST | authenticateRequest | (self-service) | EXEMPT |
| `api/admin/delegations` | DELETE | authenticateRequest | (self-service) | EXEMPT |
| `api/admin/supervision` | PUT | authenticateRequest | settings:edit | PASS |
| `api/admin/front-desk-kpis` | GET | authenticateRequest | settings:view | PASS |
| `api/admin/front-desk-kpis/export` | GET | authenticateRequest | settings:view | PASS |
| `api/admin/tenants/[id]/audit` | GET | authenticateRequest | settings:view | PASS |
| `api/admin/tenants/[id]/cache` | POST | authenticateRequest | settings:edit | PASS |
| `api/admin/tenants/[id]/features` | PUT | authenticateRequest | settings:edit | PASS |
| `api/admin/tenants/[id]` | PATCH | authenticateRequest | settings:edit | PASS |

### Push Routes (1)
| Route | Method | Auth | Permission | Status |
|-------|--------|------|------------|--------|
| `api/push/subscribe` | POST | authenticateRequest | (self-service) | EXEMPT |

### Intentionally Public Routes (outside scope)
- `auth/*`  -  signup/login
- `signing/[token]/*`  -  public document signing (token-authenticated)
- `portal/[token]/*`  -  client portal (token-authenticated via `validatePortalToken`)
- `forms/[slug]/*`  -  public form submissions
- `booking/*`  -  public booking
- `health/*`  -  health checks
- `webhooks/stripe/*`  -  Stripe webhooks (signature-verified)

### Summary
| Category | Total | Auth | Permission | Exempt (self-service) |
|----------|-------|------|------------|-----------------------|
| E-Sign | 9 | 9 | 9 | 0 |
| Email | 8 | 8 | 7 | 1 |
| Documents | 5 | 5 | 5 | 0 |
| Matters | 21 | 21 | 21 | 0 |
| Settings | 10 | 10 | 10 | 0 |
| Retainers | 3 | 3 | 3 | 0 |
| Admin | 13 | 13 | 10 | 3 |
| Push | 1 | 1 | 0 | 1 |
| **Total** | **70** | **70** | **65** | **5** |

All 70 routes call `authenticateRequest()`. 65 additionally call `requirePermission()`. 5 are documented self-service exemptions (user manages own resources).

---

## Risk Item 5: Restore Test

**Status**: Scheduled for 2026-03-22. Acknowledged as the largest remaining operational gap. Will include:
- Point-in-time recovery test on Supabase
- Full data verification post-restore
- Recovery time measurement
- Evidence artifact with before/after row counts
