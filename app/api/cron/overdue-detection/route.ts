import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { dispatchNotification } from '@/lib/services/notification-engine'

/**
 * POST /api/cron/overdue-detection
 *
 * Daily 6AM UTC. Transitions invoices from sent/viewed → overdue
 * when past due_date. Dispatches high-priority notifications to
 * tenant users for each newly overdue invoice.
 *
 * Idempotent: only transitions invoices not already marked overdue.
 * Uses admin client (service role) to operate across all tenants.
 */
async function handlePost(request: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().split('T')[0]
  const stats = { tenantsProcessed: 0, overdueUpdated: 0, notificationsSent: 0 }

  try {
    // 1. Fetch all tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')

    if (tenantErr || !tenants) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    for (const tenant of tenants) {
      stats.tenantsProcessed++

      // 2. Fetch invoices that should be marked overdue
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date')
        .eq('tenant_id', tenant.id)
        .in('status', ['sent', 'viewed', 'partially_paid'])
        .lt('due_date', todayStr)

      if (invErr || !invoices || invoices.length === 0) continue

      // 3. Batch update to overdue
      const invoiceIds = invoices.map((inv) => inv.id)
      const { error: updateErr } = await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .in('id', invoiceIds)
        .eq('tenant_id', tenant.id)

      if (updateErr) continue

      stats.overdueUpdated += invoices.length

      // 4. Fetch tenant users for notification recipients
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenant.id)

      const adminUserIds = (users ?? []).map((u) => u.id)
      if (adminUserIds.length === 0) continue

      // 5. Dispatch notification for each overdue invoice
      for (const inv of invoices) {
        try {
          await dispatchNotification(supabase, {
            tenantId: tenant.id,
            eventType: 'invoice_overdue',
            recipientUserIds: adminUserIds,
            title: `Invoice ${inv.invoice_number} is overdue`,
            message: `Invoice ${inv.invoice_number} was due on ${inv.due_date}`,
            entityType: 'invoice',
            entityId: inv.id,
            priority: 'high',
          })
          stats.notificationsSent++
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
    console.error('Overdue detection cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/overdue-detection')
