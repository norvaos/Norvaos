/**
 * GET    /api/trust-accounting/disbursements/[id]  -  Get disbursement request detail
 * PATCH  /api/trust-accounting/disbursements/[id]  -  Approve or reject a disbursement request
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'trust_accounting', 'view')
    const { id } = await params

    const { data, error } = await (admin as any)
      .from('trust_disbursement_requests')
      .select('*, matters!inner(id, title)')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 })
    }

    return NextResponse.json({ success: true, request: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { id } = await params
    const body = await request.json()
    const { action, rejectionReason } = body

    if (!['approve', 'reject', 'cancel'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "approve", "reject", or "cancel"' },
        { status: 400 }
      )
    }

    // Approve requires the approve permission (lawyers only)
    if (action === 'approve') {
      requirePermission(auth, 'trust_accounting', 'approve')
    } else {
      requirePermission(auth, 'trust_accounting', 'edit')
    }

    const adminClient = createAdminClient()

    // Fetch the request
    const { data: req, error: fetchError } = await (adminClient as any)
      .from('trust_disbursement_requests')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !req) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
    }

    if (req.status !== 'pending_approval') {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} a request in "${req.status}" status` },
        { status: 422 }
      )
    }

    if (action === 'approve') {
      // C4: Segregation of duties  -  approver cannot be preparer
      if (req.prepared_by === auth.userId) {
        return NextResponse.json(
          { success: false, error: 'Segregation of duties: the preparer cannot approve their own disbursement request' },
          { status: 403 }
        )
      }

      // Update request status
      await adminClient
        .from('trust_disbursement_requests')
        .update({
          status: 'approved',
          approved_by: auth.userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)

      // Create the disbursement transaction (negative amount)
      const { data: txn, error: txnError } = await (adminClient as any)
        .from('trust_transactions')
        .insert({
          tenant_id: auth.tenantId,
          trust_account_id: req.trust_account_id,
          matter_id: req.matter_id,
          transaction_type: req.request_type === 'refund' ? 'refund' : 'disbursement',
          amount_cents: -req.amount_cents, // Negative for outflow
          description: req.description,
          client_description: req.client_description,
          reference_number: req.reference_number,
          payment_method: req.payment_method,
          invoice_id: req.invoice_id,
          authorized_by: auth.userId,
          recorded_by: auth.userId,
          effective_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (txnError) {
        // Rollback approval if transaction fails (e.g., overdraft)
        await adminClient
          .from('trust_disbursement_requests')
          .update({ status: 'pending_approval', approved_by: null, approved_at: null })
          .eq('id', id)

        const isOverdraft = txnError.message?.includes('cannot go negative')
        return NextResponse.json(
          { success: false, error: isOverdraft ? 'Insufficient trust balance' : txnError.message },
          { status: 422 }
        )
      }

      // Link transaction to request
      await adminClient
        .from('trust_disbursement_requests')
        .update({ trust_transaction_id: txn.id })
        .eq('id', id)

      // Audit log
      await (adminClient as any).from('trust_audit_log').insert({
        tenant_id: auth.tenantId,
        action: 'disbursement_approved',
        entity_type: 'trust_disbursement_request',
        entity_id: id,
        matter_id: req.matter_id,
        user_id: auth.userId,
        metadata: {
          amount_cents: req.amount_cents,
          payee_name: req.payee_name,
          transaction_id: txn.id,
        },
      })

      return NextResponse.json({ success: true, request: { ...req, status: 'approved' }, transaction: txn })
    }

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json(
          { success: false, error: 'rejectionReason is required when rejecting' },
          { status: 400 }
        )
      }

      await adminClient
        .from('trust_disbursement_requests')
        .update({
          status: 'rejected',
          rejected_by: auth.userId,
          rejection_reason: rejectionReason,
        })
        .eq('id', id)

      // Audit log
      await (adminClient as any).from('trust_audit_log').insert({
        tenant_id: auth.tenantId,
        action: 'disbursement_rejected',
        entity_type: 'trust_disbursement_request',
        entity_id: id,
        matter_id: req.matter_id,
        user_id: auth.userId,
        metadata: { reason: rejectionReason },
      })

      return NextResponse.json({ success: true, request: { ...req, status: 'rejected' } })
    }

    // Cancel
    await (adminClient as any)
      .from('trust_disbursement_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)

    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'disbursement_cancelled',
      entity_type: 'trust_disbursement_request',
      entity_id: id,
      matter_id: req.matter_id,
      user_id: auth.userId,
      metadata: {},
    })

    return NextResponse.json({ success: true, request: { ...req, status: 'cancelled' } })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const admin = createAdminClient()