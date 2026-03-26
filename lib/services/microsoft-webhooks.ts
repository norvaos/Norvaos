import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { graphFetch } from '@/lib/services/microsoft-graph'
import { syncCalendarPull, syncTasksPull } from '@/lib/services/microsoft-sync'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphSubscription {
  id: string
  resource: string
  changeType: string
  clientState: string
  notificationUrl: string
  expirationDateTime: string
}

export interface GraphChangeNotification {
  subscriptionId: string
  clientState: string
  changeType: 'created' | 'updated' | 'deleted'
  resource: string
  resourceData: { id: string; '@odata.type': string }
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum subscription lifetime for drive resources (4230 minutes). */
const MAX_SUBSCRIPTION_LIFETIME_MINUTES = 4230

// ─── Subscription Management ─────────────────────────────────────────────────

/**
 * Create a Microsoft Graph webhook subscription for OneDrive change
 * notifications on the connected user's drive root.
 */
export async function createOneDriveSubscription(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  notificationUrl: string
): Promise<GraphSubscription> {
  const clientState = randomBytes(32).toString('hex')

  const expirationDateTime = new Date(
    Date.now() + MAX_SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
  ).toISOString()

  const subscription = await graphFetch<GraphSubscription>(
    connectionId,
    adminClient,
    'subscriptions',
    {
      method: 'POST',
      body: {
        changeType: 'created,updated,deleted',
        notificationUrl,
        resource: 'me/drive/root',
        expirationDateTime,
        clientState,
      },
    }
  )

  // Persist subscription record in the database
  // Cast: graph_webhook_subscriptions not in generated Database types (Migration 198)
  const { error: dbError } = await (adminClient as any)
    .from('graph_webhook_subscriptions')
    .insert({
      id: subscription.id,
      connection_id: connectionId,
      resource: subscription.resource,
      change_type: subscription.changeType,
      client_state: clientState,
      notification_url: notificationUrl,
      expiration_date_time: subscription.expirationDateTime,
    })

  if (dbError) {
    // Best-effort cleanup: remove the subscription from Graph if DB insert fails
    await graphFetch(connectionId, adminClient, `subscriptions/${subscription.id}`, {
      method: 'DELETE',
    }).catch(() => {
      // Swallow — the Graph subscription will expire on its own
    })
    throw new Error(`Failed to store webhook subscription: ${dbError.message}`)
  }

  return subscription
}

/**
 * Renew an existing Microsoft Graph webhook subscription by extending its
 * expiration to the maximum allowed lifetime.
 */
export async function renewSubscription(
  subscriptionId: string,
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<void> {
  const expirationDateTime = new Date(
    Date.now() + MAX_SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
  ).toISOString()

  await graphFetch(connectionId, adminClient, `subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: { expirationDateTime },
  })

  const { error: dbError } = await (adminClient as any)
    .from('graph_webhook_subscriptions')
    .update({
      expiration_date_time: expirationDateTime,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('connection_id', connectionId)

  if (dbError) {
    throw new Error(`Failed to update subscription expiration in DB: ${dbError.message}`)
  }
}

/**
 * Delete a Microsoft Graph webhook subscription and remove it from the
 * database.
 */
export async function deleteSubscription(
  subscriptionId: string,
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<void> {
  // Delete from Graph API (204 No Content on success)
  await graphFetch(connectionId, adminClient, `subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  })

  const { error: dbError } = await (adminClient as any)
    .from('graph_webhook_subscriptions')
    .delete()
    .eq('id', subscriptionId)
    .eq('connection_id', connectionId)

  if (dbError) {
    throw new Error(`Failed to remove subscription from DB: ${dbError.message}`)
  }
}

// ─── Notification Validation ─────────────────────────────────────────────────

/**
 * Validate an incoming webhook notification.
 *
 * Two scenarios:
 * 1. **Validation request** — Graph sends a `validationToken` query param when
 *    the subscription is first created. Return `{ valid: true }` and echo the
 *    token back as `text/plain`.
 * 2. **Change notification** — Graph sends a POST body with `clientState`.
 *    Verify it matches a known stored secret.
 */
export function validateNotification(
  clientState: string,
  validationToken?: string
): { valid: boolean; subscriptionId?: string } {
  // Validation handshake — Graph is confirming the endpoint exists
  if (validationToken) {
    return { valid: true }
  }

  // For change notifications the clientState must be a non-empty hex string
  // produced by our createOneDriveSubscription function (64 hex chars from 32
  // random bytes). The actual DB lookup is done in processChangeNotification.
  if (!clientState || clientState.length === 0) {
    return { valid: false }
  }

  return { valid: true }
}

// ─── Notification Processing ─────────────────────────────────────────────────

/**
 * Process an inbound Graph change notification by looking up the subscription
 * in the database and triggering an immediate sync for the affected connection.
 */
export async function processChangeNotification(
  notification: GraphChangeNotification,
  adminClient: SupabaseClient<Database>
): Promise<void> {
  // Look up the subscription to find the owning connection and validate clientState
  const { data: subscription, error: lookupError } = await (adminClient as any)
    .from('graph_webhook_subscriptions')
    .select('id, connection_id, client_state, resource')
    .eq('id', notification.subscriptionId)
    .single()

  if (lookupError || !subscription) {
    console.error(
      '[microsoft-webhooks] Unknown subscription:',
      notification.subscriptionId
    )
    return
  }

  // Validate the clientState matches what we stored
  if (subscription.client_state !== notification.clientState) {
    console.error(
      '[microsoft-webhooks] clientState mismatch for subscription:',
      notification.subscriptionId
    )
    return
  }

  const connectionId = subscription.connection_id

  // Determine which sync to trigger based on the resource path
  const resource = notification.resource.toLowerCase()

  try {
    if (resource.includes('drive') || resource.includes('files')) {
      // OneDrive change — calendar and tasks may also need refreshing since
      // the subscription is on the drive root. Trigger both pull syncs.
      await Promise.allSettled([
        syncCalendarPull(connectionId, adminClient),
        syncTasksPull(connectionId, adminClient),
      ])
    } else if (resource.includes('calendar') || resource.includes('events')) {
      await syncCalendarPull(connectionId, adminClient)
    } else if (resource.includes('tasks') || resource.includes('todo')) {
      await syncTasksPull(connectionId, adminClient)
    } else {
      // Fallback: run both syncs
      await Promise.allSettled([
        syncCalendarPull(connectionId, adminClient),
        syncTasksPull(connectionId, adminClient),
      ])
    }
  } catch (syncError) {
    console.error(
      '[microsoft-webhooks] Sync failed for connection:',
      connectionId,
      syncError instanceof Error ? syncError.message : syncError
    )
  }
}
