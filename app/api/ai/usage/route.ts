/**
 * GET /api/ai/usage
 *
 * AI Usage Dashboard API (Directive 036):
 * Returns real-time AI cost data so the Principal can see spend.
 *
 * Query params:
 *  - period: 'day' | 'week' | 'month' (default: 'month')
 *
 * Returns: breakdown by model, by task, daily trend, quota status
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest()
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') ?? 'month') as 'day' | 'week' | 'month'

    const admin = createAdminClient()

    // Calculate date range
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'day':
        startDate = new Date(now)
        startDate.setHours(0, 0, 0, 0)
        break
      case 'week':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 7)
        break
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
    }

    // Fetch all interactions in range
    const { data: interactions, error } = await admin
      .from('ai_interactions')
      .select('interaction_type, model_used, cost_cents, tokens_input, tokens_output, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) throw error

    const rows = interactions ?? []

    // Aggregate by model
    const byModel: Record<string, { calls: number; costCents: number; tokensIn: number; tokensOut: number }> = {}
    for (const row of rows) {
      const model = row.model_used ?? 'unknown'
      if (!byModel[model]) byModel[model] = { calls: 0, costCents: 0, tokensIn: 0, tokensOut: 0 }
      byModel[model].calls++
      byModel[model].costCents += row.cost_cents ?? 0
      byModel[model].tokensIn += row.tokens_input ?? 0
      byModel[model].tokensOut += row.tokens_output ?? 0
    }

    // Aggregate by task
    const byTask: Record<string, { calls: number; costCents: number }> = {}
    for (const row of rows) {
      const task = row.interaction_type ?? 'unknown'
      if (!byTask[task]) byTask[task] = { calls: 0, costCents: 0 }
      byTask[task].calls++
      byTask[task].costCents += row.cost_cents ?? 0
    }

    // Daily trend
    const dailyTrend: Record<string, { calls: number; costCents: number }> = {}
    for (const row of rows) {
      const day = (row.created_at ?? '').slice(0, 10)
      if (!dailyTrend[day]) dailyTrend[day] = { calls: 0, costCents: 0 }
      dailyTrend[day].calls++
      dailyTrend[day].costCents += row.cost_cents ?? 0
    }

    // Quota info
    const { data: tenant } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', auth.tenantId)
      .single()

    const quotaCents = (tenant?.settings as Record<string, unknown>)?.ai_monthly_quota_cents as number ?? 5000
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // If period isn't month, recalculate monthly spend for quota
    let monthlySpent = 0
    if (period === 'month') {
      monthlySpent = rows.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0)
    } else {
      const { data: monthRows } = await admin
        .from('ai_interactions')
        .select('cost_cents')
        .eq('tenant_id', auth.tenantId)
        .gte('created_at', monthStart.toISOString())

      monthlySpent = (monthRows ?? []).reduce((sum, r) => sum + (r.cost_cents ?? 0), 0)
    }

    const totalCostCents = rows.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0)
    const totalCalls = rows.length

    return NextResponse.json({
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      totals: {
        calls: totalCalls,
        costCents: totalCostCents,
        costDollars: (totalCostCents / 100).toFixed(2),
      },
      quota: {
        limitCents: quotaCents,
        limitDollars: (quotaCents / 100).toFixed(2),
        spentCents: monthlySpent,
        spentDollars: (monthlySpent / 100).toFixed(2),
        remainingCents: Math.max(0, quotaCents - monthlySpent),
        percentUsed: Math.min(100, Math.round((monthlySpent / quotaCents) * 100)),
      },
      byModel: Object.entries(byModel).map(([model, stats]) => ({
        model,
        ...stats,
        costDollars: (stats.costCents / 100).toFixed(2),
      })),
      byTask: Object.entries(byTask).map(([task, stats]) => ({
        task,
        ...stats,
        costDollars: (stats.costCents / 100).toFixed(2),
      })),
      dailyTrend: Object.entries(dailyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => ({
          date,
          ...stats,
          costDollars: (stats.costCents / 100).toFixed(2),
        })),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    console.error('[AI Usage] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch usage data' },
      { status: 500 },
    )
  }
}
