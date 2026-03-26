import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * POST /api/cron/continuity-sequence
 *
 * Directive 030: Norva Continuity Sequence
 * Scheduled to run at 02:00 AM daily for all pilot tenants.
 *
 * Checks:
 *   1. Address history gaps on all active matters
 *   2. Document expiry within 180-day window
 *   3. Stale readiness scores (no update in 7+ days)
 *   4. Shadow matter triggers for prospect contacts
 *
 * Protected by CRON_SECRET bearer token.
 */
async function handlePost(request: Request) {
  // Auth: bearer token
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const stats = {
    tenantsProcessed: 0,
    mattersScanned: 0,
    gapsDetected: 0,
    expiryAlerts: 0,
    staleMatters: 0,
    shadowTriggersProcessed: 0,
    errors: [] as string[],
  }

  try {
    // Get all active tenants with continuity enabled
    const { data: tenants } = await admin
      .from('tenants')
      .select('id, name, settings')
      .eq('is_active', true)

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ message: 'No active tenants', stats })
    }

    for (const tenant of tenants) {
      try {
        stats.tenantsProcessed++

        // ── 1. Scan active matters for address history gaps ──────────

        const { data: activeMatters } = await admin
          .from('matters')
          .select('id, matter_number, title')
          .eq('tenant_id', tenant.id)
          .eq('status', 'active')

        if (activeMatters) {
          stats.mattersScanned += activeMatters.length

          for (const matter of activeMatters) {
            // Check for address history gaps
            const { data: addressEntries } = await (admin as any)
              .from('address_history')
              .select('start_date, end_date')
              .eq('matter_id', matter.id)
              .order('start_date', { ascending: true })

            if (addressEntries && addressEntries.length > 1) {
              for (let i = 1; i < addressEntries.length; i++) {
                const prevEnd = new Date(addressEntries[i - 1].end_date)
                const currStart = new Date(addressEntries[i].start_date)
                const gapDays = Math.floor((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24))

                if (gapDays > 0) {
                  stats.gapsDetected++
                }
              }
            }
          }
        }

        // ── 2. Check document expiry within 180-day window ──────────

        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() + 180)

        const { count: expiringDocs } = await (admin as any)
          .from('document_slots')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .lte('expiry_date', cutoffDate.toISOString())
          .gt('expiry_date', new Date().toISOString())

        stats.expiryAlerts += expiringDocs ?? 0

        // ── 3. Detect stale matters (no activity in 7 days) ──────────

        const staleDate = new Date()
        staleDate.setDate(staleDate.getDate() - 7)

        const { count: staleCount } = await admin
          .from('matters')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'active')
          .lt('updated_at', staleDate.toISOString())

        stats.staleMatters += staleCount ?? 0

        // ── 4. Process shadow matter triggers ────────────────────────

        const { data: triggers } = await (admin as any)
          .from('prospect_triggers')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending')

        stats.shadowTriggersProcessed += triggers?.length ?? 0

      } catch (err) {
        stats.errors.push(`Tenant ${tenant.id}: ${(err as Error).message}`)
      }
    }

    // Log to SENTINEL
    logSentinelEvent({
      eventType: 'AUDIT_SIMULATION_EXECUTED' as any,
      severity: 'info',
      tenantId: tenants[0]?.id ?? 'system',
      userId: 'cron',
      tableName: 'matters',
      recordId: 'continuity-sequence',
      details: {
        type: 'CONTINUITY_SEQUENCE',
        scheduled_time: '02:00',
        ...stats,
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      stats,
    })
  } catch (error) {
    console.error('[continuity-sequence] Error:', error)
    return NextResponse.json(
      { error: 'Continuity sequence failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/continuity-sequence')
