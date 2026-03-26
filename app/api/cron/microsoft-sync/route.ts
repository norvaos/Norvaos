import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  syncCalendarPull,
  syncCalendarPush,
  syncTasksPull,
  syncTasksPush,
} from '@/lib/services/microsoft-sync'
import { syncInboundEmails } from '@/lib/services/email-sync'
import { associateEmailToMatter } from '@/lib/services/email-association'
import { renewSubscription } from '@/lib/services/microsoft-webhooks'

const MAX_ERROR_COUNT = 10

/**
 * POST /api/cron/microsoft-sync
 *
 * Background worker for syncing all active Microsoft connections
 * and email accounts. Designed to be called by Vercel Cron (every
 * 15 minutes) or manually.
 */
async function handlePost(request: Request) {
  // Auth check — fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const stats = {
    processed: 0,
    calendarSynced: 0,
    tasksSynced: 0,
    emailsSynced: 0,
    emailsCreated: 0,
    subscriptionsRenewed: 0,
    errors: 0,
  }

  try {
    // ── 1. Calendar & Tasks sync (existing) ─────────────────────────────────
    const { data: connections } = await admin
      .from('microsoft_connections')
      .select('id, user_id, tenant_id, calendar_sync_enabled, tasks_sync_enabled, error_count')
      .eq('is_active', true)
      .lt('error_count', MAX_ERROR_COUNT)
      .or('calendar_sync_enabled.eq.true,tasks_sync_enabled.eq.true')

    if (connections && connections.length > 0) {
      for (const conn of connections) {
        try {
          stats.processed++

          if (conn.calendar_sync_enabled) {
            await syncCalendarPull(conn.id, admin)
            await syncCalendarPush(conn.id, admin)
            stats.calendarSynced++
          }

          if (conn.tasks_sync_enabled) {
            await syncTasksPull(conn.id, admin)
            await syncTasksPush(conn.id, admin)
            stats.tasksSynced++
          }

          // Reset error count on success
          await admin
            .from('microsoft_connections')
            .update({ error_count: 0, updated_at: new Date().toISOString() })
            .eq('id', conn.id)
        } catch (err) {
          stats.errors++
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[cron/microsoft-sync] Error for connection ${conn.id}:`, errorMessage)

          // Increment error count
          await admin
            .from('microsoft_connections')
            .update({
              error_count: conn.error_count + 1,
              last_error: errorMessage,
              last_error_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id)
        }
      }
    }

    // ── 2. Email sync ───────────────────────────────────────────────────────
    const { data: emailAccounts } = await admin
      .from('email_accounts')
      .select('id, error_count')
      .eq('is_active', true)
      .eq('sync_enabled', true)
      .lt('error_count', MAX_ERROR_COUNT)

    if (emailAccounts && emailAccounts.length > 0) {
      for (const acct of emailAccounts) {
        try {
          const syncResult = await syncInboundEmails(admin, acct.id)
          stats.emailsSynced++
          stats.emailsCreated += syncResult.created

          if (syncResult.errors.length > 0) {
            console.warn(
              `[cron/microsoft-sync] Email sync for ${acct.id}: ${syncResult.errors.length} message-level errors`
            )
          }
        } catch (err) {
          stats.errors++
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[cron/microsoft-sync] Email sync error for ${acct.id}:`, errorMessage)
        }
      }

      // ── 3. Auto-associate newly synced threads ────────────────────────────
      // Find threads without a matter association that were updated recently
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data: unassociatedThreads } = await admin
        .from('email_threads')
        .select('id')
        .is('matter_id', null)
        .gte('updated_at', fiveMinutesAgo)
        .limit(50)

      if (unassociatedThreads && unassociatedThreads.length > 0) {
        for (const thread of unassociatedThreads) {
          try {
            await associateEmailToMatter(admin, thread.id)
          } catch {
            // Non-blocking — association failures should not stop the cron
          }
        }
      }
    }

    // ── 4. Webhook subscription renewal ───────────────────────────────────
    const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: expiringSubscriptions } = await (admin as any)
      .from('graph_webhook_subscriptions')
      .select('id, connection_id, graph_subscription_id')
      .eq('is_active', true)
      .lt('expiration_datetime', twentyFourHoursFromNow)

    if (expiringSubscriptions && expiringSubscriptions.length > 0) {
      for (const sub of expiringSubscriptions) {
        try {
          await renewSubscription(sub.graph_subscription_id, sub.connection_id, admin)
          stats.subscriptionsRenewed++
        } catch (err) {
          stats.errors++
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          console.error(
            `[cron/microsoft-sync] Webhook renewal failed for subscription ${sub.graph_subscription_id}:`,
            errorMessage
          )
        }
      }
    }

    return NextResponse.json({ message: 'Sync complete', stats })
  } catch (error) {
    console.error('[cron/microsoft-sync] Fatal error:', error)
    return NextResponse.json({ error: 'Sync cron failed', stats }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/microsoft-sync')
