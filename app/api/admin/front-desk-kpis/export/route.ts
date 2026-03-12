import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildKpiValues, KPI_DEFINITIONS } from '@/lib/services/front-desk-kpis'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/front-desk-kpis/export?date=YYYY-MM-DD
 *
 * CSV export of front desk KPIs for admin dashboard.
 * Returns a downloadable CSV file.
 */

type AdminRpc = { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()
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

    const rpc = admin as unknown as AdminRpc

    // Get all front desk shifts for the date
    const { data: rawShifts } = await (admin
      .from('front_desk_shifts' as any)
      .select('id, user_id, started_at, ended_at, shift_date') as any)
      .eq('tenant_id', auth.tenantId)
      .eq('shift_date', date)
      .order('started_at', { ascending: true })

    type ShiftRow = { id: string; user_id: string; started_at: string; ended_at: string | null; shift_date: string }
    const shifts = (rawShifts ?? []) as ShiftRow[]
    const userIds = [...new Set(shifts.map((s) => s.user_id))]

    if (userIds.length === 0) {
      const headers = ['User', ...KPI_DEFINITIONS.map((d) => d.label)].join(',')
      return new Response(headers + '\n', {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="front-desk-kpis-${date}.csv"`,
        },
      })
    }

    // Resolve names
    const { data: users } = await admin
      .from('users')
      .select('id, first_name, last_name')
      .in('id', userIds)

    const userMap = Object.fromEntries(
      (users ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
    )

    // Build CSV
    const headers = ['User', 'Shift Count', ...KPI_DEFINITIONS.map((d) => d.label)].join(',')
    const rows: string[] = []

    for (const uid of userIds) {
      const dayKpisRes = await rpc.rpc('compute_day_kpis', { p_user_id: uid, p_date: date })
      const rawDay = (dayKpisRes.data ?? {}) as Record<string, number | null>
      const kpis = buildKpiValues(rawDay)
      const shiftCount = shifts.filter((s) => s.user_id === uid).length

      const kpiValues = KPI_DEFINITIONS.map((def) => {
        const kpi = kpis.find((k) => k.key === def.key)
        return kpi?.value != null ? String(kpi.value) : ''
      })

      const row = [
        `"${userMap[uid] ?? 'Unknown'}"`,
        String(shiftCount),
        ...kpiValues,
      ].join(',')

      rows.push(row)
    }

    const csv = [headers, ...rows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="front-desk-kpis-${date}.csv"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[admin/front-desk-kpis/export] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/front-desk-kpis/export')
