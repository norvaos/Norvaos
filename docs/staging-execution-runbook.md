# Staging Execution Runbook  -  Phase 1 Lead Intake Automation

## Prerequisites

All tooling is built and tests pass (758/758). This runbook covers the
manual steps required to execute staging validation.

---

## Step 1: Configure GitHub Secrets

Go to **GitHub → Repository → Settings → Secrets and variables → Actions**
and add the following repository secrets:

### Deployment Secrets
| Secret | Description |
|---|---|
| `VERCEL_TOKEN` | Vercel API token (from vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel org/team ID (from .vercel/project.json or dashboard) |
| `VERCEL_PROJECT_ID` | Vercel project ID for NorvaOS |

### Database Secrets
| Secret | Description |
|---|---|
| `STAGING_DB_URL` | Staging Supabase Postgres connection string |

### Staging Validation Secrets
| Secret | Description | Example Value |
|---|---|---|
| `STAGING_SUPABASE_URL` | Staging Supabase project URL | `https://xxx.supabase.co` |
| `STAGING_SUPABASE_ANON_KEY` | Staging Supabase anon/public key | `eyJ...` |
| `STAGING_CRON_SECRET` | Bearer token for cron endpoint auth | Any secure random string |
| `STAGING_ADMIN_EMAIL` | Tenant A admin email | `admin@vanguardlaw.test` |
| `STAGING_ADMIN_PASSWORD` | Tenant A admin password | (set during user creation) |
| `STAGING_LAWYER_EMAIL` | Tenant A lawyer email | `lawyer@vanguardlaw.test` |
| `STAGING_LAWYER_PASSWORD` | Tenant A lawyer password | (set during user creation) |
| `STAGING_PARALEGAL_EMAIL` | Tenant A paralegal email | `paralegal@vanguardlaw.test` |
| `STAGING_PARALEGAL_PASSWORD` | Tenant A paralegal password | (set during user creation) |
| `STAGING_CLERK_EMAIL` | Tenant A clerk email | `clerk@vanguardlaw.test` |
| `STAGING_CLERK_PASSWORD` | Tenant A clerk password | (set during user creation) |
| `STAGING_TENANT_B_ADMIN_EMAIL` | Tenant B admin email | `admin@crossfieldlegal.test` |
| `STAGING_TENANT_B_ADMIN_PASSWORD` | Tenant B admin password | (set during user creation) |

---

## Step 2: Create Supabase Auth Users

Go to your **staging Supabase project → Authentication → Users → Add User**.

Create these 5 users with **email + password** (auto-confirm enabled):

| Email | Password | Notes |
|---|---|---|
| `admin@vanguardlaw.test` | (choose secure password) | Tenant A Admin |
| `lawyer@vanguardlaw.test` | (choose secure password) | Tenant A Lawyer |
| `paralegal@vanguardlaw.test` | (choose secure password) | Tenant A Paralegal |
| `clerk@vanguardlaw.test` | (choose secure password) | Tenant A Clerk |
| `admin@crossfieldlegal.test` | (choose secure password) | Tenant B Admin |

**CRITICAL**: After creating each auth user, copy the `auth.users.id` (UUID)
from the Supabase dashboard and update the seed SQL file to match:

In `scripts/staging-seed-lead-validation.sql`, update the `auth_user_id`
values in the users INSERT to match the actual Supabase auth user UUIDs:

```sql
-- Replace these placeholder auth_user_ids:
-- au000000-0000-0000-0000-000000000001 → actual UUID for admin@vanguardlaw.test
-- au000000-0000-0000-0000-000000000002 → actual UUID for lawyer@vanguardlaw.test
-- au000000-0000-0000-0000-000000000003 → actual UUID for paralegal@vanguardlaw.test
-- au000000-0000-0000-0000-000000000004 → actual UUID for clerk@vanguardlaw.test
-- au000000-0000-0000-0000-000000000010 → actual UUID for admin@crossfieldlegal.test
```

---

## Step 3: Seed the Staging Database

After creating auth users and updating the seed SQL:

```bash
psql $STAGING_DATABASE_URL -f scripts/staging-seed-lead-validation.sql
```

Verify the output shows the summary notice with correct record counts.

---

## Step 4: Set CRON_SECRET in Vercel Staging Environment

Go to **Vercel Dashboard → Project → Settings → Environment Variables**.

Add `CRON_SECRET` with the same value you used in GitHub Secrets, scoped
to the **Preview/Staging** environment.

---

## Step 5: Push to Main and Monitor Pipeline

```bash
git push origin main
```

The CI/CD pipeline will execute in order:
1. `build`  -  lint, type-check, build
2. `deploy-staging`  -  deploy to Vercel staging
3. `migrate-staging`  -  check + apply pending migrations
4. `validate-staging`  -  run staging API validation script
5. `deploy-production`  -  (blocked by manual approval gate)

Monitor at: GitHub → Actions → CI/CD workflow run

---

## Step 6: Collect Validation Results

After the pipeline completes, collect results from:

1. **GitHub Actions logs** → `validate-staging` job output
   - Area-by-area pass/fail breakdown
   - Performance baselines
   - Go/No-Go assessment

2. **Migration results** → `migrate-staging` job output
   - Which migrations were applied
   - Any migration errors

---

## Step 7: Run Manual Local Validation (Alternative)

If you prefer to validate against a local or staging environment manually:

```bash
# Set environment variables
export STAGING_URL=https://staging.norvaos.com  # or http://localhost:3000
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_ANON_KEY=xxx
export ADMIN_EMAIL=admin@vanguardlaw.test
export ADMIN_PASSWORD=xxx
export LAWYER_EMAIL=lawyer@vanguardlaw.test
export LAWYER_PASSWORD=xxx
export PARALEGAL_EMAIL=paralegal@vanguardlaw.test
export PARALEGAL_PASSWORD=xxx
export CLERK_EMAIL=clerk@vanguardlaw.test
export CLERK_PASSWORD=xxx
export TENANT_B_ADMIN_EMAIL=admin@crossfieldlegal.test
export TENANT_B_ADMIN_PASSWORD=xxx
export CRON_SECRET=xxx

# Run validation
npx tsx scripts/staging-api-validation.ts
```

---

## Step 8: UI Walkthrough Checklist

After API validation passes, manually verify these scenarios in the staging UI:

### 8.1 Lead Lifecycle
- [ ] View L1 (new_inquiry) → verify stage badge, available actions
- [ ] Attempt advance without outbound comm → verify guard blocks with clear message
- [ ] Log outbound communication → verify comm appears in activity
- [ ] Advance to contact_attempted → verify stage updates, milestone tasks generated
- [ ] Continue through qualification → verify qualification decision UI

### 8.2 Consultation Flow
- [ ] View L4 (consultation_booked) → verify consultation details shown
- [ ] View L5 (consultation_completed) → verify outcome displayed
- [ ] Verify consultation reminder automation settings visible

### 8.3 Retainer & Payment
- [ ] View L6 (retainer_sent) → verify retainer status badge
- [ ] View L7 (retainer_signed_payment_pending) → verify payment-pending state
- [ ] View L8 (retained_active_matter) → verify ready-to-convert state

### 8.4 Conversion
- [ ] View conversion gates on L8 → all gates green
- [ ] Convert L8 to matter → verify matter created, lead marked converted
- [ ] View L9 (already converted) → verify linked matter shown, conversion blocked
- [ ] Attempt convert on L6 → verify gate failures shown with reasons

### 8.5 Closure & Reopen
- [ ] View L10-L13 (closed leads) → verify closed badges, closure reasons displayed
- [ ] Reopen L10 → verify stage returns to target, tasks restored
- [ ] Close an active lead → verify closure record created, milestone tasks skipped
- [ ] Attempt advance on closed lead → verify blocked

### 8.6 Tenant Isolation (visual)
- [ ] Log in as Tenant B admin → verify only Tenant B data visible
- [ ] Verify no Tenant A leads, contacts, or matters appear

### 8.7 Role-Based UI
- [ ] Log in as Paralegal → verify edit actions hidden/disabled
- [ ] Log in as Clerk → verify only view access
- [ ] Log in as Admin → verify full access

### 8.8 Automation Visibility
- [ ] View automation settings for any lead → verify trigger list rendered
- [ ] Verify workspace config overrides reflected in settings
- [ ] Check milestone tasks → verify auto-generated at correct stages

---

## Step 9: Go/No-Go Decision

After all validation areas pass:

| Gate | Criteria | Status |
|---|---|---|
| Unit tests | 758/758 passing | |
| Enforcement spec | v1.3.0, 34 surfaces, version-synced | |
| Staging deploy | Vercel staging live | |
| Migrations | All applied, no errors | |
| API validation  -  E2E | All scenarios pass | |
| API validation  -  Permissions | All 4 roles correct | |
| API validation  -  Tenant isolation | Zero cross-tenant leaks | |
| API validation  -  Conversion | Gates enforce, idempotent | |
| API validation  -  Cron | Auth enforced, idempotent | |
| API validation  -  Close/Reopen | Full lifecycle correct | |
| API validation  -  Multi-user | No corruption under concurrency | |
| API validation  -  Performance | All under threshold | |
| UI walkthrough | All checklist items verified | |

**GO** = All gates pass, zero critical failures.
**CONDITIONAL** = Non-critical failures documented, mitigations identified.
**NO-GO** = Any critical failure (isolation, permissions, data corruption).
