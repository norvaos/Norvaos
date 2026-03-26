/**
 * GET /api/invoices/overdue  -  List invoices overdue by more than N days
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // ── billing:view permission check ──────────────────────────────
    const { allowed } = await checkBillingPermission(auth.supabase, auth.userId, auth.tenantId)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'billing:view permission required' },
        { status: 403 },
      )
    }

    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId')
    const minDaysOverdue = parseInt(searchParams.get('minDaysOverdue') ?? '30', 10)

    // Calculate the cutoff date: due_date must be before this to be overdue
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - minDaysOverdue)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

    let query = (admin as any)
      .from('invoices')
      .select('id, invoice_number, matter_id, total_cents, due_date, aging_bucket')
      .eq('tenant_id', auth.tenantId)
      .not('status', 'in', '("paid","cancelled","draft")')
      .lt('due_date', cutoffDateStr)
      .order('due_date', { ascending: true })

    if (matterId) query = query.eq('matter_id', matterId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const invoices = (data ?? []).map((inv: any) => {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        matter_id: inv.matter_id,
        amount_cents: inv.total_cents,
        due_date: inv.due_date,
        days_overdue: daysOverdue,
        aging_bucket: inv.aging_bucket,
      }
    })

    return NextResponse.json({
      success: true,
      invoices,
      count: invoices.length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
