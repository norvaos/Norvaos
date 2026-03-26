import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renewSubscription } from '@/lib/services/microsoft-webhooks'

/**
 * POST /api/cron/webhook-renewal
 *
 * Renews Graph webhook subscriptions expiring within 24 hours.
 * Should run daily via Vercel Cron or external scheduler.
 */
export async function POST(request: Request) {
  // Auth check
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const stats = { renewed: 0, failed: 0, deactivated: 0 }

  try {
    // Find subscriptions expiring within 24 hours
    const expirationThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: expiring } = await (admin as any)
      .from('graph_webhook_subscriptions')
      .select('id, graph_subscription_id, connection_id, error_count')
      .eq('is_active', true)
      .lt('expiration_datetime', expirationThreshold) as { data: { id: string; graph_subscription_id: string; connection_id: string; error_count: number }[] | null }

    if (!expiring || expiring.length === 0) {
      return NextResponse.json({ message: 'No subscriptions to renew', stats })
    }

    for (const sub of expiring) {
      try {
        if (sub.error_count >= 5) {
          // Too many errors — deactivate instead of renewing
          await admin
            .from('graph_webhook_subscriptions')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', sub.id)
          stats.deactivated++
          continue
        }

        await renewSubscription(sub.graph_subscription_id, sub.connection_id, admin)
        stats.renewed++
      } catch (err) {
        stats.failed++
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[webhook-renewal] Failed to renew ${sub.graph_subscription_id}:`, msg)

        await admin
          .from('graph_webhook_subscriptions')
          .update({
            error_count: sub.error_count + 1,
            last_error: msg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id)
      }
    }

    return NextResponse.json({ message: 'Renewal complete', stats })
  } catch (error) {
    console.error('[webhook-renewal] Fatal error:', error)
    return NextResponse.json({ error: 'Webhook renewal failed', stats }, { status: 500 })
  }
}
