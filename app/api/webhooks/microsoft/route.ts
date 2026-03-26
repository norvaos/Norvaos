import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { enqueueJob } from '@/lib/services/job-queue'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChangeNotification {
  subscriptionId: string
  clientState?: string
  changeType: string
  resource: string
  resourceData?: {
    '@odata.type'?: string
    '@odata.id'?: string
    id?: string
  }
  tenantId?: string
  subscriptionExpirationDateTime?: string
}

interface NotificationPayload {
  value: ChangeNotification[]
}

// ─── Debounce cache (in-memory, per-instance) ───────────────────────────────
// Prevents triggering sync for the same connection more than once every 30s.
const recentSyncs = new Map<string, number>()

const DEBOUNCE_MS = 30_000

function shouldDebounce(connectionId: string): boolean {
  const lastSync = recentSyncs.get(connectionId)
  if (lastSync && Date.now() - lastSync < DEBOUNCE_MS) {
    return true
  }
  recentSyncs.set(connectionId, Date.now())

  // Housekeeping: evict stale entries to prevent unbounded growth
  if (recentSyncs.size > 500) {
    const cutoff = Date.now() - DEBOUNCE_MS
    for (const [key, ts] of recentSyncs) {
      if (ts < cutoff) recentSyncs.delete(key)
    }
  }

  return false
}

// ─── GET handler (subscription validation) ──────────────────────────────────

/**
 * GET /api/webhooks/microsoft
 *
 * Microsoft Graph sends a GET request with ?validationToken=xxx when
 * creating or renewing a subscription. We must echo the token back
 * as plain text with 200 status.
 */
async function handleGet(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get('validationToken')

  if (!validationToken) {
    return NextResponse.json(
      { error: 'Missing validationToken query parameter' },
      { status: 400 }
    )
  }

  log.info('[webhook/microsoft] Subscription validation request received', {
    hasToken: true,
  })

  // Return the token as plain text (Graph requirement)
  return new NextResponse(validationToken, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ─── POST handler (change notifications or validation via POST) ─────────────

/**
 * POST /api/webhooks/microsoft
 *
 * Handles two scenarios:
 * 1. Subscription validation  -  Microsoft may POST with ?validationToken=xxx
 * 2. Change notifications  -  JSON body with { value: [...notifications] }
 *
 * MUST return 202 Accepted within 30 seconds (Graph API requirement).
 * Actual sync work is enqueued as a background job.
 */
async function handlePost(request: NextRequest) {
  // ── Scenario 1: Subscription validation via POST ──────────────────────────
  const validationToken = request.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    log.info('[webhook/microsoft] Subscription validation via POST', {
      hasToken: true,
    })
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // ── Scenario 2: Change notifications ──────────────────────────────────────
  let body: NotificationPayload
  try {
    body = await request.json()
  } catch {
    log.warn('[webhook/microsoft] Invalid JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.value || !Array.isArray(body.value) || body.value.length === 0) {
    log.warn('[webhook/microsoft] Empty or malformed notification payload')
    return NextResponse.json({ error: 'No notifications' }, { status: 400 })
  }

  // Respond 202 immediately, then process asynchronously.
  // We use a fire-and-forget pattern: enqueue jobs and return.
  const admin = createAdminClient()
  const processingPromises: Promise<void>[] = []

  for (const notification of body.value) {
    processingPromises.push(
      processNotification(admin, notification).catch((err) => {
        log.error('[webhook/microsoft] Error processing notification', {
          subscriptionId: notification.subscriptionId,
          error: err instanceof Error ? err.message : 'Unknown',
        })
      })
    )
  }

  // Fire-and-forget: don't await  -  return 202 immediately.
  // In serverless, we need to await to avoid premature termination.
  // Use Promise.allSettled so one failure doesn't block others.
  void Promise.allSettled(processingPromises)

  return new NextResponse(null, { status: 202 })
}

// ─── Notification processor ─────────────────────────────────────────────────

async function processNotification(
  admin: ReturnType<typeof createAdminClient>,
  notification: ChangeNotification
): Promise<void> {
  const { subscriptionId, clientState, changeType, resource } = notification

  log.info('[webhook/microsoft] Processing change notification', {
    subscriptionId,
    changeType,
    resource,
  })

  // 1. Look up the subscription in our database
  const { data: subscription, error: subErr } = await (admin as any)
    .from('microsoft_graph_subscriptions')
    .select('id, connection_id, client_state, tenant_id, resource')
    .eq('subscription_id', subscriptionId)
    .eq('is_active', true)
    .maybeSingle()

  if (subErr || !subscription) {
    log.warn('[webhook/microsoft] Unknown subscription, ignoring', {
      subscriptionId,
      error: subErr?.message,
    })
    return
  }

  // 2. Validate clientState to prevent spoofed notifications
  if (subscription.client_state && subscription.client_state !== clientState) {
    log.error('[webhook/microsoft] clientState mismatch  -  possible spoofing', {
      subscriptionId,
      expected: subscription.client_state,
      received: clientState ?? '(none)',
    })

    // Audit log the security event
    await (admin as any).from('webhook_audit_log').insert({
      provider: 'microsoft',
      event_type: 'client_state_mismatch',
      subscription_id: subscriptionId,
      connection_id: subscription.connection_id,
      tenant_id: subscription.tenant_id,
      payload: {
        change_type: changeType,
        resource,
        expected_state: subscription.client_state,
        received_state: clientState ?? null,
      } as any,
      processed: false,
    })

    return
  }

  // 3. Debounce: skip if same connection was synced recently
  if (shouldDebounce(subscription.connection_id)) {
    log.info('[webhook/microsoft] Debounced  -  connection synced recently', {
      connectionId: subscription.connection_id,
      subscriptionId,
    })

    // Still log the event for audit
    await (admin as any).from('webhook_audit_log').insert({
      provider: 'microsoft',
      event_type: 'change_notification',
      subscription_id: subscriptionId,
      connection_id: subscription.connection_id,
      tenant_id: subscription.tenant_id,
      payload: {
        change_type: changeType,
        resource,
        debounced: true,
      } as any,
      processed: false,
    })

    return
  }

  // 4. Audit log the notification
  await (admin as any).from('webhook_audit_log').insert({
    provider: 'microsoft',
    event_type: 'change_notification',
    subscription_id: subscriptionId,
    connection_id: subscription.connection_id,
    tenant_id: subscription.tenant_id,
    payload: {
      change_type: changeType,
      resource,
      resource_data: notification.resourceData ?? null,
    } as any,
    processed: true,
  })

  // 5. Enqueue an immediate sync job for this connection
  await enqueueJob(
    subscription.tenant_id,
    'onedrive_sync',
    {
      connection_id: subscription.connection_id,
      trigger: 'webhook',
      subscription_id: subscriptionId,
      change_type: changeType,
      resource,
    },
    {
      priority: 3, // Higher priority than scheduled cron syncs
      idempotencyKey: `onedrive_webhook_${subscription.connection_id}_${Date.now()}`,
    }
  )

  log.info('[webhook/microsoft] Sync job enqueued', {
    connectionId: subscription.connection_id,
    tenantId: subscription.tenant_id,
    changeType,
  })
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const GET = withTiming(handleGet, 'GET /api/webhooks/microsoft')
export const POST = withTiming(handlePost, 'POST /api/webhooks/microsoft')
