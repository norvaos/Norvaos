/**
 * Server-side push notification delivery via web-push (VAPID).
 *
 * Reads VAPID keys from environment and sends payloads to stored
 * push subscription endpoints. Gracefully handles missing config.
 */

import webpush from 'web-push'
import { log } from '@/lib/utils/logger'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@norvaos.com'

let initialized = false

function ensureVapid(): boolean {
  if (initialized) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  initialized = true
  return true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
  entityType?: string
  entityId?: string
  priority?: string
}

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Send a push notification to a list of subscription tokens.
 *
 * @returns Number of successfully sent notifications.
 */
export async function sendPushNotification(
  subscriptions: PushSubscriptionData[],
  payload: PushPayload,
): Promise<number> {
  if (!ensureVapid()) {
    log.debug('Push notification skipped  -  VAPID keys not configured')
    return 0
  }

  if (subscriptions.length === 0) return 0

  const body = JSON.stringify(payload)
  let sent = 0

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          body,
          { TTL: 60 * 60 } // 1 hour
        )
        .then(() => {
          sent++
        })
    )
  )

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    log.warn('Push notification partial failure', {
      total: subscriptions.length,
      sent,
      failed: failures.length,
    })
  }

  return sent
}
