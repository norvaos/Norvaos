# NorvaOS — Production Runbook

**Version:** 1.0
**Date:** 2026-03-15
**Author:** Engineering
**Approved by:** Pending operational readiness review
**Project:** NorvaOS (Waseer Law Office)
**Supabase Project ID:** `ztsjvsutlrfisnrwdwfl`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Environment Configuration](#3-environment-configuration)
4. [Deployment Procedures](#4-deployment-procedures)
5. [Database Operations](#5-database-operations)
6. [Rollback Procedures](#6-rollback-procedures)
7. [Cron Jobs and Scheduled Tasks](#7-cron-jobs-and-scheduled-tasks)
8. [Health Checks and Monitoring](#8-health-checks-and-monitoring)
9. [Incident Response](#9-incident-response)
10. [Backup and Recovery](#10-backup-and-recovery)
11. [Security Controls Reference](#11-security-controls-reference)
12. [Scaling and Performance](#12-scaling-and-performance)
13. [External Service Dependencies](#13-external-service-dependencies)
14. [Contact Escalation Matrix](#14-contact-escalation-matrix)
15. [Operational Checklists](#15-operational-checklists)
16. [Known Limitations](#16-known-limitations)

---

## 1. System Overview

### What NorvaOS Is

NorvaOS is a single-tenant, multi-practice area law firm operating system for Canadian immigration and family law. It manages the full lifecycle of legal matters from lead intake through billing and trust accounting.

### Technology Stack

| Component | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15/16 |
| UI Runtime | React | 19 |
| Database | Supabase (PostgreSQL) | Latest |
| Server State | TanStack Query | v5 |
| Client State | Zustand | Latest |
| Styling | Tailwind CSS v4 + shadcn/ui | v4 |
| Auth | Supabase Auth (JWT) | Built-in |
| Email | Resend | API v1 |
| Payments | Stripe | 2026-02-25.clover |
| Cache | Upstash Redis (optional) | REST API |
| PDF Processing | Python FastAPI sidecar (pikepdf) | 3.x |
| Deployment | Vercel | Managed |

### System Boundaries

```
Clients (Browser)
    │
    ├── Next.js App (Vercel) ──── Supabase (PostgreSQL + Auth + Storage)
    │       │
    │       ├── Resend (transactional email)
    │       ├── Stripe (billing + webhooks)
    │       ├── Upstash Redis (auth cache, optional)
    │       ├── Python Sidecar (XFA PDF processing)
    │       └── Microsoft Graph (calendar/email sync, optional)
    │
    └── Portal / Signing / Kiosk / Booking (public token-based access)
```

### Route Inventory

| Category | Count | Auth Type |
|---|---|---|
| Authenticated (user session) | ~175 | `authenticateRequest()` + RBAC |
| Cron / Job | 9 | Bearer token (`CRON_SECRET`) |
| Webhook | 1 | Stripe signature validation |
| Public / Token-based (portal, signing, kiosk, booking) | ~47 | `validatePortalToken()` / slug lookup |
| Health check | 1 | Public |
| **Total** | **~235** | Mixed |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL EDGE                              │
│  ┌──────────────┐                                               │
│  │  middleware.ts │ ← JWT decode (local, no network call)       │
│  │               │ ← Front-desk isolation routing               │
│  │               │ ← User deactivation check                    │
│  │               │ ← Security headers (CSP, HSTS, X-Frame)      │
│  └──────┬───────┘                                               │
│         │                                                        │
│  ┌──────▼───────┐    ┌──────────────────┐                       │
│  │  App Router   │    │  API Routes      │                       │
│  │  (SSR pages)  │    │  /api/**         │                       │
│  │               │    │                  │                        │
│  │  React 19     │    │  authenticateReq │ ← Session + RBAC      │
│  │  TanStack Q   │    │  requirePerm()   │ ← Entity:action check │
│  │  Zustand      │    │  RLS passthrough │ ← Tenant isolation    │
│  └──────┬───────┘    └──────┬───────────┘                       │
│         │                    │                                    │
└─────────┼────────────────────┼────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────────────────────────────┐
│           SUPABASE                        │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │  PostgreSQL   │  │  Auth (GoTrue)   │  │
│  │  + RLS        │  │  JWT issuer      │  │
│  │  + Triggers   │  └──────────────────┘  │
│  │  + Functions  │  ┌──────────────────┐   │
│  │               │  │  Storage         │   │
│  │  104 migs     │  │  (documents)     │   │
│  └─────────────┘  └──────────────────┘   │
└──────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────┐
│        EXTERNAL SERVICES                  │
│  Resend │ Stripe │ Redis │ Python Sidecar │
│  Microsoft Graph │ GoHighLevel │ Clio     │
└──────────────────────────────────────────┘
```

### Request Authentication Flow

```
Request arrives
    │
    ├── Middleware (navigation requests)
    │     ├── Decode JWT locally (no DB call)
    │     ├── Check __fd_role cookie (5min TTL)
    │     ├── If deactivated → redirect /login?error=account_deactivated
    │     ├── If front-desk role → redirect /front-desk
    │     └── If unauthenticated → redirect /login?redirect={path}
    │
    └── API Route (data requests)
          ├── authenticateRequest()
          │     ├── Check Redis cache (120s TTL) for userId/tenantId/roleId
          │     ├── If miss → query users table (select id, tenant_id, role_id, is_active)
          │     ├── If is_active === false → throw AuthError(403)
          │     ├── Pre-fetch role + permissions
          │     └── Request-scoped memoization (AsyncLocalStorage)
          │
          ├── requirePermission(auth, entity, action)
          │     ├── Admin role → bypass (all permissions)
          │     └── Non-admin → check role.permissions includes entity:action
          │
          └── Supabase client with user JWT → RLS enforced at DB level
                └── tenant_id = get_current_tenant_id()
```

---

## 3. Environment Configuration

### 3.1 Required Environment Variables — Production

#### Public (safe to commit, embedded in client bundle)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://ztsjvsutlrfisnrwdwfl.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJ...` |
| `NEXT_PUBLIC_APP_URL` | Application base URL | `https://app.norvaos.com` |
| `NEXT_PUBLIC_APP_NAME` | Display name | `NorvaOS` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push VAPID public key | Base64 string |

#### Secrets (Vercel environment variables only — never commit)

| Variable | Description | Required | Source |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes | Supabase Dashboard → Settings → API |
| `CRON_SECRET` | Bearer token for cron endpoints | Yes | Generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | Resend email API key | Yes | resend.com/api-keys |
| `RESEND_FROM_DOMAIN` | Verified email sending domain | Yes | `notifications.norvaos.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key | Yes | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Yes | Stripe Dashboard → Webhooks |
| `STRIPE_PRICE_STARTER_MONTHLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `STRIPE_PRICE_STARTER_YEARLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `STRIPE_PRICE_PROFESSIONAL_YEARLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `STRIPE_PRICE_ENTERPRISE_YEARLY` | Stripe price ID | Yes | Stripe Dashboard → Products |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key | Yes | Generated with web-push library |
| `VAPID_SUBJECT` | Web push contact email | Yes | `mailto:support@norvaos.com` |
| `UPSTASH_REDIS_REST_URL` | Redis cache endpoint | Recommended | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token | Recommended | Upstash console |
| `PYTHON_WORKER_URL` | FastAPI sidecar URL | If using XFA PDFs | e.g. `https://worker.norvaos.com` |
| `PYTHON_WORKER_SECRET` | Sidecar auth secret | If using XFA PDFs | Generate: `openssl rand -hex 32` |
| `MICROSOFT_CLIENT_ID` | Azure AD app registration | If using M365 sync | Azure Portal |
| `MICROSOFT_CLIENT_SECRET` | Azure AD client secret | If using M365 sync | Azure Portal |
| `MICROSOFT_TENANT_ID` | Azure tenant ID | If using M365 sync | `common` for multi-tenant |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | 32-byte hex AES-256-GCM key | If using M365 sync | `openssl rand -hex 32` |
| `PLATFORM_TOKEN_ENCRYPTION_KEY` | 32-byte hex AES-256-GCM key | If using GHL/Clio | `openssl rand -hex 32` |
| `GHL_CLIENT_ID` | GoHighLevel OAuth client | If using GHL | GHL Developer Portal |
| `GHL_CLIENT_SECRET` | GoHighLevel OAuth secret | If using GHL | GHL Developer Portal |
| `CLIO_CLIENT_ID` | Clio OAuth client | If using Clio | Clio Developer Portal |
| `CLIO_CLIENT_SECRET` | Clio OAuth secret | If using Clio | Clio Developer Portal |

### 3.2 GitHub Secrets for CI/CD

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | Vercel deployment API token |
| `VERCEL_ORG_ID` | Vercel organisation ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `STAGING_DB_URL` | Staging Postgres direct connection (for schema drift check) |
| `STAGING_SUPABASE_URL` | Staging Supabase URL (for API validation) |
| `STAGING_SUPABASE_ANON_KEY` | Staging anon key |
| `STAGING_CRON_SECRET` | Staging cron bearer token |
| `STAGING_ADMIN_EMAIL` | Test user: Tenant A admin |
| `STAGING_ADMIN_PASSWORD` | Test user password |
| `STAGING_LAWYER_EMAIL` | Test user: Tenant A lawyer |
| `STAGING_LAWYER_PASSWORD` | Test user password |
| `STAGING_PARALEGAL_EMAIL` | Test user: Tenant A paralegal |
| `STAGING_PARALEGAL_PASSWORD` | Test user password |
| `STAGING_CLERK_EMAIL` | Test user: Tenant A clerk |
| `STAGING_CLERK_PASSWORD` | Test user password |
| `STAGING_TENANT_B_ADMIN_EMAIL` | Test user: Tenant B admin |
| `STAGING_TENANT_B_ADMIN_PASSWORD` | Test user password |

### 3.3 Environment File Templates

| File | Committed | Purpose |
|---|---|---|
| `.env.example` | Yes | Full template with all variable names |
| `.env.local` | No (gitignored) | Local development overrides |
| `.env.production` | Yes | Production template (values in Vercel) |
| `.env.staging` | Yes | Staging template |

---

## 4. Deployment Procedures

### 4.1 Standard Deployment (CI/CD Pipeline)

**Trigger:** Push to `main` branch or merge a PR into `main`.

**Pipeline Stages:**

```
1. build          → lint + type-check + next build + security audit
2. schema-drift   → compare migration SQL against database.ts interfaces
3. deploy-staging → Vercel staging deployment
4. migrate-staging → apply pending migrations to staging DB
5. validate-staging → automated API integration tests
6. ──── MANUAL APPROVAL GATE ────
7. deploy-production → Vercel production deployment
8. (on tag v*) → create GitHub release
```

**Steps:**

```bash
# 1. Ensure all changes are on main
git checkout main
git pull origin main

# 2. Push triggers CI/CD
git push origin main

# 3. Monitor pipeline
# GitHub → Actions → CI/CD workflow run

# 4. After staging validation passes, approve production deployment
# GitHub → Actions → workflow run → "Review deployments" → Approve

# 5. Verify production
curl -s https://app.norvaos.com/api/health | jq .
# Expected: { "status": "ok", "timestamp": "..." }
```

### 4.2 Emergency Hotfix Deployment

For critical production issues requiring immediate deployment:

```bash
# 1. Create hotfix branch from main
git checkout main && git pull
git checkout -b hotfix/description

# 2. Make fix, commit
git add <files>
git commit -m "fix: description of critical fix"

# 3. Push and create PR
git push -u origin hotfix/description
gh pr create --title "HOTFIX: description" --base main

# 4. After PR review + merge, pipeline runs automatically
# Approve production deployment immediately after staging passes

# 5. Verify fix in production
curl -s https://app.norvaos.com/api/health | jq .
```

### 4.3 Vercel-Specific Operations

**Viewing deployment logs:**
```bash
# List recent deployments
npx vercel ls --scope=waseer-law

# Inspect specific deployment
npx vercel inspect <deployment-url>

# View function logs (real-time)
npx vercel logs <deployment-url> --follow
```

**Environment variable management:**
```bash
# List all env vars
npx vercel env ls production

# Add a new secret
npx vercel env add SECRET_NAME production

# Remove an env var
npx vercel env rm SECRET_NAME production
```

### 4.4 Docker Deployment (Alternative)

If deploying outside Vercel (self-hosted):

```bash
# Build image
docker build -t norvaos:latest ./lexcrm

# Run container
docker run -d \
  --name norvaos \
  -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://ztsjvsutlrfisnrwdwfl.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> \
  -e SUPABASE_SERVICE_ROLE_KEY=<key> \
  -e CRON_SECRET=<secret> \
  -e RESEND_API_KEY=<key> \
  # ... all other env vars
  norvaos:latest

# Health check
curl http://localhost:3000/api/health
```

**Note:** Docker image includes Python 3 + pikepdf for XFA PDF processing. The Python sidecar runs inside the same container in Docker mode.

---

## 5. Database Operations

### 5.1 Migration Execution

**Migrations directory:** `scripts/migrations/`
**Current count:** 104 migrations (000 through 104)
**Tracking table:** `_migrations` (name, applied_at, checksum)

**Method 1 — Supabase Dashboard (recommended for production):**

1. Navigate to Supabase Dashboard → SQL Editor
2. Open the migration file (e.g., `scripts/migrations/104-segregation-of-duties-triggers.sql`)
3. Paste the SQL content
4. Click "Run"
5. Verify no errors in output
6. Confirm in `_migrations` table that the migration is recorded

**Method 2 — Migration script (automated):**

```bash
# Requires direct database connection (not pooler)
export SUPABASE_DB_URL="postgresql://postgres:<password>@db.ztsjvsutlrfisnrwdwfl.supabase.co:5432/postgres"

# Dry run (preview only)
pnpm db:migrate:dry-run

# Apply pending migrations
pnpm db:migrate

# Check status
pnpm db:migrate:status
```

### 5.2 Migration Safety Rules

1. **Migrations are forward-only.** There are no down migrations. If a migration causes issues, write a new corrective migration.
2. **Always use `IF NOT EXISTS`** for CREATE TABLE/INDEX/FUNCTION.
3. **Always include RLS policies** for new tables.
4. **Never modify or renumber** an existing migration that has been applied.
5. **Test on staging first.** The CI pipeline applies migrations to staging before production deployment.
6. **Use direct connection** (not pooler) for migrations — long transactions may timeout on pooled connections.

### 5.3 Common Database Queries

**Check migration status:**
```sql
SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 10;
```

**Check active users:**
```sql
SELECT u.id, u.is_active, r.name as role
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.tenant_id = 'da1788a2-8baa-4aa5-9733-97510944afac';
```

**Check RLS is enabled on all tables:**
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Check active triggers:**
```sql
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

**Check table sizes:**
```sql
SELECT
  relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;
```

### 5.4 Dangerous Operations — Require Approval

The following operations require explicit approval from the platform owner before execution:

| Operation | Risk | Approval Required |
|---|---|---|
| `DROP TABLE` | Permanent data loss | Written approval + backup verification |
| `TRUNCATE` | Permanent data loss | Written approval + backup verification |
| `ALTER TABLE ... DROP COLUMN` | Data loss | Written approval |
| `DELETE FROM` without WHERE | Bulk deletion | Written approval |
| Disabling RLS on any table | Security bypass | Never in production |
| Modifying `_migrations` table | Migration tracking corruption | Never |
| Direct `UPDATE` on `invoices` where `status = 'paid'` | Immutability violation | Blocked by trigger — requires trigger bypass |

---

## 6. Rollback Procedures

### 6.1 Application Rollback (Vercel)

**Instant rollback via Vercel dashboard:**

1. Navigate to Vercel Dashboard → Deployments
2. Find the last known-good deployment
3. Click "..." → "Promote to Production"
4. Deployment is live within ~30 seconds

**Rollback via CLI:**
```bash
# List deployments
npx vercel ls --scope=waseer-law

# Promote specific deployment
npx vercel promote <deployment-url> --scope=waseer-law
```

### 6.2 Application Rollback (Git)

```bash
# Revert the problematic commit(s)
git revert <commit-sha>
git push origin main
# CI/CD pipeline redeploys automatically
```

### 6.3 Database Rollback

**There are no automatic down migrations.** Rollback strategy depends on the issue:

| Scenario | Action |
|---|---|
| New column added, not needed | Write migration: `ALTER TABLE ... DROP COLUMN IF EXISTS` |
| New table added, not needed | Write migration: `DROP TABLE IF EXISTS` |
| Trigger causing issues | Write migration: `DROP TRIGGER IF EXISTS ... ON ...` |
| Function causing issues | Write migration: `DROP FUNCTION IF EXISTS ...` |
| Data corruption | Restore from Supabase point-in-time backup (see Section 10) |
| Schema corruption | Restore from Supabase point-in-time backup (see Section 10) |

**Critical rule:** Never modify a migration file that has already been applied. Always create a new migration to correct issues.

### 6.4 Rollback Decision Matrix

| Severity | Detection | Action | Timeline |
|---|---|---|---|
| P0 — System down | Health check fails | Vercel instant rollback | < 5 minutes |
| P1 — Data at risk | Error spike in logs | Vercel rollback + investigate | < 15 minutes |
| P2 — Feature broken | User report / monitoring | Hotfix branch + deploy | < 2 hours |
| P3 — Minor issue | User report | Normal fix cycle | Next business day |

---

## 7. Cron Jobs and Scheduled Tasks

### 7.1 Vercel Cron Configuration

Configured in `vercel.json`:

| Endpoint | Schedule | Description |
|---|---|---|
| `/api/cron/deadline-alerts` | `0 8 * * *` (daily 8 AM UTC) | Send deadline reminder notifications |
| `/api/cron/document-reminders` | `0 9 * * 1` (Monday 9 AM UTC) | Remind about pending document requests |

### 7.2 All Cron Endpoints

These endpoints exist in the codebase and can be triggered manually or configured in Vercel:

| Endpoint | Purpose | Recommended Schedule |
|---|---|---|
| `/api/cron/deadline-alerts` | Deadline reminder notifications | Daily, 8 AM |
| `/api/cron/document-reminders` | Pending document reminders | Weekly, Monday 9 AM |
| `/api/cron/expiry-reminders` | Expiring item notifications | Daily, 7 AM |
| `/api/cron/lead-automations` | Lead pipeline automation triggers | Every 15 minutes |
| `/api/cron/microsoft-sync` | Microsoft 365 calendar/email sync | Every 30 minutes |
| `/api/cron/process-jobs` | Async job queue processing | Every 5 minutes |
| `/api/cron/snapshot-revenue` | Revenue metrics snapshot | Daily, midnight |
| `/api/cron/update-invoice-aging` | Invoice aging bucket updates | Daily, 1 AM |
| `/api/cron/expire-invites` | Expire stale portal/seat invitations | Daily, 2 AM |

### 7.3 Manual Cron Execution

To trigger a cron job manually:

```bash
curl -X POST https://app.norvaos.com/api/cron/deadline-alerts \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### 7.4 Cron Authentication

All cron endpoints validate `Authorization: Bearer {CRON_SECRET}`. If the header is missing or incorrect, the endpoint returns `401 Unauthorized`.

---

## 8. Health Checks and Monitoring

### 8.1 Health Check Endpoint

```bash
curl -s https://app.norvaos.com/api/health | jq .
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-15T12:00:00.000Z"
}
```

**Failure response (DB unreachable):**
```json
{
  "status": "error",
  "message": "Database connection failed"
}
```

### 8.2 Monitoring Points

| What to Monitor | Where | Alert Threshold |
|---|---|---|
| Health endpoint | `/api/health` | Any non-200 response |
| Vercel function errors | Vercel Dashboard → Logs | > 5 errors/minute |
| Vercel function duration | Vercel Dashboard → Analytics | p95 > 10 seconds |
| Supabase DB CPU | Supabase Dashboard → Reports | > 80% sustained |
| Supabase DB connections | Supabase Dashboard → Reports | > 80% of pool limit |
| Supabase DB storage | Supabase Dashboard → Settings | > 80% of plan limit |
| Stripe webhook failures | Stripe Dashboard → Webhooks | Any failed delivery |
| Cron job failures | Vercel Dashboard → Cron | Any failed execution |
| Auth error rate | Application logs | > 10 AuthErrors/minute |
| RLS violation rate | Supabase logs | Any `row-level security` error |

### 8.3 Log Format

All application logs are structured JSON to stdout (consumed by Vercel):

```json
{
  "timestamp": "2026-03-15T12:00:00.000Z",
  "level": "error",
  "message": "Invoice update blocked by immutability trigger",
  "context": {
    "userId": "uuid",
    "tenantId": "uuid",
    "route": "/api/invoices/[id]",
    "action": "update_invoice"
  },
  "stack": "Error: ..."
}
```

### 8.4 Key Log Patterns to Watch

| Pattern | Meaning | Action |
|---|---|---|
| `AuthError: Account deactivated` | Deactivated user attempting access | Expected — verify user is actually deactivated |
| `AuthError: Unauthorized` | Missing or invalid session | Check for session expiry or token issues |
| `RBAC: Permission denied` | User lacks required permission | Verify role assignments are correct |
| `RLS violation` | Tenant isolation enforcement | Investigate — should not occur in normal operation |
| `Immutability trigger blocked` | Paid invoice or cleared cheque modification attempt | Expected — verify it is not a legitimate update path |
| `Segregation of duties violation` | Same user attempting prepare + approve | Expected enforcement |
| `Circuit breaker open: python-worker` | Python sidecar unavailable | Check sidecar health, restart if needed |

---

## 9. Incident Response

### 9.1 Severity Classification

| Severity | Definition | Response Time | Examples |
|---|---|---|---|
| **P0 — Critical** | System completely down or data integrity at risk | Immediate (< 15 min) | Health check failing, DB unreachable, RLS disabled, data breach |
| **P1 — High** | Major feature broken, significant user impact | < 1 hour | Auth failing, trust accounting errors, billing broken |
| **P2 — Medium** | Feature degraded, workaround exists | < 4 hours | Portal links failing, cron job errors, email delivery issues |
| **P3 — Low** | Minor issue, cosmetic, no data impact | Next business day | UI alignment, non-critical feature bug |

### 9.2 Incident Response Steps

#### P0 — System Down

```
1. VERIFY     — Confirm the issue (health check, logs, user reports)
2. MITIGATE   — Vercel instant rollback to last known-good deployment
3. NOTIFY     — Inform platform owner (Zia Waseer) immediately
4. DIAGNOSE   — Review Vercel logs, Supabase logs, recent deployments
5. FIX        — Hotfix branch → test on staging → deploy
6. VERIFY     — Confirm fix in production
7. POSTMORTEM — Document root cause, timeline, and prevention measures
```

#### P1 — Major Feature Broken

```
1. VERIFY     — Reproduce the issue, check logs
2. ASSESS     — Determine if rollback is needed or if a hotfix is sufficient
3. NOTIFY     — Inform platform owner within 1 hour
4. FIX        — Hotfix branch → test on staging → deploy
5. VERIFY     — Confirm fix in production
6. DOCUMENT   — Update known issues if relevant
```

### 9.3 Data Integrity Incidents

If a data integrity issue is suspected:

```
1. STOP       — Do NOT attempt to fix data directly
2. SNAPSHOT   — Capture current state:
                SELECT * FROM affected_table WHERE <conditions>;
3. ASSESS     — Determine scope of corruption
4. NOTIFY     — Inform platform owner immediately
5. PLAN       — Determine correction approach:
                a) Corrective SQL migration (preferred)
                b) Point-in-time restore (if widespread)
6. EXECUTE    — Apply correction with full audit trail
7. VERIFY     — Confirm data integrity restored
```

### 9.4 Trust Accounting Incidents

Trust accounting issues are always P0 due to regulatory requirements:

```
⚠️  NEVER manually UPDATE trust_transactions, trust_accounts, or trust_disbursement_requests
⚠️  All trust modifications must go through the application layer (which enforces:
    - Overdraft prevention (DB trigger)
    - Append-only transaction log (immutability triggers)
    - Matter-scoped access (RLS)
    - Segregation of duties (prepared_by ≠ approved_by)
    - Cleared funds only (hold system)
```

If a trust accounting discrepancy is detected:

1. **Freeze** — Do not process any trust transactions
2. **Reconcile** — Run trust reconciliation report via the application
3. **Document** — Record the discrepancy with timestamps and amounts
4. **Escalate** — Notify platform owner and legal counsel
5. **Correct** — Create corrective entries through the application (never direct SQL)

---

## 10. Backup and Recovery

### 10.1 Supabase Backup Configuration

| Feature | Configuration |
|---|---|
| Automatic backups | Enabled (Supabase manages) |
| Backup frequency | Daily |
| Retention period | Plan-dependent (Pro: 7 days, Team: 14 days) |
| Point-in-time recovery (PITR) | Available on Pro plan and above |
| Storage backups | Supabase Storage is backed up separately |

### 10.2 Point-in-Time Recovery (PITR)

To restore the database to a specific point in time:

1. Navigate to Supabase Dashboard → Settings → Database → Backups
2. Select "Point in Time Recovery"
3. Choose the target timestamp (before the incident)
4. Confirm the restore
5. **WARNING:** This replaces the entire database state. All changes after the restore point are lost.

### 10.3 Manual Backup Procedure

For additional backup assurance before risky operations:

```bash
# Full schema + data dump
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="backup-$(date +%Y%m%d-%H%M%S).dump"

# Schema only
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --file="schema-$(date +%Y%m%d-%H%M%S).sql"

# Specific table
pg_dump "$SUPABASE_DB_URL" \
  --table=invoices \
  --format=custom \
  --file="invoices-backup-$(date +%Y%m%d-%H%M%S).dump"
```

### 10.4 Restore from Manual Backup

```bash
# Restore full backup (WARNING: destructive)
pg_restore -d "$SUPABASE_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  backup-20260315-120000.dump

# Restore single table
pg_restore -d "$SUPABASE_DB_URL" \
  --table=invoices \
  --clean \
  --if-exists \
  --no-owner \
  invoices-backup-20260315-120000.dump
```

### 10.5 Recovery Time Objectives

| Scenario | RTO Target | RPO Target | Method |
|---|---|---|---|
| Application failure | < 5 minutes | 0 (no data loss) | Vercel instant rollback |
| Database corruption (minor) | < 30 minutes | 0 | Corrective migration |
| Database corruption (major) | < 2 hours | Up to 24 hours | Daily backup restore |
| Database corruption (targeted) | < 1 hour | Minutes | PITR (if on Pro+) |
| Full disaster (Supabase outage) | Dependent on provider | Dependent on provider | Supabase SLA |

### 10.6 Restore Test Protocol

**Scheduled:** 2026-03-22

The restore test will validate:

1. **Backup capture** — pg_dump of full production database
2. **Restore to isolated instance** — pg_restore to a temporary Supabase project
3. **Data integrity verification** — Row counts, referential integrity, trigger functionality
4. **Application connectivity** — Point staging app at restored DB, verify functionality
5. **Recovery time measurement** — Wall-clock time from backup to operational state
6. **Cleanup** — Destroy temporary project

---

## 11. Security Controls Reference

### 11.1 Enforced Controls (Phase 8 — Accepted)

| Control | Enforcement Layer | Trigger/Mechanism |
|---|---|---|
| Tenant isolation | Database (RLS) | `USING (tenant_id = get_current_tenant_id())` on all tables |
| User deactivation | Middleware + API | `is_active` check in `middleware.ts` and `authenticateRequest()` |
| RBAC | API | `requirePermission(auth, entity, action)` on all 235 routes |
| Invoice paid immutability | Database (trigger) | `prevent_paid_invoice_mutation()` — locks core fields when `status = 'paid'` |
| Cheque post-issuance immutability | Database (trigger) | `prevent_issued_cheque_mutation()` — cleared/voided fully immutable |
| Segregation of duties (disbursements) | Database (trigger) | `enforce_disbursement_segregation()` — `prepared_by ≠ approved_by` |
| Segregation of duties (payment plans) | Database (trigger) | `enforce_payment_plan_segregation()` — `created_by ≠ approved_by` |
| Segregation of duties (write-offs) | Database (trigger) | `enforce_write_off_segregation()` — requester ≠ approver |
| Portal token hashing | Database + Application | SHA-256 hashed tokens, plaintext redacted, `validatePortalToken()` |
| Trust overdraft prevention | Database (trigger) | Balance check before debit |
| Trust append-only log | Database (trigger) | `trust_transactions` immutability trigger |
| Trust matter-scoped access | Database (RLS) | Standard tenant RLS + matter_id scoping |
| Trust cleared funds only | Application | Hold system prevents disbursement of uncleared funds |
| Schema drift detection | CI | `scripts/check-schema-drift.mjs` in CI pipeline |

### 11.2 Security Headers

Configured in `next.config.ts`:

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` | XSS prevention |
| `X-Frame-Options` | `DENY` (exception: `/api/documents/view` → `SAMEORIGIN`) | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage prevention |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Feature restriction |

### 11.3 Secrets Rotation Schedule

| Secret | Rotation Frequency | Procedure |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | On compromise only | Regenerate in Supabase Dashboard → update Vercel env |
| `CRON_SECRET` | Quarterly | Generate new → update Vercel + GitHub secrets |
| `STRIPE_WEBHOOK_SECRET` | On endpoint change | Stripe Dashboard → Webhooks → rotate |
| `RESEND_API_KEY` | On compromise only | Resend Dashboard → regenerate |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | On compromise only | Rotate key → re-encrypt stored tokens |
| `PLATFORM_TOKEN_ENCRYPTION_KEY` | On compromise only | Rotate key → re-encrypt stored tokens |
| OAuth client secrets (Microsoft, GHL, Clio) | On compromise only | Provider dashboard → regenerate |

---

## 12. Scaling and Performance

### 12.1 Current Architecture Limits

| Component | Limit | Mitigation |
|---|---|---|
| Vercel Serverless Functions | 10s default timeout (Pro: 60s) | Long operations use job queue |
| Supabase connection pool | Plan-dependent (Free: 60, Pro: 200) | Upstash Redis auth cache reduces DB calls |
| Supabase storage | Plan-dependent | Monitor in dashboard |
| Supabase bandwidth | Plan-dependent | CDN for static assets via Vercel |

### 12.2 Performance Optimisations in Place

| Optimisation | Location | Effect |
|---|---|---|
| Request-scoped auth memoization | `lib/services/auth.ts` (AsyncLocalStorage) | 0 DB queries for 2nd+ auth call in same request |
| Redis auth cache (120s TTL) | `lib/services/auth.ts` | ~90% cache hit rate for auth lookups |
| JWT local decode in middleware | `lib/supabase/middleware.ts` | No network call per page navigation |
| Front-desk role cookie (5min TTL) | `lib/supabase/middleware.ts` | Avoids re-querying role on every navigation |
| Static asset caching (1 year immutable) | `next.config.ts` | Browser caches all hashed static assets |
| Tree-shaking (lucide-react, recharts, date-fns) | `next.config.ts` | Smaller client bundle |
| Standalone output | `next.config.ts` | Minimal deployment footprint |

### 12.3 Python Sidecar

The Python sidecar (`PYTHON_WORKER_URL`) handles XFA PDF processing:

- **Circuit breaker:** 3 failures in 60 seconds → 30-second open state
- **Timeout:** 60 seconds per request
- **Health check:** `GET /health`
- **Graceful degradation:** If sidecar is down, XFA PDF features are unavailable but all other functionality continues

---

## 13. External Service Dependencies

### 13.1 Dependency Health Checks

| Service | Health Check | Fallback Behaviour |
|---|---|---|
| Supabase | `/api/health` (DB connectivity) | Application down — no fallback |
| Resend | Email send returns 200 | Logs warning, continues without email |
| Stripe | Webhook delivery status | Billing features unavailable |
| Upstash Redis | Connection test on startup | Auth works without cache (direct DB) |
| Python Sidecar | `GET /health` | XFA PDF features unavailable |
| Microsoft Graph | Token refresh success | M365 sync paused, manual retry |

### 13.2 Service Status Pages

| Service | Status Page |
|---|---|
| Supabase | https://status.supabase.com |
| Vercel | https://www.vercel-status.com |
| Stripe | https://status.stripe.com |
| Resend | https://status.resend.com |
| Upstash | https://status.upstash.com |
| Microsoft Azure | https://status.azure.com |

### 13.3 Stripe Webhook Configuration

**Webhook endpoint:** `https://app.norvaos.com/api/webhooks/stripe`

**Subscribed events:**
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Verification:** Stripe signature validation using `STRIPE_WEBHOOK_SECRET`.

---

## 14. Contact Escalation Matrix

| Role | Contact | Escalation Trigger |
|---|---|---|
| **Platform Owner** | Zia Waseer | All P0/P1 incidents, any data integrity issue, trust accounting discrepancy |
| **Supabase Support** | Supabase Dashboard → Support | Database outage, PITR issues, performance degradation |
| **Vercel Support** | Vercel Dashboard → Support | Deployment failures, function timeouts, edge network issues |
| **Stripe Support** | Stripe Dashboard → Support | Webhook failures, payment processing issues |
| **Resend Support** | Resend Dashboard → Support | Email delivery failures, domain issues |

### Escalation Protocol

```
P0: Immediate phone/text to Platform Owner → begin mitigation → follow up in writing
P1: Slack/email to Platform Owner within 1 hour → begin fix
P2: Email to Platform Owner within 4 hours → schedule fix
P3: Log in issue tracker → fix in next release cycle
```

---

## 15. Operational Checklists

### 15.1 Daily Operations Checklist

- [ ] Verify health endpoint: `curl https://app.norvaos.com/api/health`
- [ ] Review Vercel function error rate (Dashboard → Analytics)
- [ ] Review Supabase DB metrics (Dashboard → Reports)
- [ ] Check Stripe webhook delivery status (Dashboard → Webhooks → Recent deliveries)
- [ ] Review cron job execution logs (Vercel Dashboard → Cron)

### 15.2 Weekly Operations Checklist

- [ ] Review Supabase storage usage
- [ ] Review Supabase bandwidth usage
- [ ] Check for pending dependency security updates: `pnpm audit`
- [ ] Verify all cron jobs executed on schedule
- [ ] Review auth error patterns in logs

### 15.3 Monthly Operations Checklist

- [ ] Review and rotate `CRON_SECRET` if due
- [ ] Verify Supabase backup retention is adequate
- [ ] Review Vercel usage and billing
- [ ] Review Stripe billing reconciliation
- [ ] Test portal link generation and validation flow
- [ ] Verify trust account reconciliation reports generate correctly

### 15.4 Pre-Deployment Checklist

- [ ] All tests pass locally: `pnpm test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] Schema drift check passes (if DB changes): `node scripts/check-schema-drift.mjs`
- [ ] New migration tested on staging (if applicable)
- [ ] Environment variables added to Vercel (if new ones required)
- [ ] Breaking changes documented
- [ ] CI/CD pipeline green on staging

### 15.5 New User Onboarding Checklist

1. Create auth user in Supabase Dashboard → Authentication → Users
2. Create application user record via Settings → Users → Invite
3. Assign appropriate role (Admin, Lawyer, Paralegal, Clerk, Front Desk)
4. Verify user can log in and sees appropriate content for their role
5. If front-desk role: verify redirect to `/front-desk` works

### 15.6 User Offboarding Checklist

1. Navigate to Settings → Users → find user
2. Set `is_active = false` (deactivate, do not delete)
3. Verify user is blocked at:
   - Middleware level (redirect to `/login?error=account_deactivated`)
   - API level (`AuthError: Account deactivated, 403`)
4. Existing sessions are invalidated on next request
5. **Do NOT delete the user record** — soft delete preserves audit trail

---

## 16. Known Limitations

### 16.1 Current Limitations

| # | Limitation | Impact | Mitigation | Target Resolution |
|---|---|---|---|---|
| 1 | Schema types are manual (`lib/types/database.ts`), not generated from DB | Type drift risk if migration and types diverge | CI schema drift check (`check-schema-drift.mjs`) catches most drift; static analysis, not runtime generated types | Future: implement `supabase gen types` in CI |
| 2 | Email live-validation carve-out | 3 email scenarios not production-tested: inbound association, ambiguous resolution, reply with sender identity | Code-side work done; blocked on Azure App Registration + admin consent | Pending Microsoft Graph OAuth setup |
| 3 | Migrations are forward-only | No automatic rollback for failed migrations | Manual corrective migrations; test on staging first | By design — forward-only is safer for production |
| 4 | Python sidecar required for XFA PDFs | XFA PDF processing unavailable if sidecar is down | Circuit breaker with 30s recovery; all non-XFA features unaffected | Acceptable — XFA is niche use case |
| 5 | Bank feed integration not implemented | No automatic bank transaction import | Manual reconciliation via trust accounting UI | Future phase |
| 6 | QuickBooks integration not implemented | No automatic accounting sync | Manual export/import | Future phase |
| 7 | Redis cache is optional | Without Redis, every API call hits DB for auth | Supabase connection pool handles typical load; Redis recommended for scale | Deploy Upstash Redis for production |
| 8 | Observability limited to structured logs | No distributed tracing, no APM dashboard | Vercel Analytics provides basic metrics; Sentry setup scheduled 2026-03-25 | Sentry deployment: 2026-03-25 |
| 9 | No automated restore test evidence yet | Backup restore has not been validated end-to-end | Supabase automatic backups active; manual test scheduled | Restore test: 2026-03-22 |

### 16.2 Architectural Decisions

| Decision | Rationale |
|---|---|
| Single-tenant architecture | Law firm data isolation is non-negotiable; simplifies RLS; one Supabase project per firm |
| Manual types over generated | Faster development iteration; drift mitigated by CI check |
| SHA-256 for portal tokens (not bcrypt) | Tokens are looked up by hash (must be indexable); bcrypt not suitable for lookup |
| Forward-only migrations | Safer for production; prevents accidental data loss from down migrations |
| Soft deletes (is_active flag) | Preserves audit trail; required for legal compliance |
| Admin role bypasses RBAC | Single firm context — admin is the managing partner; simplifies permission model |

---

## Appendix A: Complete Cron Schedule (Production)

Add to `vercel.json` when ready to enable all cron jobs:

```json
{
  "crons": [
    { "path": "/api/cron/deadline-alerts",     "schedule": "0 8 * * *"    },
    { "path": "/api/cron/document-reminders",  "schedule": "0 9 * * 1"    },
    { "path": "/api/cron/expiry-reminders",    "schedule": "0 7 * * *"    },
    { "path": "/api/cron/lead-automations",    "schedule": "*/15 * * * *" },
    { "path": "/api/cron/microsoft-sync",      "schedule": "*/30 * * * *" },
    { "path": "/api/cron/process-jobs",        "schedule": "*/5 * * * *"  },
    { "path": "/api/cron/snapshot-revenue",    "schedule": "0 0 * * *"    },
    { "path": "/api/cron/update-invoice-aging", "schedule": "0 1 * * *"   },
    { "path": "/api/cron/expire-invites",      "schedule": "0 2 * * *"    }
  ]
}
```

## Appendix B: Quick Reference Commands

```bash
# Health check
curl -s https://app.norvaos.com/api/health | jq .

# Trigger cron manually
curl -X POST https://app.norvaos.com/api/cron/<job-name> \
  -H "Authorization: Bearer $CRON_SECRET"

# Check migration status
psql "$SUPABASE_DB_URL" -c "SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 10;"

# Vercel deployment list
npx vercel ls --scope=waseer-law

# Instant rollback
npx vercel promote <deployment-url> --scope=waseer-law

# Run tests
pnpm test

# Type check
pnpm type-check

# Build
pnpm build

# Schema drift check
SUPABASE_DB_URL="$DB_URL" node scripts/check-schema-drift.mjs
```

---

**Document History:**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-03-15 | Engineering | Initial production runbook |

**Next Scheduled Updates:**
- 2026-03-22: Add restore test results and recovery time metrics
- 2026-03-25: Add Sentry/observability configuration details
