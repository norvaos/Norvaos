/**
 * POST /api/cron/auto-reconcile
 *
 * Cron job that runs scheduled auto-reconciliations.
 * Fetches all active reconciliation_schedule rows where next_run_date <= today,
 * runs rpc_auto_reconcile for each, and advances the schedule.
 *
 * Auth: Bearer token matching CRON_SECRET env var.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import type { SupabaseClient } from '@supabase/supabase-js'

function advanceNextRunDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate)
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1)
      break
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + 1)
      break
    default:
      date.setDate(date.getDate() + 1)
  }
  return date.toISOString().split('T')[0]
}

async function handlePost(request: Request) {
  // Auth check  -  fail-closed
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const client = admin as SupabaseClient<any>
  const today = new Date().toISOString().split('T')[0]

  const stats = {
    schedulesChecked: 0,
    reconciliationsRun: 0,
    reconciliationsFailed: 0,
    errors: [] as string[],
  }

  try {
    // Fetch all due schedules
    const { data: schedules, error: schedErr } = await client
      .from('reconciliation_schedule')
      .select('*')
      .lte('next_run_date', today)
      .eq('is_active', true)

    if (schedErr) {
      return NextResponse.json({ error: `Failed to fetch schedules: ${schedErr.message}` }, { status: 500 })
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scheduled reconciliations due',
        processedAt: today,
        stats,
      })
    }

    stats.schedulesChecked = schedules.length

    for (const schedule of schedules) {
      try {
        // Calculate period: from last_run_date (or 30 days ago) to today
        const periodStart = schedule.last_run_date ?? new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString().split('T')[0]
        const periodEnd = today

        // Run auto-reconciliation via RPC
        const { data, error } = await client.rpc('rpc_auto_reconcile', {
          p_tenant_id: schedule.tenant_id,
          p_user_id: 'system-cron',
          p_trust_account_id: schedule.trust_account_id,
          p_period_start: periodStart,
          p_period_end: periodEnd,
        })

        if (error) {
          stats.reconciliationsFailed++
          stats.errors.push(
            `Schedule ${schedule.id} (account ${schedule.trust_account_id}): ${error.message}`,
          )
          continue
        }

        stats.reconciliationsRun++

        // Update schedule: set last_run_date and advance next_run_date
        const nextRun = advanceNextRunDate(schedule.next_run_date, schedule.frequency)

        await client
          .from('reconciliation_schedule')
          .update({
            last_run_date: today,
            next_run_date: nextRun,
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)

      } catch (err) {
        stats.reconciliationsFailed++
        stats.errors.push(
          `Schedule ${schedule.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        )
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: today,
      stats,
    })
  } catch (error) {
    console.error('Auto-reconcile cron error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/auto-reconcile')
