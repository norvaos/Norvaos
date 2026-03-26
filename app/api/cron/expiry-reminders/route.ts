import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkExpiryReminders } from '@/lib/services/expiry-reminder-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/cron/expiry-reminders
 *
 * Daily cron job for checking contact status record expiries
 * and creating notifications/tasks/emails per expiry_reminder_rules config.
 *
 * Uses admin client (service role) to operate across all tenants.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 *
 * Schedule: Daily at 8 AM (configured in vercel.json or Vercel Cron).
 */
async function handlePost(request: Request) {
  // Auth check  -  fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Fetch all active tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id')
      .eq('status', 'active')

    if (tenantsError || !tenants) {
      return NextResponse.json(
        { error: 'Failed to fetch tenants' },
        { status: 500 }
      )
    }

    const allStats = []

    for (const tenant of tenants) {
      try {
        const stats = await checkExpiryReminders(supabase, tenant.id)
        allStats.push(stats)
      } catch (err) {
        console.error(`[expiry-reminders cron] Tenant ${tenant.id} error:`, err)
        allStats.push({
          tenantId: tenant.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      tenantsProcessed: tenants.length,
      stats: allStats,
    })
  } catch (error) {
    console.error('[expiry-reminders cron] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/expiry-reminders')
