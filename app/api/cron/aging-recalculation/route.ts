import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/cron/aging-recalculation
 *
 * Daily 4AM UTC. Recalculates aging buckets for all outstanding invoices.
 * Buckets: current, 1-30, 31-60, 61-90, 90+
 * Only updates rows where the bucket has actually changed.
 *
 * Idempotent: same input always produces same output.
 * Uses admin client (service role) to operate across all tenants.
 */

function getAgingBucket(dueDate: string): string {
  const days = Math.ceil((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

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
  const stats = {
    totalChecked: 0,
    bucketsUpdated: 0,
    bucketBreakdown: {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0,
    } as Record<string, number>,
  }

  try {
    // 1. Fetch all outstanding invoices across all tenants
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, tenant_id, due_date, aging_bucket')
      .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ success: true, processedAt: todayStr, stats })
    }

    stats.totalChecked = invoices.length

    for (const invoice of invoices) {
      const newBucket = getAgingBucket(invoice.due_date ?? '')

      // Track breakdown
      stats.bucketBreakdown[newBucket] = (stats.bucketBreakdown[newBucket] ?? 0) + 1

      // 2. Only update if bucket changed
      if (invoice.aging_bucket !== newBucket) {
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({
            aging_bucket: newBucket,
            aging_updated_at: new Date().toISOString(),
          })
          .eq('id', invoice.id)
          .eq('tenant_id', invoice.tenant_id)

        if (!updateErr) {
          stats.bucketsUpdated++
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedAt: todayStr,
      stats,
    })
  } catch (error) {
    console.error('Aging recalculation cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/aging-recalculation')
