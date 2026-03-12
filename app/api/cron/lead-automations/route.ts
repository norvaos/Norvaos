import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processScheduledLeadAutomations } from '@/lib/services/lead-scheduler'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/cron/lead-automations
 *
 * Background worker for time-based lead automation processing.
 * Designed to be called by Vercel Cron (every 15 minutes) or manually.
 *
 * Iterates all active tenants and processes:
 *   - Consultation reminders
 *   - No-show recovery follow-ups
 *   - Auto-closure of idle leads
 *
 * Uses admin client (service role) to operate across all tenants.
 * All handlers use the idempotency ledger to prevent duplicate execution.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 */
async function handlePost(request: Request) {
  // Auth check for production
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()
  const aggregateStats = {
    tenantsProcessed: 0,
    consultationReminders: 0,
    noShowRecovery: 0,
    autoClosures: 0,
    errors: 0,
  }

  try {
    // Fetch all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')

    if (tenantErr || !tenants) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    for (const tenant of tenants) {
      try {
        const result = await processScheduledLeadAutomations(supabase, tenant.id)
        aggregateStats.tenantsProcessed += result.tenantsProcessed
        aggregateStats.consultationReminders += result.consultationReminders
        aggregateStats.noShowRecovery += result.noShowRecovery
        aggregateStats.autoClosures += result.autoClosures
        aggregateStats.errors += result.errors
      } catch (e) {
        console.error(`[cron/lead-automations] Error processing tenant ${tenant.id}:`, e)
        aggregateStats.errors++
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      stats: aggregateStats,
    })
  } catch (error) {
    console.error('[cron/lead-automations] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/lead-automations')
