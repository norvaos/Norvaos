/**
 * GET /api/analytics/success-reverb
 *
 * Success-Reverb Ledger (Directive 20.3) — Time-to-Approval Report
 *
 * Compares "Draft-to-Submission" times for matters that used Gold Standard
 * Templates vs. those that did not (legacy Clio workflow).
 *
 * Returns:
 *   - templateMatters: matters using Gold Standard Templates (avg days)
 *   - legacyMatters: matters without templates (avg days)
 *   - improvementPct: percentage reduction in draft-to-submission time
 *   - headline: "Firms using Norva Templates reduced Draft-to-Submission by X%"
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // ── 1. Fetch approved/closed matters with approval timelines ────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matters } = await (admin as any)
      .from('matters')
      .select('id, title, date_opened, closed_at, created_at, status')
      .eq('tenant_id', auth.tenantId)
      .in('status', ['closed_won', 'approved'])

    const allMatters = (matters ?? []) as Array<{
      id: string
      title: string
      date_opened: string | null
      closed_at: string | null
      created_at: string
      status: string
    }>

    // ── 2. Check which matters have Gold Standard Templates ─────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates } = await (admin as any)
      .from('gold_standard_templates')
      .select('source_matter_id')
      .eq('tenant_id', auth.tenantId)

    const templateMatterIds = new Set(
      ((templates ?? []) as Array<{ source_matter_id: string }>)
        .map(t => t.source_matter_id)
    )

    // ── 3. Compute days-to-approval for each group ──────────────────────

    interface MatterTiming {
      matterId: string
      title: string
      daysToApproval: number
      usedTemplate: boolean
    }

    const timings: MatterTiming[] = []

    for (const m of allMatters) {
      const openDate = m.date_opened ?? m.created_at
      const closeDate = m.closed_at
      if (!openDate || !closeDate) continue

      const openMs = new Date(openDate).getTime()
      const closeMs = new Date(closeDate).getTime()
      if (isNaN(openMs) || isNaN(closeMs)) continue

      const days = Math.round((closeMs - openMs) / (1000 * 60 * 60 * 24))
      if (days < 0) continue

      timings.push({
        matterId: m.id,
        title: m.title,
        daysToApproval: days,
        usedTemplate: templateMatterIds.has(m.id),
      })
    }

    const templateTimings = timings.filter(t => t.usedTemplate)
    const legacyTimings = timings.filter(t => !t.usedTemplate)

    const avgTemplate = templateTimings.length > 0
      ? Math.round(templateTimings.reduce((s, t) => s + t.daysToApproval, 0) / templateTimings.length)
      : null

    const avgLegacy = legacyTimings.length > 0
      ? Math.round(legacyTimings.reduce((s, t) => s + t.daysToApproval, 0) / legacyTimings.length)
      : null

    // ── 4. Compute improvement percentage ───────────────────────────────

    let improvementPct: number | null = null
    if (avgTemplate != null && avgLegacy != null && avgLegacy > 0) {
      improvementPct = Math.round(((avgLegacy - avgTemplate) / avgLegacy) * 100)
    }

    // ── 5. Build headline ───────────────────────────────────────────────

    const headline = improvementPct != null && improvementPct > 0
      ? `Firms using Norva Templates reduced their 'Draft-to-Submission' time by ${improvementPct}% compared to their Clio history.`
      : templateTimings.length === 0
        ? 'No matters have used Gold Standard Templates yet. Approve matters to generate templates.'
        : `Average Draft-to-Submission: ${avgTemplate ?? '—'} days (template) vs ${avgLegacy ?? '—'} days (legacy).`

    return NextResponse.json({
      templateMatters: {
        count: templateTimings.length,
        avgDaysToApproval: avgTemplate,
        matters: templateTimings.slice(0, 10),
      },
      legacyMatters: {
        count: legacyTimings.length,
        avgDaysToApproval: avgLegacy,
        matters: legacyTimings.slice(0, 10),
      },
      improvementPct,
      headline,
      totalApprovedMatters: timings.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    console.error('[success-reverb] Report error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    )
  }
}
