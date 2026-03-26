# NorvaOS Integration Contracts  -  Index

**Module:** Team 3 / Module 1  -  Integration Inventory and Contract Package
**Status:** Draft  -  Pending Proof Validation
**Last Updated:** 2026-03-15
**Authors:** Team 3 / Module 1 Agent
**Review Cycle:** Quarterly or upon any integration change

---

## Purpose

This directory contains the authoritative integration contracts for all third-party and internal service integrations in NorvaOS. Each contract documents the actual implemented behaviour as read from source code  -  not aspirational specifications. Gaps identified during the audit are flagged explicitly as `IDENTIFIED GAP`.

These contracts serve as:

1. Production readiness gates  -  every integration must satisfy the hardening checklist before being marked production-ready
2. Incident reference material  -  on-call engineers use these to understand expected vs. actual behaviour
3. Handoff artefacts  -  Module 1 deliverable for Phase 8 operational readiness

---

## Governance

| Role | Responsibility |
|---|---|
| Team 3 / Module 1 | Authorship, initial audit, gap identification |
| Lead Engineer | Technical review and acceptance sign-off |
| Operations | Runbook alignment verification (due 2026-03-20) |
| Security | Credential handling and PII review |

Contracts must be updated whenever the corresponding service code changes. A PR that modifies an integration's source files must include a corresponding update to its contract document.

---

## Integration Contracts

| Integration | Contract File | Status | Last Reviewed |
|---|---|---|---|
| Microsoft 365 Email (sync + send) | [integrations/microsoft-365-email.md](integrations/microsoft-365-email.md) | Draft | 2026-03-15 |
| Microsoft OneDrive | [integrations/microsoft-onedrive.md](integrations/microsoft-onedrive.md) | Draft | 2026-03-15 |
| GoHighLevel (GHL) Import | [integrations/ghl.md](integrations/ghl.md) | Draft | 2026-03-15 |
| Clio Import | [integrations/clio.md](integrations/clio.md) | Draft | 2026-03-15 |
| Stripe Webhooks | [integrations/stripe.md](integrations/stripe.md) | Draft | 2026-03-15 |
| Notification Engine | [integrations/notification-engine.md](integrations/notification-engine.md) | Draft | 2026-03-15 |

---

## Supporting Documents

| Document | Purpose |
|---|---|
| [scope-memo-team3-module1.md](scope-memo-team3-module1.md) | Surfaces touched, surfaces not touched, deployment impact statement |
| [integration-hardening-checklist.md](integration-hardening-checklist.md) | Pre-production readiness gate for every integration |
| [proof-plan-module1.md](proof-plan-module1.md) | Proof artefact requirements per integration |

---

## Source File Map

All source files audited for this module:

```
lib/services/microsoft-graph.ts        -  Token encryption, refresh, graphFetch client
lib/services/email-sync.ts             -  Microsoft delta-sync email pull
lib/services/email-send.ts             -  Microsoft Graph sendMail
lib/services/email-service.ts          -  Resend-based client/internal notification emails
lib/services/microsoft-onedrive.ts     -  OneDrive browse, link, upload, folder management
lib/services/notification-engine.ts    -  Multi-channel notification dispatch
lib/services/job-queue.ts              -  Enqueue / dequeue / retry / idempotency
lib/services/job-worker.ts             -  Batch processor with timeout and concurrency
lib/utils/logger.ts                    -  Structured JSON logger
app/api/integrations/microsoft/sync/route.ts
app/api/integrations/ghl/connect/route.ts
app/api/integrations/ghl/callback/route.ts
app/api/integrations/ghl/disconnect/route.ts
app/api/integrations/ghl/status/route.ts
app/api/integrations/clio/connect/route.ts
app/api/integrations/clio/callback/route.ts
app/api/integrations/clio/disconnect/route.ts
app/api/integrations/clio/status/route.ts
app/api/webhooks/stripe/route.ts
lib/services/import/adapters/types.ts
lib/services/import/adapters/ghl/contacts.ts  (representative adapter)
lib/services/import/adapters/clio/contacts.ts (representative adapter)
```

---

## Known Identified Gaps Summary

The following gaps were identified across all contracts and require remediation before production approval:

1. **Microsoft 365 Email**  -  No circuit breaker across tenants; rate-limit retry is unbounded recursive recursion (no max depth); `email_send_events.message_id` is inserted as `null` and never linked after sync
2. **Microsoft OneDrive**  -  Simple upload hard limit of 4 MB with no resumable upload path; no retry logic on upload failures; `console.log/warn` used instead of structured logger
3. **GHL**  -  No token refresh path implemented; import run has no job-queue integration; no per-record idempotency during import
4. **Clio**  -  Same token refresh gap as GHL; no job-queue integration for import runs; no deduplication key on import rows
5. **Stripe**  -  No idempotency check (event ID not stored); no dead-letter handling for permanently failed events; `stripe_webhook_secret` misconfiguration silently results in all events being rejected
6. **Notification Engine**  -  Push notification delivery is a placeholder; no retry for failed in-app or email channel deliveries; no per-event deduplication
