import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import {
  DENIAL_SPIKE_THRESHOLD,
  DENIAL_SPIKE_WINDOW_MS,
  ADMIN_ACTION_SPIKE_THRESHOLD,
  ADMIN_ACTION_SPIKE_WINDOW_MS,
} from '@/lib/utils/alerts'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/rate-limit
 *
 * Platform-admin ONLY — rate-limit and denial dashboard for a tenant.
 * Returns time-windowed aggregates from audit_logs.
 */
const handleGet = withPlatformAdmin(async (_request, { params }) => {
  const tenantId = params.id

  const admin = createAdminClient()
  const now = Date.now()

  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Run all count queries in parallel
  const [
    denials1h,
    denials24h,
    denials7d,
    adminActions1h,
    invites24h,
  ] = await Promise.all([
    admin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('action', 'seat_limit_denial')
      .gte('created_at', oneHourAgo),
    admin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('action', 'seat_limit_denial')
      .gte('created_at', oneDayAgo),
    admin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('action', 'seat_limit_denial')
      .gte('created_at', sevenDaysAgo),
    admin
      .from('platform_admin_audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', tenantId)
      .gte('created_at', oneHourAgo),
    admin
      .from('user_invites')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', oneDayAgo),
  ])

  const denialCount1h = denials1h.count ?? 0
  const denialCount24h = denials24h.count ?? 0
  const denialCount7d = denials7d.count ?? 0
  const adminActionCount1h = adminActions1h.count ?? 0
  const inviteCount24h = invites24h.count ?? 0

  return NextResponse.json({
    data: {
      tenant_id: tenantId,
      seat_limit_denials: {
        last_1h: denialCount1h,
        last_24h: denialCount24h,
        last_7d: denialCount7d,
        spike_threshold: DENIAL_SPIKE_THRESHOLD,
        spike_window_minutes: DENIAL_SPIKE_WINDOW_MS / 60_000,
        is_spiking: denialCount1h >= DENIAL_SPIKE_THRESHOLD,
      },
      admin_actions: {
        last_1h: adminActionCount1h,
        spike_threshold: ADMIN_ACTION_SPIKE_THRESHOLD,
        spike_window_minutes: ADMIN_ACTION_SPIKE_WINDOW_MS / 60_000,
        is_spiking: adminActionCount1h >= ADMIN_ACTION_SPIKE_THRESHOLD,
      },
      invite_velocity: {
        last_24h: inviteCount24h,
      },
      evaluated_at: new Date().toISOString(),
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/rate-limit')
