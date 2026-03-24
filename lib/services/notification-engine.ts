/**
 * Unified notification dispatch engine.
 *
 * Provides a single entry point — `dispatchNotification(event)` — that:
 *   1. Reads tenant-level notification triggers from `tenants.settings`
 *   2. Checks each recipient's `users.notification_prefs` for opt-out
 *   3. Fans out to enabled channels: in_app, email, push
 *
 * Non-blocking: never throws, all errors are logged via structured logger.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationEvent {
  tenantId: string
  eventType: string
  recipientUserIds: string[]
  title: string
  message?: string
  entityType?: string
  entityId?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  metadata?: Record<string, unknown>
}

interface ChannelConfig {
  in_app?: boolean
  email?: boolean
  push?: boolean
}

interface UserPrefs {
  email_notifications?: boolean
  push_notifications?: boolean
  task_reminders?: boolean
  lead_assignments?: boolean
  document_updates?: boolean
}

// Default channel config when tenant hasn't configured triggers
const DEFAULT_TRIGGERS: Record<string, ChannelConfig> = {
  stage_change:         { in_app: true, email: true,  push: false },
  task_assigned:        { in_app: true, email: true,  push: true  },
  task_completed:       { in_app: true, email: false, push: false },
  document_uploaded:    { in_app: true, email: true,  push: false },
  new_message:          { in_app: true, email: true,  push: true  },
  deadline_approaching: { in_app: true, email: true,  push: true  },
  matter_updated:       { in_app: true, email: false, push: false },
  invoice_sent:          { in_app: true, email: false, push: false },
  invoice_overdue:       { in_app: true, email: true,  push: false },
  payment_received:      { in_app: true, email: false, push: false },
  payment_plan_created:  { in_app: true, email: false, push: false },
  write_off_approved:    { in_app: true, email: true,  push: false },
}

// ─── Core Dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch a notification event to all recipients across configured channels.
 *
 * @param supabase - Admin or authenticated Supabase client
 * @param event - The notification event to dispatch
 */
export async function dispatchNotification(
  supabase: SupabaseClient<Database>,
  event: NotificationEvent,
): Promise<void> {
  try {
    if (event.recipientUserIds.length === 0) return

    // 1. Fetch tenant notification triggers
    const channelConfig = await getTenantChannelConfig(supabase, event.tenantId, event.eventType)

    // If all channels disabled for this event type, skip
    if (!channelConfig.in_app && !channelConfig.email && !channelConfig.push) {
      log.debug('Notification skipped — all channels disabled for event', {
        tenant_id: event.tenantId,
        event_type: event.eventType,
      })
      return
    }

    // 2. Fetch user preferences for all recipients
    // IMPORTANT: Always scope by tenant_id to prevent cross-tenant data leaks,
    // especially when this function is called from cron jobs using the admin client.
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, notification_prefs, device_tokens')
      .eq('tenant_id', event.tenantId)
      .in('id', event.recipientUserIds)

    if (!users || users.length === 0) return

    // 3. Fan out to channels
    const promises: Promise<void>[] = []

    for (const user of users) {
      const prefs = (user.notification_prefs as UserPrefs | null) ?? {}

      // In-app notification
      if (channelConfig.in_app) {
        promises.push(
          deliverInApp(supabase, event, user.id),
        )
      }

      // Email notification
      if (channelConfig.email && prefs.email_notifications !== false && user.email) {
        promises.push(
          deliverEmail(supabase, event, user.id, user.email, user.first_name),
        )
      }

      // Push notification (placeholder for Phase 4)
      if (channelConfig.push && prefs.push_notifications !== false) {
        const tokens = (user.device_tokens as Array<{ platform: string; token: string }> | null) ?? []
        if (tokens.length > 0) {
          promises.push(
            deliverPush(event, tokens),
          )
        }
      }
    }

    await Promise.allSettled(promises)

    log.info('Notification dispatched', {
      tenant_id: event.tenantId,
      event_type: event.eventType,
      recipient_count: event.recipientUserIds.length,
      channels: Object.entries(channelConfig)
        .filter(([, enabled]) => enabled)
        .map(([ch]) => ch)
        .join(','),
    })
  } catch (err) {
    log.error('Notification dispatch failed', {
      tenant_id: event.tenantId,
      event_type: event.eventType,
      error_code: 'NOTIFICATION_DISPATCH_ERROR',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

// ─── Channel Delivery ───────────────────────────────────────────────────────

async function deliverInApp(
  supabase: SupabaseClient<Database>,
  event: NotificationEvent,
  userId: string,
): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      tenant_id: event.tenantId,
      user_id: userId,
      title: event.title,
      message: event.message ?? null,
      notification_type: event.eventType,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      channels: ['in_app'],
      priority: event.priority ?? 'normal',
    })
  } catch (err) {
    log.error('In-app notification failed', {
      tenant_id: event.tenantId,
      user_id: userId,
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
  }
}

async function deliverEmail(
  supabase: SupabaseClient<Database>,
  event: NotificationEvent,
  userId: string,
  email: string,
  firstName: string | null,
): Promise<void> {
  try {
    // Lazy import to avoid circular dependencies
    const { sendInternalEmail } = await import('@/lib/services/email-service')
    await sendInternalEmail({
      supabase,
      tenantId: event.tenantId,
      recipientEmail: email,
      recipientName: firstName ?? 'Team Member',
      title: event.title,
      message: event.message ?? '',
      entityType: event.entityType,
      entityId: event.entityId,
    })
  } catch (err) {
    log.error('Email notification failed', {
      tenant_id: event.tenantId,
      user_id: userId,
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
  }
}

async function deliverPush(
  event: NotificationEvent,
  tokens: Array<{ platform: string; token: string; endpoint?: string; keys?: { p256dh: string; auth: string } }>,
): Promise<void> {
  try {
    const { sendPushNotification } = await import('@/lib/services/push-service')
    type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }

    // Filter to web push subscriptions with endpoint + keys
    const webSubs: Sub[] = tokens
      .filter((t) => t.platform === 'web' && t.endpoint && t.keys)
      .map((t) => ({
        endpoint: t.endpoint!,
        keys: t.keys!,
      }))

    if (webSubs.length === 0) return

    // Build URL based on entity type
    let url = '/'
    if (event.entityType === 'matter' && event.entityId) {
      url = `/matters/${event.entityId}`
    } else if (event.entityType === 'task') {
      url = '/tasks'
    } else if (event.entityType === 'chat' && event.entityId) {
      url = '/chat'
    }

    await sendPushNotification(webSubs, {
      title: event.title,
      body: event.message,
      url,
      tag: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      priority: event.priority,
    })
  } catch (err) {
    log.error('Push notification failed', {
      tenant_id: event.tenantId,
      event_type: event.eventType,
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getTenantChannelConfig(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  eventType: string,
): Promise<ChannelConfig> {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single()

    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, Json>
      const triggers = settings.notification_triggers as Record<string, ChannelConfig> | undefined
      if (triggers?.[eventType]) {
        return triggers[eventType]
      }
    }
  } catch {
    // Fall through to defaults
  }

  return DEFAULT_TRIGGERS[eventType] ?? { in_app: true, email: false, push: false }
}
