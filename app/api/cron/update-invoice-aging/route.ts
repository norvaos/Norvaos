import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'
import type { AgingBucket } from '@/lib/types/database'

/**
 * POST /api/cron/update-invoice-aging
 *
 * Daily job that recomputes the aging_bucket column on all unpaid invoices.
 * When an invoice crosses into a new bucket, auto-inserts a collection_actions
 * row of type 'reminder_sent' (if none sent in the last 7 days).
 *
 * Designed to be called by Vercel Cron (daily) or manually.
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
  const stats = { updated: 0, reminders_sent: 0 }

  try {
    // Fetch all unpaid invoices across all tenants
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, tenant_id, matter_id, due_date, aging_bucket')
      .not('status', 'in', '("paid","cancelled","draft")')

    if (invErr) {
      log.error('[cron/update-invoice-aging] Failed to fetch invoices', { error_code: invErr.code })
      return NextResponse.json(
        { error: `Failed to fetch invoices: ${invErr.message}` },
        { status: 500 }
      )
    }

    if (!invoices || invoices.length === 0) {
      log.info('[cron/update-invoice-aging] No unpaid invoices found')
      return NextResponse.json({
        success: true,
        processedAt: todayStr,
        stats,
      })
    }

    // Seven days ago for reminder dedup check
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()

    for (const invoice of invoices) {
      const dueDate = new Date(invoice.due_date ?? '')
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Compute new aging bucket
      let newBucket: AgingBucket
      if (daysOverdue <= 30) {
        newBucket = 'current'
      } else if (daysOverdue <= 60) {
        newBucket = '31_60'
      } else if (daysOverdue <= 90) {
        newBucket = '61_90'
      } else if (daysOverdue <= 120) {
        newBucket = '91_120'
      } else {
        newBucket = '120_plus'
      }

      const bucketChanged = invoice.aging_bucket !== newBucket

      // Update the invoice aging fields
      const { error: updateErr } = await supabase
        .from('invoices')
        .update({
          aging_bucket: newBucket,
          aging_updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      if (updateErr) {
        log.error('[cron/update-invoice-aging] Failed to update invoice', {
          invoice_id: invoice.id,
          error_code: updateErr.code,
        })
        continue
      }

      stats.updated++

      // Auto-send reminder if bucket changed
      if (bucketChanged) {
        try {
          // Check if a reminder was sent in the last 7 days for this invoice
          const { data: recentReminders, error: reminderCheckErr } = await supabase
            .from('collection_actions')
            .select('id')
            .eq('invoice_id', invoice.id)
            .eq('action_type', 'reminder_sent')
            .gte('performed_at', sevenDaysAgoStr)
            .limit(1)

          if (reminderCheckErr) {
            log.error('[cron/update-invoice-aging] Failed to check recent reminders', {
              invoice_id: invoice.id,
              error_code: reminderCheckErr.code,
            })
            continue
          }

          // Only insert if no recent reminder exists
          if (!recentReminders || recentReminders.length === 0) {
            const { error: insertErr } = await supabase
              .from('collection_actions')
              .insert({
                tenant_id: invoice.tenant_id,
                invoice_id: invoice.id,
                matter_id: invoice.matter_id,
                action_type: 'reminder_sent' as const,
                performed_by: 'system',
                performed_at: new Date().toISOString(),
                notes: `[System] Aging bucket changed to ${newBucket}. Automatic reminder generated.`,
              })

            if (insertErr) {
              log.error('[cron/update-invoice-aging] Failed to insert collection action', {
                invoice_id: invoice.id,
                error_code: insertErr.code,
              })
              continue
            }

            stats.reminders_sent++
          }
        } catch (err) {
          log.error('[cron/update-invoice-aging] Reminder processing error', {
            invoice_id: invoice.id,
            error: String(err),
          })
        }
      }
    }

    log.info('[cron/update-invoice-aging] Completed', {
      updated: stats.updated,
      reminders_sent: stats.reminders_sent,
    })

    return NextResponse.json({
      success: true,
      processedAt: todayStr,
      stats,
    })
  } catch (error) {
    console.error('Invoice aging cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/update-invoice-aging')
