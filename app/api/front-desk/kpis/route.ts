import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildKpiValues } from '@/lib/services/front-desk-kpis'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/front-desk/kpis?shiftId=X
 * GET /api/front-desk/kpis?userId=X&date=YYYY-MM-DD
 *
 * Returns computed KPI values with color thresholds.
 *
 * Mode 1: shiftId — returns KPIs for a single shift
 * Mode 2: userId + date — returns aggregated KPIs across all shifts for that user/date
 */

// Pre-migration: RPC function names aren't in generated DB types yet.
// Use `as any` pattern consistent with the rest of the codebase.
type AdminRpc = { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'front_desk', 'view')

    const { searchParams } = new URL(request.url)
    const shiftId = searchParams.get('shiftId')
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')

    const admin = createAdminClient()
    const rpc = admin as unknown as AdminRpc

    if (shiftId) {
      // ── Mode 1: Single shift KPIs ──
      const [shiftKpisRes, responseTimesRes] = await Promise.all([
        rpc.rpc('compute_shift_kpis', { p_shift_id: shiftId }),
        rpc.rpc('compute_checkin_response_times', { p_shift_id: shiftId }),
      ])

      if (shiftKpisRes.error) {
        log.error('[front-desk/kpis] compute_shift_kpis failed', {
          shift_id: shiftId,
          error_message: shiftKpisRes.error.message,
        })
        return NextResponse.json(
          { error: `KPI computation failed: ${shiftKpisRes.error.message}` },
          { status: 500 }
        )
      }

      const rawKpis = (shiftKpisRes.data ?? {}) as Record<string, number | null>

      // Check for error response from SQL function
      if ('error' in rawKpis) {
        return NextResponse.json(
          { error: rawKpis.error },
          { status: 404 }
        )
      }

      const responseTimes = (responseTimesRes.data ?? null) as {
        avg_minutes: number | null
        p95_minutes: number | null
        count: number
      } | null

      const kpis = buildKpiValues(
        rawKpis,
        responseTimes ?? undefined
      )

      return NextResponse.json({
        mode: 'shift',
        shiftId,
        kpis,
        raw: rawKpis,
        responseTimes,
      })
    }

    if (userId && date) {
      // ── Mode 2: Day aggregate KPIs ──

      // Security: only allow users to view their own KPIs, or admins to view any
      if (userId !== auth.userId) {
        // Check if requester is admin
        const { data: roleData } = await admin
          .from('users')
          .select('role_id')
          .eq('id', auth.userId)
          .eq('tenant_id', auth.tenantId)
          .single()

        let isAdmin = false
        if (roleData?.role_id) {
          const { data: role } = await admin
            .from('roles')
            .select('name')
            .eq('id', roleData.role_id)
            .single()
          isAdmin = role?.name === 'Admin'
        }

        if (!isAdmin) {
          return NextResponse.json(
            { error: 'You can only view your own KPIs' },
            { status: 403 }
          )
        }
      }

      const dayKpisRes = await rpc.rpc('compute_day_kpis', {
        p_user_id: userId,
        p_date: date,
      })

      if (dayKpisRes.error) {
        log.error('[front-desk/kpis] compute_day_kpis failed', {
          user_id: userId,
          date,
          error_message: dayKpisRes.error.message,
        })
        return NextResponse.json(
          { error: `Day KPI computation failed: ${dayKpisRes.error.message}` },
          { status: 500 }
        )
      }

      const rawDay = (dayKpisRes.data ?? {}) as Record<string, number | null>

      // For day aggregates, compute response times across all shifts
      const shiftIds = (rawDay as Record<string, unknown>).shift_ids as string[] | undefined
      let mergedResponseTimes: { avg_minutes: number | null; p95_minutes: number | null } | undefined

      if (shiftIds && shiftIds.length > 0) {
        // Get response times from each shift and average them
        const rtResults = await Promise.all(
          shiftIds.map((sid) =>
            rpc.rpc('compute_checkin_response_times', { p_shift_id: sid })
          )
        )

        let totalAvg = 0
        let totalP95 = 0
        let validCount = 0

        for (const r of rtResults) {
          const data = r.data as { avg_minutes: number | null; p95_minutes: number | null; count: number } | null
          if (data && data.count > 0) {
            totalAvg += data.avg_minutes ?? 0
            totalP95 += data.p95_minutes ?? 0
            validCount++
          }
        }

        if (validCount > 0) {
          mergedResponseTimes = {
            avg_minutes: Math.round((totalAvg / validCount) * 10) / 10,
            p95_minutes: Math.round((totalP95 / validCount) * 10) / 10,
          }
        }
      }

      const kpis = buildKpiValues(rawDay, mergedResponseTimes)

      return NextResponse.json({
        mode: 'day',
        userId,
        date,
        shiftCount: (rawDay as Record<string, unknown>).shift_count ?? 0,
        kpis,
        raw: rawDay,
        responseTimes: mergedResponseTimes ?? null,
      })
    }

    return NextResponse.json(
      { error: 'Provide either shiftId or userId+date query parameters' },
      { status: 400 }
    )
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    log.error('[front-desk/kpis] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/front-desk/kpis')
