# Demo Environment — NorvaOS

> **WARNING: All demo data is synthetic. Never use real client data. Never run these scripts against a production tenant.**

## Overview

This directory contains tooling to create, seed, and reset a NorvaOS demo environment for sales demonstrations. The environment is isolated to a dedicated demo tenant and contains entirely fictional data.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| A demo tenant record in Supabase | Created via Supabase dashboard — requires a row in the `tenants` table with `id` containing the word "demo" |
| Supabase service role key | Bypasses RLS — treat as a secret, never commit |
| `ts-node` or `tsx` available | `pnpm add -D ts-node` if not present |

## Environment Variables

```bash
DEMO_TENANT_ID=<demo-tenant-uuid>          # Must contain "demo" in the value
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Never hardcode these values. Use a `.env.demo` file (gitignored) or pass inline.

## Scripts

### Seed a demo tenant

Inserts all synthetic data for the demo tenant:

```bash
DEMO_TENANT_ID=demo-xxxxx \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npx ts-node scripts/demo/seed-demo-tenant.ts
```

Inserts:
- 20 contacts (15 individuals + 5 companies)
- 15 matters (9 immigration + 6 family law)
- 30 tasks
- 10 calendar events
- 25 time entries

A seed manifest is written to `scripts/demo/manifests/seed-{timestamp}.json`.

### Reset a demo tenant

Deletes all demo data and reseeds from scratch:

```bash
DEMO_TENANT_ID=demo-xxxxx \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npx ts-node scripts/demo/reset-demo-tenant.ts
```

Delete only (no reseed):

```bash
npx ts-node scripts/demo/reset-demo-tenant.ts --delete-only
```

### Verify demo isolation

Checks that demo data meets all isolation requirements:

```bash
DEMO_TENANT_ID=demo-xxxxx \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npx ts-node scripts/demo/verify-demo-isolation.ts
```

Checks performed:
- All emails use `@example.com` only
- All phone numbers use `555-xxxx` format
- All matter references use `DEMO-` prefix
- Tenant ID contains "demo" marker
- No cross-tenant data visible

Exit code `0` = pass, `1` = one or more failures.

## Data Generated

| Entity | Count | Notes |
|--------|-------|-------|
| Contacts (individuals) | 15 | Fictional names, `@example.com` emails, `555-xxxx` phones |
| Contacts (companies) | 5 | Fictional company names |
| Matters (immigration) | 9 | Express Entry, Spousal Sponsorship, Work Permits, etc. |
| Matters (family law) | 6 | Divorce, Custody, Separation, etc. |
| Tasks | 30 | Mix of priorities, statuses, due dates |
| Calendar Events | 10 | Hearings, consultations, deadlines |
| Time Entries | 25 | Billable/non-billable, various rates |

## Data Safety Controls

- All emails: `@example.com` only — blocked by script validation
- All phones: `555-xxxx` format — blocked by script validation
- All matter numbers: `DEMO-YYYY-NNNN` format
- All descriptions: contain "synthetic data" disclaimer
- Tenant ID guard: script exits if `DEMO_TENANT_ID` doesn't contain "demo"
- No production credentials in any generated data

## Known Limitations

1. Demo tenant must be pre-created in Supabase dashboard (no automation for tenant creation)
2. In-memory deduplication only — if seed runs twice without reset, duplicate rows will be inserted
3. Calendar events use hard-coded location strings — does not reflect real office addresses
4. Time entries reference matters by position, not by practice area logic
5. No demo documents, document templates, or email threads are seeded

## Security Notes

- The service role key bypasses RLS — it has full database access
- Never commit `.env.demo` or expose the service role key
- These scripts are for internal sales use only — not for client-facing environments
- The verify script does not guarantee 100% isolation — it checks the most common failure patterns
