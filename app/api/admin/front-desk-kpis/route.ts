import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildKpiValues } from '@/lib/services/front-desk-kpis'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/front-desk-kpis?date=YYYY-MM-DD&userId=X (optional)
 *
 * Admin endpoint — returns KPI summaries for all front desk users on a given date.
 * If userId is provided, returns only that user's KPIs.
 * Requires Admin role.
 */

type AdminRpc = { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    // Verify admin role
    const { data: userData } = await admin
      .from('users')
      .select('role_id')
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    let isAdmin = false
    if (userData?.role_id) {
      const { data: role } = await admin
        .from('roles')
        .select('name')
        .eq('id', userData.role_id)
        .single()
      isAdmin = role?.name === 'Admin'
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
    const filterUserId = searchParams.get('userId')

    const rpc = admin as unknown as AdminRpc

    // Get all front desk shifts for the date
    const { data: rawShifts, error: shiftsErr } = await (admin
      .from('front_desk_shifts' as any)
      .select('id, user_id, started_at, ended_at, ended_reason, shift_date') as any)
      .eq('tenant_id', auth.tenantId)
      .eq('shift_date', date)
      .order('started_at', { ascending: true })

    if (shiftsErr) {
      return NextResponse.json({ error: shiftsErr.message }, { status: 500 })
    }

    type ShiftRow = {
      id: string
      user_id: string
      started_at: string
      ended_at: string | null
      ended_reason: string | null
      shift_date: string
    }

    const shifts = (rawShifts ?? []) as ShiftRow[]

    // Get unique user IDs
    const userIds = [...new Set(shifts.map((s) => s.user_id))]
      .filter((uid) => !filterUserId || uid === filterUserId)

    if (userIds.length === 0) {
      return NextResponse.json({
        date,
        users: [],
        totalShifts: 0,
      })
    }

    // Batch resolve user names
    const { data: users } = await admin
      .from('users')
      .select('id, first_name, last_name')
      .in('id', userIds)

    const userMap = Object.fromEntries(
      (users ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
    )

    // Compute KPIs per user (day aggregate)
    const results = await Promise.all(
      userIds.map(async (uid) => {
        const dayKpisRes = await rpc.rpc('compute_day_kpis', {
          p_user_id: uid,
          p_date: date,
        })

        const rawDay = (dayKpisRes.data ?? {}) as Record<string, number | null>
        const kpis = buildKpiValues(rawDay)
        const userShifts = shifts.filter((s) => s.user_id === uid)

        return {
          userId: uid,
          userName: userMap[uid] ?? 'Unknown',
          shiftCount: userShifts.length,
          shifts: userShifts.map((s) => ({
            id: s.id,
            startedAt: s.started_at,
            endedAt: s.ended_at,
            endedReason: s.ended_reason,
          })),
          kpis,
          raw: rawDay,
        }
      })
    )

    return NextResponse.json({
      date,
      users: results,
      totalShifts: shifts.length,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[admin/front-desk-kpis] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/front-desk-kpis')
