import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { computeJRDeadline, validateRefusalInput } from '@/lib/services/refusal-engine'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/ircc-correspondence/[corrId]/handle-refusal
 *
 * Initiates the IRCC refusal workflow for a correspondence item whose
 * item_type is 'refusal'.
 *
 * Auth: Lawyer or Admin only (403 otherwise).
 *
 * Body: { jr_basis: 'inland' | 'outside_canada', notes?: string }
 *
 * Steps:
 *  1. Auth + role check
 *  2. Verify correspondence belongs to this matter + tenant
 *  3. Verify item_type === 'refusal'
 *  4. Validate body
 *  5. Compute JR deadline
 *  6. Update ircc_correspondence (jr_deadline, jr_basis, status='actioned')
 *  7. Create urgent task
 *  8. Update ircc_correspondence.urgent_task_id
 *  9. Insert client notification record into email_logs
 * 10. Update matter status to 'refused'
 * 11. Log refusal_actions rows
 * 12. Return 200 with { success, jr_deadline, urgent_task_id, refusal_actions_count }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string; corrId: string }> }
) {
  try {
    const { id: matterId, corrId } = await params

    // 1. Authenticate
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Role check: Lawyer or Admin only
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer or Admin role required' },
        { status: 403 }
      )
    }

    // 2. Parse body
    const body = await request.json()
    const { jr_basis, notes } = body as {
      jr_basis?: 'inland' | 'outside_canada'
      notes?: string
    }

    // 3. Verify correspondence belongs to this matter + tenant
    const { data: correspondence, error: corrErr } = await admin
      .from('ircc_correspondence')
      .select('id, item_type, item_date, status, matter_id, tenant_id')
      .eq('id', corrId)
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (corrErr || !correspondence) {
      return NextResponse.json(
        { success: false, error: 'Correspondence not found or access denied' },
        { status: 404 }
      )
    }

    // 4. Verify item_type is 'refusal'
    if (correspondence.item_type !== 'refusal') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot handle refusal workflow: correspondence item_type is "${correspondence.item_type}", expected "refusal"`,
        },
        { status: 422 }
      )
    }

    // 5. Validate body
    const itemDate = correspondence.item_date ?? ''
    const validation = validateRefusalInput({
      item_date: itemDate,
      jr_basis: jr_basis as 'inland' | 'outside_canada',
      notes,
    })

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', errors: validation.errors },
        { status: 422 }
      )
    }

    // 6. Compute JR deadline
    const jrDeadline = computeJRDeadline(itemDate, jr_basis!)

    // 7. Update ircc_correspondence: jr_deadline, jr_basis, status='actioned'
    const { error: updateCorrErr } = await admin
      .from('ircc_correspondence')
      .update({
        jr_deadline: jrDeadline,
        jr_basis: jr_basis,
        status: 'actioned',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', corrId)

    if (updateCorrErr) {
      console.error('[handle-refusal] Failed to update ircc_correspondence:', updateCorrErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update correspondence record' },
        { status: 500 }
      )
    }

    // 8. Create urgent task (48h from now)
    const dueDateUtc = new Date()
    dueDateUtc.setUTCHours(dueDateUtc.getUTCHours() + 48)
    const dueDate = dueDateUtc.toISOString().substring(0, 10)

    const { data: urgentTask, error: taskErr } = await admin
      .from('tasks')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        title: 'URGENT: Review refusal and assess JR options',
        description: `JR deadline: ${jrDeadline}. Basis: ${jr_basis}. ${notes ? `Notes: ${notes}` : ''}`.trim(),
        priority: 'urgent',
        due_date: dueDate,
        status: 'not_started',
        created_by: auth.userId,
        created_via: 'refusal_workflow',
        category: 'internal',
        task_type: 'review',
        is_billable: false,
        visibility: 'everyone',
      })
      .select('id')
      .single()

    if (taskErr || !urgentTask) {
      console.error('[handle-refusal] Failed to create urgent task:', taskErr?.message)
      return NextResponse.json(
        { success: false, error: 'Failed to create urgent task' },
        { status: 500 }
      )
    }

    // 9. Update ircc_correspondence.urgent_task_id + client_notified_at
    await admin
      .from('ircc_correspondence')
      .update({
        urgent_task_id: urgentTask.id,
        client_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', corrId)

    // 10. Log client notification via email_logs
    // (communications_log table does not exist; email_logs is the correct table)
    await admin
      .from('email_logs')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        direction: 'outbound',
        subject: 'Important update regarding your application',
        body: 'We have received a decision on your application and are reviewing next steps. Your lawyer will contact you within 48 hours.',
        from_address: 'notifications@norvaos.ca',
        to_addresses: [],  // populated by notification service when email is sent
        logged_by: auth.userId,
      })

    // 11. Update matter status to 'refused'
    await admin
      .from('matters')
      .update({ status: 'refused' })
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)

    // 12. Log refusal_actions rows
    const refusalActionsPayload = [
      {
        tenant_id: auth.tenantId,
        correspondence_id: corrId,
        matter_id: matterId,
        action_type: 'jr_deadline_set' as const,
        performed_by: auth.userId,
        metadata: { jr_deadline: jrDeadline, jr_basis },
      },
      {
        tenant_id: auth.tenantId,
        correspondence_id: corrId,
        matter_id: matterId,
        action_type: 'urgent_task_created' as const,
        performed_by: auth.userId,
        metadata: { task_id: urgentTask.id, due_date: dueDate },
      },
      {
        tenant_id: auth.tenantId,
        correspondence_id: corrId,
        matter_id: matterId,
        action_type: 'client_notified' as const,
        performed_by: auth.userId,
        metadata: { channel: 'email_log', notified_at: new Date().toISOString() },
      },
    ]

    await admin
      .from('refusal_actions')
      .insert(refusalActionsPayload)

    // 13. Log activity
    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      activity_type: 'ircc_refusal_actioned',
      title: 'IRCC refusal workflow initiated',
      description: `JR deadline set to ${jrDeadline} (${jr_basis}). Urgent task created and client notified.`,
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: {
        correspondence_id: corrId,
        jr_deadline: jrDeadline,
        jr_basis,
        urgent_task_id: urgentTask.id,
      } as any,
    })

    return NextResponse.json(
      {
        success: true,
        jr_deadline: jrDeadline,
        urgent_task_id: urgentTask.id,
        refusal_actions_count: refusalActionsPayload.length,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[handle-refusal] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/ircc-correspondence/[corrId]/handle-refusal')

const admin = createAdminClient()