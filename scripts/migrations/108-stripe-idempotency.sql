-- Migration 108: Stripe Idempotency Hardening
-- Adds event-level deduplication for Stripe webhooks and a secondary guard
-- on billing_invoices to prevent duplicate paid rows on replay.
--
-- Pre-check result (2026-03-16):
--   SELECT stripe_invoice_id, COUNT(*) FROM billing_invoices
--   WHERE stripe_invoice_id IS NOT NULL
--   GROUP BY stripe_invoice_id HAVING COUNT(*) > 1;
--   Result: 0 rows  -  no duplicates. UNIQUE constraint safe to apply.
--   Total billing_invoices rows: 0.

-- ─── A. stripe_processed_events ──────────────────────────────────────────────
-- Stores one row per processed Stripe event.id.
-- UNIQUE on event_id provides the atomic deduplication guarantee.
-- Webhook handler attempts INSERT; a UNIQUE violation (code 23505) signals
-- the event was already processed and the handler returns deduplicated=true.

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  -- tenant_id is nullable: some events (e.g. checkout.session.completed before
  -- tenant lookup) cannot be attributed to a tenant at insert time.
  tenant_id     UUID,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_processed_events_event_id_key
  ON stripe_processed_events (event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_at
  ON stripe_processed_events (processed_at DESC);

COMMENT ON TABLE stripe_processed_events IS
  'Idempotency log for Stripe webhook events. One row per event.id. '
  'Duplicate delivery of the same event_id is detected by UNIQUE violation '
  'on insert and returned as a deduplicated success response.';

-- ─── B. Secondary guard on billing_invoices ──────────────────────────────────
-- Partial UNIQUE index: only one row with status = ''paid'' per stripe_invoice_id.
-- This allows multiple invoice.payment_failed rows for the same Stripe invoice
-- (legitimate: a subscription may fail payment multiple times before succeeding)
-- while guaranteeing duplicate invoice.paid replay cannot create a second paid row.
-- NULL stripe_invoice_id rows are excluded and remain unrestricted.

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_stripe_invoice_paid_key
  ON billing_invoices (stripe_invoice_id)
  WHERE status = 'paid' AND stripe_invoice_id IS NOT NULL;

COMMENT ON INDEX billing_invoices_stripe_invoice_paid_key IS
  'Secondary guard: at most one paid row per Stripe invoice. '
  'Failed-payment rows for the same invoice are permitted. '
  'Primary deduplication is handled by stripe_processed_events.event_id.';
