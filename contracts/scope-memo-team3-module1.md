# Scope Memo — Team 3 / Module 1: Integration Inventory and Contract Package

**Module:** Team 3 / Module 1
**Delivery Type:** Documentation only — zero runtime changes
**Date:** 2026-03-15
**Author:** Team 3 / Module 1 Agent
**Reviewers:** Lead Engineer, Operations, Security

---

## 1. Module Objective

Produce a complete integration inventory and contract package for all third-party and internal service integrations in NorvaOS. Contracts are derived from source code as read — they document actual behaviour, not intended behaviour. All gaps between expected and observed behaviour are flagged explicitly.

---

## 2. Surfaces Touched (Files Created)

This module creates new documentation files only. No existing source files were modified.

**Files created:**

```
contracts/README.md
contracts/scope-memo-team3-module1.md          (this file)
contracts/integration-hardening-checklist.md
contracts/proof-plan-module1.md
contracts/integrations/microsoft-365-email.md
contracts/integrations/microsoft-onedrive.md
contracts/integrations/ghl.md
contracts/integrations/clio.md
contracts/integrations/stripe.md
contracts/integrations/notification-engine.md
```

---

## 3. Source Files Audited (Read-Only)

The following source files were read during the audit. None were modified.

| File | Purpose |
|---|---|
| `lib/services/microsoft-graph.ts` | OAuth flow, AES-256-GCM token encryption/decryption, auto-refresh, `graphFetch` client, rate-limit handling |
| `lib/services/email-sync.ts` | Microsoft Graph delta-query email pull, thread/message upsert, error counting, account disabling |
| `lib/services/email-send.ts` | Microsoft Graph sendMail and reply, `email_send_events` audit row |
| `lib/services/email-service.ts` | Resend-based client notification emails (stage change, document request, deadline alert, general, internal) |
| `lib/services/microsoft-onedrive.ts` | OneDrive browse, link, upload, folder hierarchy management, document migration |
| `lib/services/notification-engine.ts` | Multi-channel notification dispatch, tenant channel config, user preference filtering |
| `lib/services/job-queue.ts` | Enqueue, dequeue (optimistic lock), complete, fail, cancel, retry with exponential backoff, idempotency key |
| `lib/services/job-worker.ts` | Batch processor with concurrency, per-job timeout, graceful shutdown |
| `lib/utils/logger.ts` | Structured JSON logger (log.info/warn/error/debug), LogContext type |
| `app/api/integrations/microsoft/sync/route.ts` | Calendar and task sync trigger; Microsoft connection lookup |
| `app/api/integrations/ghl/connect/route.ts` | GHL OAuth initiation, permission check |
| `app/api/integrations/ghl/callback/route.ts` | GHL OAuth callback, token encryption, `platform_connections` upsert |
| `app/api/integrations/ghl/disconnect/route.ts` | GHL disconnect (exists, not fully audited) |
| `app/api/integrations/ghl/status/route.ts` | GHL connection status (exists, not fully audited) |
| `app/api/integrations/clio/connect/route.ts` | Clio OAuth initiation, permission check |
| `app/api/integrations/clio/callback/route.ts` | Clio OAuth callback, profile fetch, token encryption, `platform_connections` upsert |
| `app/api/integrations/clio/disconnect/route.ts` | Clio disconnect (exists, not fully audited) |
| `app/api/integrations/clio/status/route.ts` | Clio connection status (exists, not fully audited) |
| `app/api/webhooks/stripe/route.ts` | Stripe webhook consumer, signature verification, subscription lifecycle events |
| `lib/services/import/adapters/types.ts` | Adapter type re-export |
| `lib/services/import/adapters/ghl/contacts.ts` | GHL contact field mappings, aliases, transforms, validation |
| `lib/services/import/adapters/clio/contacts.ts` | Clio contact field mappings, aliases, transforms, validation |

---

## 4. Surfaces NOT Touched

The following are explicitly out of scope for this module. No changes of any kind were made to these areas:

- **Core database schema** — No migrations written, no table definitions changed
- **Auth and session management** — `lib/supabase/`, `lib/services/auth.ts` not modified
- **RBAC and permissions** — `lib/services/require-role.ts` not modified
- **RLS policies** — No SQL policy changes
- **Billing and Stripe charging logic** — Only the webhook consumer was read; no billing logic touched
- **Trust accounting** — Not in scope
- **All existing API routes** — No route handlers modified
- **All existing React components and pages** — No UI changes
- **All existing database query hooks** — `lib/queries/` not modified
- **Supabase migrations** — `scripts/migrations/` not modified
- **Environment variables** — No `.env` files read or modified; variables only referenced as documented in source
- **Third-party service configurations** — No changes to Azure AD app, Stripe dashboard, GHL app, or Clio app settings

---

## 5. Schema Changes

**NONE.** This module is documentation only. Zero schema changes.

---

## 6. Permission Changes

**NONE.** This module is documentation only. Zero permission or RBAC changes.

---

## 7. Observability Changes

**Documentation only.** This module documents the current observability posture of each integration. Identified gaps (unstructured logging, missing alert signals, absent audit tables) are flagged in the individual contract documents and in the hardening checklist. Remediation of these gaps is a separate work item and is NOT part of this module's delivery.

---

## 8. Proof Plan

How each contract will be validated. See [proof-plan-module1.md](proof-plan-module1.md) for detailed artefact requirements per integration.

At a high level:

| Integration | Validation Method |
|---|---|
| Microsoft 365 Email | Functional test: connect account, trigger sync, verify `email_messages` rows; send email, verify `email_send_events` row; expire token artificially, verify auto-refresh |
| Microsoft OneDrive | Functional test: browse root, link a file, upload a file under 4 MB, verify folder hierarchy created |
| GHL | Functional test: complete OAuth flow, verify `platform_connections` row; attempt import of sample CSV, verify contact rows |
| Clio | Functional test: complete OAuth flow including profile fetch, verify `platform_connections` row with user name; attempt import |
| Stripe | Functional test using Stripe CLI: send each handled event type, verify DB state changes; send event with bad signature, verify 400; replay event, verify duplicate invoice row (documents the gap) |
| Notification Engine | Unit test: dispatch event with multiple recipients, verify `notifications` rows; verify channel skipping with disabled prefs; verify non-throw behaviour on Resend failure |

---

## 9. Acceptance Criteria (Module Level)

- [ ] All six integration contracts exist and are populated from actual source code (not speculative)
- [ ] All identified gaps are labelled `IDENTIFIED GAP` with specific behaviour described
- [ ] Hardening checklist exists and each item is actionable
- [ ] Proof plan documents concrete artefact requirements for each integration
- [ ] No source files modified
- [ ] No migrations written
- [ ] No new API routes created
- [ ] Scope memo documents surfaces touched and not touched

---

## 10. Deployment Impact

**Zero.** This module delivers documentation files only. No code is deployed, no migrations are run, no environment variables are added or changed. Deploying the main application with this module's commits is identical to deploying without them from a runtime perspective.

---

## 11. Known Limitations and Open Items

### Audit Coverage Gaps

The following files exist but were not individually audited due to scope constraints. Contracts note these gaps explicitly:

| File | Gap |
|---|---|
| `lib/services/ghl/oauth.ts` | GHL token encryption and refresh implementation unverified |
| `lib/services/clio/oauth.ts` | Clio token encryption and refresh implementation unverified |
| `lib/services/push-service.ts` | Push notification delivery implementation unverified |
| `lib/services/microsoft-sync.ts` | Calendar and task sync implementation unverified |
| `app/api/integrations/microsoft/callback/route.ts` | Callback handler details unverified |
| `app/api/integrations/ghl/disconnect/route.ts` | Disconnect logic not fully audited |
| `app/api/integrations/clio/disconnect/route.ts` | Disconnect logic not fully audited |
| Import execution layer | The mechanism that invokes adapters and writes records to the DB was not identified |

### Identified Gaps Requiring Remediation (Summary)

These gaps are documented in individual contracts. They require separate engineering work before the affected integrations can be marked production-ready:

1. Unbounded recursive retry on HTTP 429 in `graphFetch()` (Microsoft)
2. Unstructured logging (`console.*`) across all integrations except the notification engine dispatch level
3. No alert signal when email sync account is disabled (`sync_enabled = false`)
4. `email_send_events.message_id` inserted as `null` and never linked
5. OneDrive: no upload retry; no upsert on `linkOneDriveFile`; stale folder cache no recovery path
6. GHL/Clio: no token refresh path; no job queue integration for import; no per-record deduplication
7. Stripe: no idempotency on `billing_invoices` insert; silent event consumption on missing tenant; no event ID stored
8. Notification engine: no retry; no deduplication; no email delivery audit trail for staff notifications
