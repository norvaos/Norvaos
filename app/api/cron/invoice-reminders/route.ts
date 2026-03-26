import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { sendReminderEmail } from '@/lib/services/invoice-email-service'

/**
 * POST /api/cron/invoice-reminders
 *
 * Monday 2PM UTC. Sends reminder emails for overdue invoices.
 * Respects milestone days (7, 14, 30, 60, 90) and a minimum
 * 24-hour gap between reminders for idempotency.
 *
 * Uses admin client (service role) to operate across all tenants.
 */
async function handlePost(request: Request) {
  // Auth check  -  fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const REMINDER_DAYS = [7, 14, 30, 60, 90]
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  const stats = { tenantsProcessed: 0, remindersChecked: 0, remindersSent: 0, skippedRecent: 0 }

  try {
    // 1. Fetch all tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name')

    if (tenantErr || !tenants) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    for (const tenant of tenants) {
      stats.tenantsProcessed++

      // 2. Fetch overdue invoices for this tenant
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date, contact_id, last_reminder_at, reminder_count')
        .eq('tenant_id', tenant.id)
        .eq('status', 'overdue')

      if (invErr || !invoices || invoices.length === 0) continue

      for (const invoice of invoices) {
        stats.remindersChecked++

        // 3. Calculate days overdue
        const dueDate = new Date(invoice.due_date ?? '')
        const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

        if (daysOverdue <= 0) continue

        // 4. Determine if reminder should be sent
        const isMilestone = REMINDER_DAYS.includes(daysOverdue)
        const lastReminderAt = invoice.last_reminder_at ? new Date(invoice.last_reminder_at) : null
        const neverReminded = !lastReminderAt
        const lastReminderOverWeekAgo = lastReminderAt
          ? now.getTime() - lastReminderAt.getTime() > SEVEN_DAYS_MS
          : false

        const shouldSend = isMilestone || neverReminded || lastReminderOverWeekAgo

        if (!shouldSend) {
          stats.skippedRecent++
          continue
        }

        // 5. Idempotency: skip if last reminder was within 24 hours
        if (lastReminderAt && now.getTime() - lastReminderAt.getTime() < TWENTY_FOUR_HOURS_MS) {
          stats.skippedRecent++
          continue
        }

        // 6. Validate contact_id exists
        if (!invoice.contact_id) continue

        // 7. Send reminder email via invoice-email-service
        // sendReminderEmail handles: contact lookup, email dispatch, reminder_count update
        try {
          const result = await sendReminderEmail(supabase, invoice.id, tenant.id)

          if (result.success) {
            stats.remindersSent++
          }
        } catch {
          // Don't block processing of other invoices
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: todayStr,
      stats,
    })
  } catch (error) {
    console.error('Invoice reminders cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/invoice-reminders')
