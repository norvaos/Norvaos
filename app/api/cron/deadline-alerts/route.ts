import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processAutomationTrigger } from '@/lib/services/automation-engine'
import { calculateDeadlineRiskScore } from '@/lib/utils/deadline-risk-engine'
import { processMultiLayerAlerts } from '@/lib/services/deadline-shield'
import { withTiming } from '@/lib/middleware/request-timing'
import type { Database } from '@/lib/types/database'

type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']

/**
 * POST /api/cron/deadline-alerts
 *
 * Background worker for deadline status updates and alert generation.
 * Designed to be called by Vercel Cron (daily at 8 AM) or manually.
 *
 * Uses admin client (service role) to operate across all tenants.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 */
async function handlePost(request: Request) {
  // Auth check — fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const stats = { tenantsProcessed: 0, overdueUpdated: 0, atRiskUpdated: 0, alertsCreated: 0, criticalEscalations: 0, shield_alerts_24h: 0, shield_alerts_1w: 0, shield_alerts_1m: 0, shield_escalations: 0 }

  try {
    // 1. Fetch all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')

    if (tenantErr || !tenants) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    for (const tenant of tenants) {
      stats.tenantsProcessed++

      // 2. Fetch all non-completed, non-dismissed deadlines for this tenant
      const { data: deadlines, error: dlErr } = await supabase
        .from('matter_deadlines')
        .select('*')
        .eq('tenant_id', tenant.id)
        .not('status', 'in', '("completed","dismissed")')

      if (dlErr || !deadlines) continue

      for (const deadline of deadlines as MatterDeadline[]) {
        const dueDate = new Date(deadline.due_date)
        const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        // 3. Update overdue deadlines
        if (daysUntil < 0 && deadline.status !== 'overdue') {
          await supabase
            .from('matter_deadlines')
            .update({ status: 'overdue' })
            .eq('id', deadline.id)
          stats.overdueUpdated++
        }

        // 4. Update at-risk deadlines (within 7 days)
        if (daysUntil >= 0 && daysUntil <= 7 && deadline.status === 'upcoming') {
          await supabase
            .from('matter_deadlines')
            .update({ status: 'at_risk' })
            .eq('id', deadline.id)
          stats.atRiskUpdated++
        }

        // 5. Calculate risk score for this deadline
        const riskResult = calculateDeadlineRiskScore(deadline, today)
        const riskScore = riskResult.score
        const riskLevel = riskResult.level

        // 6. Check reminder_days and trigger automations (with risk context)
        const reminderDays = deadline.reminder_days ?? [30, 14, 7, 3, 1]
        if (daysUntil >= 0 && reminderDays.includes(daysUntil)) {
          try {
            await processAutomationTrigger({
              supabase,
              tenantId: tenant.id,
              matterId: deadline.matter_id,
              triggerType: 'deadline_approaching',
              triggerContext: {
                deadline_id: deadline.id,
                deadline_type: deadline.deadline_type,
                deadline_title: deadline.title,
                due_date: deadline.due_date,
                days_before: daysUntil,
                risk_score: riskScore,
                risk_level: riskLevel,
              },
              userId: 'system',
            })
            stats.alertsCreated++
          } catch {
            // Don't block processing of other deadlines
          }
        }

        // 7. Critical escalation: fire separate trigger for high-risk deadlines
        if (riskScore > 80) {
          try {
            await processAutomationTrigger({
              supabase,
              tenantId: tenant.id,
              matterId: deadline.matter_id,
              triggerType: 'deadline_critical',
              triggerContext: {
                deadline_id: deadline.id,
                deadline_type: deadline.deadline_type,
                deadline_title: deadline.title,
                due_date: deadline.due_date,
                days_before: daysUntil,
                risk_score: riskScore,
                risk_level: riskLevel,
              },
              userId: 'system',
            })
            stats.criticalEscalations++
          } catch {
            // Don't block processing of other deadlines
          }
        }
      }
    }

    // ── Deadline Shield: Multi-Layer Alert Enforcement ──────────────────
    // Process shielded deadline alerts (24h, 1w, 1m, escalation) for each tenant.
    for (const tenant of tenants) {
      try {
        const shieldResult = await processMultiLayerAlerts(tenant.id)
        if (shieldResult.success && shieldResult.data) {
          stats.shield_alerts_24h += shieldResult.data.alerts_24h
          stats.shield_alerts_1w += shieldResult.data.alerts_1w
          stats.shield_alerts_1m += shieldResult.data.alerts_1m
          stats.shield_escalations += shieldResult.data.escalations
        }
      } catch {
        // Don't block processing of other tenants
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: todayStr,
      stats,
    })
  } catch (error) {
    console.error('Deadline alert cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/deadline-alerts')
