/**
 * GET /api/analytics/conversion — UTM source → revenue attribution
 *
 * Performs a server-side JOIN (via two lean queries) to keep the client
 * payload under 20 columns. Returns aggregated conversion and revenue
 * metrics grouped by UTM source, medium, or campaign.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'analytics', 'view')

    const { tenantId, supabase } = auth
    const { searchParams } = new URL(request.url)

    // Date-range and grouping parameters
    const from = searchParams.get('from') // ISO date
    const to = searchParams.get('to') // ISO date
    const groupBy = (['source', 'medium', 'campaign'] as const).includes(
      searchParams.get('group_by') as any
    )
      ? (searchParams.get('group_by') as 'source' | 'medium' | 'campaign')
      : 'source'

    // ── Query 1: Leads with UTM data (12 columns — lean fragment) ──────────
    let leadsQuery = supabase
      .from('leads')
      .select(
        'id, utm_source, utm_medium, utm_campaign, source, source_detail, lead_source, estimated_value, status, converted_matter_id, converted_at, created_at'
      )
      .eq('tenant_id', tenantId)

    if (from) leadsQuery = leadsQuery.gte('created_at', from)
    if (to) leadsQuery = leadsQuery.lte('created_at', to)

    const { data: leads, error: leadsError } = await leadsQuery

    if (leadsError) {
      return NextResponse.json(
        { success: false, error: leadsError.message },
        { status: 500 }
      )
    }

    // ── Query 2: Matters with revenue data (6 columns — lean fragment) ─────
    // Only fetch matters that correspond to converted leads.
    const convertedMatterIds = (leads ?? [])
      .filter((l) => l.converted_matter_id)
      .map((l) => l.converted_matter_id!)

    const mattersData: Record<
      string,
      {
        total_billed: number | null
        total_paid: number | null
        status: string | null
        billing_type: string | null
        date_opened: string | null
      }
    > = {}

    if (convertedMatterIds.length > 0) {
      // Batch in chunks of 100 to avoid URL length limits
      const chunks: string[][] = []
      for (let i = 0; i < convertedMatterIds.length; i += 100) {
        chunks.push(convertedMatterIds.slice(i, i + 100))
      }

      for (const chunk of chunks) {
        const { data: matters } = await supabase
          .from('matters')
          .select('id, total_billed, total_paid, status, billing_type, date_opened')
          .in('id', chunk)
          .eq('tenant_id', tenantId)

        if (matters) {
          for (const m of matters) {
            mattersData[m.id] = {
              total_billed: m.total_billed,
              total_paid: m.total_paid,
              status: m.status,
              billing_type: m.billing_type,
              date_opened: m.date_opened,
            }
          }
        }
      }
    }

    // ── Aggregate by source/medium/campaign ────────────────────────────────
    const sourceMap = new Map<
      string,
      {
        source: string
        medium: string | null
        campaign: string | null
        totalLeads: number
        convertedLeads: number
        totalBilledCents: number
        totalPaidCents: number
        avgMatterValueCents: number
        estimatedPipelineCents: number
        conversionRate: number
        revenuePerLead: number
      }
    >()

    for (const lead of leads ?? []) {
      const src =
        lead.utm_source || lead.source || lead.lead_source || 'Direct'

      const sourceKey = (() => {
        if (groupBy === 'medium')
          return `${src}|${lead.utm_medium || '(none)'}`
        if (groupBy === 'campaign')
          return `${src}|${lead.utm_campaign || '(none)'}`
        return src
      })()

      if (!sourceMap.has(sourceKey)) {
        sourceMap.set(sourceKey, {
          source: src,
          medium: groupBy === 'medium' ? (lead.utm_medium || null) : null,
          campaign:
            groupBy === 'campaign' ? (lead.utm_campaign || null) : null,
          totalLeads: 0,
          convertedLeads: 0,
          totalBilledCents: 0,
          totalPaidCents: 0,
          avgMatterValueCents: 0,
          estimatedPipelineCents: 0,
          conversionRate: 0,
          revenuePerLead: 0,
        })
      }

      const entry = sourceMap.get(sourceKey)!
      entry.totalLeads++

      // Pipeline value for unconverted leads
      if (!lead.converted_matter_id && lead.estimated_value) {
        entry.estimatedPipelineCents += Math.round(
          lead.estimated_value * 100
        )
      }

      // Revenue attribution for converted leads
      if (lead.converted_matter_id) {
        entry.convertedLeads++
        const matter = mattersData[lead.converted_matter_id]
        if (matter) {
          entry.totalBilledCents += matter.total_billed ?? 0
          entry.totalPaidCents += matter.total_paid ?? 0
        }
      }
    }

    // ── Derived metrics ────────────────────────────────────────────────────
    const rows = Array.from(sourceMap.values()).map((entry) => ({
      ...entry,
      conversionRate:
        entry.totalLeads > 0
          ? Math.round((entry.convertedLeads / entry.totalLeads) * 1000) / 10
          : 0,
      avgMatterValueCents:
        entry.convertedLeads > 0
          ? Math.round(entry.totalBilledCents / entry.convertedLeads)
          : 0,
      revenuePerLead:
        entry.totalLeads > 0
          ? Math.round(entry.totalPaidCents / entry.totalLeads)
          : 0,
    }))

    // Sort by total paid descending (which sources are paying the bills)
    rows.sort((a, b) => b.totalPaidCents - a.totalPaidCents)

    // ── Summary totals ─────────────────────────────────────────────────────
    const summary = {
      totalLeads: rows.reduce((s, r) => s + r.totalLeads, 0),
      totalConverted: rows.reduce((s, r) => s + r.convertedLeads, 0),
      totalBilledCents: rows.reduce((s, r) => s + r.totalBilledCents, 0),
      totalPaidCents: rows.reduce((s, r) => s + r.totalPaidCents, 0),
      totalPipelineCents: rows.reduce(
        (s, r) => s + r.estimatedPipelineCents,
        0
      ),
      overallConversionRate: 0,
      uniqueSources: rows.length,
    }
    summary.overallConversionRate =
      summary.totalLeads > 0
        ? Math.round(
            (summary.totalConverted / summary.totalLeads) * 1000
          ) / 10
        : 0

    return NextResponse.json({
      success: true,
      data: {
        rows,
        summary,
        meta: {
          groupBy,
          from: from ?? null,
          to: to ?? null,
          generatedAt: new Date().toISOString(),
        },
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
