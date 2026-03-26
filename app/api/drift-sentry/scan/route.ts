/**
 * POST /api/drift-sentry/scan
 *
 * Jurisdictional Drift Sentry  -  Scan CanLII for recent case law changes
 * and generate alerts for affected matters.
 *
 * Flow:
 * 1. Auth + tenant validation
 * 2. Scan CanLII databases for recent decisions matching drift keywords
 * 3. Cross-reference with active matters to assess impact
 * 4. Persist alerts to case_law_alerts table
 * 5. Return new alerts
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { scanForDrifts } from '@/lib/services/drift-sentry/alert-scanner'

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    const body = await request.json().catch(() => ({}))
    const { daysBack = 7, databases } = body as {
      daysBack?: number
      databases?: string[]
    }

    // Scan CanLII for drifts
    const alerts = await scanForDrifts({ daysBack, databases })

    if (alerts.length === 0) {
      return NextResponse.json({
        success: true,
        alertCount: 0,
        alerts: [],
        message: 'No jurisdictional drifts detected in the specified period.',
      })
    }

    // Persist alerts to case_law_alerts
    const insertPayload = alerts.map((alert) => ({
      tenant_id: auth.tenantId,
      alert_type: 'case_law_change' as const,
      title: alert.title,
      summary: alert.summary,
      source_url: alert.sourceUrl,
      source_citation: alert.sourceCitation,
      court: alert.court,
      keywords: alert.keywords,
      relevance_score: alert.relevanceScore,
      decision_date: alert.decisionDate || null,
      raw_data: alert.rawData,
      status: 'new' as const,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: savedAlerts, error: insertError } = await (supabase as any)
      .from('case_law_alerts')
      .insert(insertPayload)
      .select('id, title, relevance_score, court, created_at')

    if (insertError) {
      console.error('[Drift Sentry] Failed to persist alerts:', insertError)
    }

    return NextResponse.json({
      success: true,
      alertCount: alerts.length,
      alerts: savedAlerts ?? alerts.map((a) => ({
        title: a.title,
        court: a.court,
        relevanceScore: a.relevanceScore,
      })),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Drift Sentry] Scan error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to scan for jurisdictional drifts' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/drift-sentry/scan
 *
 * List existing case law alerts for the tenant.
 */
export async function GET() {
  try {
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: alerts, error } = await (supabase as any)
      .from('case_law_alerts')
      .select('id, title, summary, source_url, source_citation, court, keywords, relevance_score, status, decision_date, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ alerts })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Drift Sentry] List error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list alerts' },
      { status: 500 },
    )
  }
}
