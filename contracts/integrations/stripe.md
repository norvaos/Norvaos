# Integration Contract: Stripe Webhooks

**Integration ID:** `stripe`
**Module:** Team 3 / Module 1
**Status:** Draft — Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `app/api/webhooks/stripe/route.ts`

---

## 1. Integration Purpose and Scope

The Stripe integration receives webhook events from Stripe to manage subscription lifecycle for NorvaOS tenants. It is a pure inbound webhook consumer — NorvaOS does not initiate calls to Stripe from this route. Stripe API calls to retrieve subscription objects are made during event processing.

**Events handled:**

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Updates tenant `stripe_customer_id`, `subscription_tier`, `subscription_status`; upserts `subscriptions` row |
| `customer.subscription.updated` | Updates `tenants.subscription_tier/status`; upserts `subscriptions` row |
| `customer.subscription.deleted` | Sets `tenants.subscription_status = 'cancelled'`; sets `subscriptions.status = 'cancelled'` |
| `invoice.paid` | Records a row in `billing_invoices`; sets `tenants.subscription_status = 'active'` |
| `invoice.payment_failed` | Records a row in `billing_invoices` with `status = 'failed'`; sets `tenants.subscription_status = 'past_due'` |
| All other events | Logged with `console.log('Unhandled event type: ...')` and returns 200 |

**Out of scope:** Stripe Checkout session creation (handled elsewhere in billing UI); refunds; disputes; usage-based billing; trust account payment processing.

---

## 2. Credential Handling

### Webhook Signature Verification

Every incoming webhook request is verified using Stripe's HMAC signature scheme:

```
stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)
```

- The raw request body is read as text (`request.text()`) before any JSON parsing, which is required for signature verification
- If `stripe-signature` header is absent, returns 400 immediately
- If signature verification fails, returns 400 with `'Invalid signature'`
- `STRIPE_WEBHOOK_SECRET` is read from environment at call time; if undefined, `constructEvent` will throw

**IDENTIFIED GAP — Missing env var causes silent 400s:** If `STRIPE_WEBHOOK_SECRET` is not set (`process.env.STRIPE_WEBHOOK_SECRET!` with non-null assertion), signature verification will throw. This will cause all webhook deliveries to return 400, and Stripe will mark the endpoint as failing. There is no startup check or early warning for a missing secret.

### Database Access

The webhook handler uses the Supabase service-role client (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS. This is appropriate for webhook processing that runs outside user authentication context.

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint signing secret from Stripe dashboard |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for RLS bypass |

---

## 3. Retry Behaviour

### Stripe's Built-In Retry

Stripe automatically retries failed webhook deliveries:
- If the endpoint returns a non-2xx status, Stripe retries with exponential backoff over 72 hours
- If the endpoint returns 2xx, Stripe considers the event delivered regardless of what the handler did internally

**Key implication:** If `handlePost` returns 200 after an internal processing error (the `catch` block returns 500, but intermediate operations may succeed partially), Stripe will not retry.

### Internal Retry

There is no internal retry within the handler. Each database operation runs once. If an update fails, the outer `try/catch` returns 500, which causes Stripe to retry the entire event.

**IDENTIFIED GAP — No idempotency guard:** Stripe guarantees at-least-once delivery. The same event may be delivered multiple times (e.g., on network timeout before the 200 is received). There is no stored Stripe event ID (`event.id`) check before processing. Duplicate event processing can result in:
- Duplicate rows in `billing_invoices` (for `invoice.paid` and `invoice.payment_failed`) — the insert has no `onConflict` clause
- Harmless double-updates on `tenants` and `subscriptions` (idempotent by nature since they upsert the same values)

### Stripe API Call Within Handler

`checkout.session.completed` makes a secondary Stripe API call: `stripe.subscriptions.retrieve(subscriptionId)`. If this call fails or times out, the handler catches the error and returns 500, causing Stripe to retry the entire event. The secondary API call is not retried within the handler.

---

## 4. Idempotency Guarantees

### Tenant and Subscription Updates

Updates to `tenants` and upserts to `subscriptions` are naturally idempotent — the same event processed twice produces the same final state.

### Billing Invoice Records

**IDENTIFIED GAP — Non-idempotent invoice insert:** `billing_invoices` uses `.insert()` without `onConflict`. Replaying an `invoice.paid` or `invoice.payment_failed` event will create a duplicate `billing_invoices` row. The table should have a unique constraint on `stripe_invoice_id` and the insert should use `upsert`.

### Tenant Lookup Fallback

For `customer.subscription.updated`, if `metadata.tenant_id` is not present on the subscription, the handler falls back to looking up the tenant by `stripe_customer_id`. This is a resilience mechanism for events where metadata is not propagated.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | HTTP Response | Stripe Behaviour |
|---|---|---|
| Missing `stripe-signature` header | 400 | Stripe retries |
| Invalid signature | 400 | Stripe retries |
| `STRIPE_WEBHOOK_SECRET` not set | 400 (constructEvent throws) | Stripe retries |
| Missing `tenant_id` in `checkout.session.completed` | Logs error; `break` (returns 200) | Stripe does NOT retry — event is consumed |
| No tenant found for Stripe customer | Logs error; `break` (returns 200) | Stripe does NOT retry — event is consumed |
| Database update fails | 500 | Stripe retries |
| `stripe.subscriptions.retrieve` fails | 500 | Stripe retries |
| Unknown event type | Logs; returns 200 | Stripe does NOT retry |

**IDENTIFIED GAP — Silent consumption on missing tenant:** If `tenant_id` is absent from checkout session metadata, or if no tenant is found for a customer ID, the handler logs an error and breaks out of the switch, ultimately returning `{ received: true }` with status 200. This permanently acknowledges the event — Stripe will not re-deliver it. There is no dead-letter queue, alert, or compensating action. Revenue-impacting events can be silently lost.

---

## 6. Observability

### Logging

The Stripe webhook handler uses `console.log`, `console.error` directly — not the structured `log` utility.

Specific log points:
- `'Webhook signature verification failed: {message}'` — `console.error` on bad signature
- `'No tenant_id in checkout session metadata'` — `console.error`
- `'No tenant found for Stripe customer: {customer}'` — `console.error`
- `'Checkout completed for tenant {id}, plan: {tier}'` — `console.log`
- `'Subscription updated for tenant {id}: {status}, plan: {tier}'` — `console.log`
- `'Subscription cancelled for tenant {id}'` — `console.log`
- `'Invoice paid for tenant {id}: ${amount}'` — `console.log`
- `'Payment failed for tenant {id}'` — `console.log`
- `'Unhandled event type: {type}'` — `console.log`
- `'Webhook processing error: {error}'` — `console.error` on outer catch

**IDENTIFIED GAP — Unstructured logging:** All webhook logging uses `console.*` without `tenant_id` as a structured field. Log correlation across events for a single tenant is manual.

**IDENTIFIED GAP — No Stripe event ID in logs:** `event.id` (the unique Stripe event identifier) is not included in any log line. This makes it impossible to correlate a log entry with a specific Stripe event when debugging delivery issues.

### Database Audit Trail

- `tenants.subscription_status`, `subscription_tier`, `stripe_customer_id` — updated per subscription event
- `subscriptions` — upserted per subscription event; includes `status`, `billing_interval`, `cancel_at_period_end`, `current_period_start`, `current_period_end`
- `billing_invoices` — inserted per invoice event; includes `stripe_invoice_id`, `amount`, `currency`, `status`, `invoice_url`, `invoice_pdf`, `period_start`, `period_end`

**IDENTIFIED GAP — No webhook event log table:** Stripe event IDs are not stored anywhere. There is no table recording which events have been processed, when, and with what outcome. Debugging replay or identifying missing events requires querying Stripe's dashboard.

---

## 7. Data Classification

| Data | Classification | Stored Where |
|---|---|---|
| Stripe webhook payload | Confidential / financial | In memory only during processing |
| Stripe customer ID | Financial identifier | `tenants.stripe_customer_id` |
| Stripe subscription ID | Financial identifier | `subscriptions.stripe_subscription_id` |
| Invoice amount and currency | Financial | `billing_invoices.amount`, `billing_invoices.currency` |
| Invoice URL and PDF URL | Financial document reference | `billing_invoices.invoice_url`, `invoice_pdf` |
| Plan tier | Business configuration | `tenants.subscription_tier`, `subscriptions.plan_tier` |
| `STRIPE_WEBHOOK_SECRET` | Secret | Environment variable only (never logged or stored) |

---

## 8. Tenant Isolation

Tenant isolation in webhook processing relies on:
1. `checkout.session.completed` — `tenant_id` comes from Stripe session metadata (set during checkout creation elsewhere in the billing flow)
2. `customer.subscription.updated/deleted` — tenant resolved by `stripe_customer_id` lookup in `tenants` table
3. `invoice.paid/failed` — tenant resolved by `stripe_customer_id` lookup in `tenants` table

All database writes use the service-role client but explicitly include `tenant_id` in every write and lookup. This is correct behaviour for webhook processing.

**Risk:** If two tenants somehow share a `stripe_customer_id` (should be impossible in normal operation), the first-matching tenant will receive all subscription updates. There is no defensive check.

---

## 9. Known Limitations

1. **No idempotency on invoice insert:** Duplicate Stripe deliveries will create duplicate `billing_invoices` rows.
2. **Silent event consumption:** Events with missing tenant context are acknowledged (200) and permanently lost.
3. **No event store:** Processed event IDs are not persisted; replay detection is not possible.
4. **Stripe API version handling:** The handler includes a `getSubscriptionPeriod()` helper that handles both new (`current_period.start`) and legacy (`current_period_start`) Stripe API formats. This suggests the codebase has been adapted for API version changes, but the exact version pinned in the Stripe SDK configuration was not audited.
5. **No refund or dispute handling:** Refund and dispute events are unhandled (return 200 after the unhandled-type log).

---

## 10. Acceptance Criteria

- [ ] Valid Stripe webhook event with correct signature is processed and returns 200
- [ ] Event with missing or invalid signature returns 400
- [ ] `checkout.session.completed` correctly sets `subscription_status = 'active'` and `stripe_customer_id` on the tenant
- [ ] `customer.subscription.deleted` sets `subscription_status = 'cancelled'` on both `tenants` and `subscriptions` tables
- [ ] `invoice.paid` creates a `billing_invoices` row with `status = 'paid'`
- [ ] `invoice.payment_failed` sets `tenants.subscription_status = 'past_due'`
- [ ] Replaying the same `checkout.session.completed` event twice does not corrupt tenant state
- [ ] `STRIPE_WEBHOOK_SECRET` misconfiguration produces a clear server-side error, not silent data loss

**GAP items requiring remediation before production:**
- [ ] `billing_invoices` insert changed to upsert with `onConflict: 'stripe_invoice_id'`
- [ ] Stripe event ID logged and ideally stored per processed event
- [ ] Alert or dead-letter mechanism for events with missing tenant context
- [ ] Structured logger (`log.*`) used with `tenant_id` and `event_id` context
- [ ] `STRIPE_WEBHOOK_SECRET` presence checked at startup and surfaced as a health check failure
