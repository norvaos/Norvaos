/**
 * PATCH /api/trust-accounting/holds/[id]  -  Release or cancel a hold
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'edit')
    const { id } = await params
    const body = await request.json()
    const { action } = body

    if (!['release', 'cancel'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "release" or "cancel"' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { data: hold, error: fetchError } = await (adminClient as any)
      .from('trust_holds')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !hold) {
      return NextResponse.json({ success: false, error: 'Hold not found' }, { status: 404 })
    }

    if (hold.status !== 'held') {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} a hold in "${hold.status}" status` },
        { status: 422 }
      )
    }

    const newStatus = action === 'release' ? 'released' : 'cancelled'

    await (adminClient as any)
      .from('trust_holds')
      .update({
        status: newStatus,
        released_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Audit log
    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: `hold_${newStatus}`,
      entity_type: 'trust_hold',
      entity_id: id,
      matter_id: hold.matter_id,
      user_id: auth.userId,
      metadata: { amount_cents: hold.amount_cents, transaction_id: hold.transaction_id },
    })

    return NextResponse.json({ success: true, hold: { ...hold, status: newStatus } })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
