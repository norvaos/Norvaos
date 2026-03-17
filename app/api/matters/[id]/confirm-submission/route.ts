import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/confirm-submission
 *
 * Records submission confirmation for a matter's intake record.
 * At least one of confirmation_number or confirmation_doc_path must be provided.
 *
 * Auth: Lawyer, Admin, or Paralegal.
 *
 * Body: {
 *   confirmation_number?: string
 *   confirmation_doc_path?: string
 * }
 *
 * Returns 200 with updated intake record.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate + role check
    const auth = await authenticateRequest()
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin', 'Paralegal'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer, Admin, or Paralegal role required' },
        { status: 403 }
      )
    }

    // 2. Parse body
    const body = await request.json()
    const { confirmation_number, confirmation_doc_path } = body as {
      confirmation_number?: string
      confirmation_doc_path?: string
    }

    // 3. At least one of the two fields must be provided
    const hasConfirmationNumber = confirmation_number && confirmation_number.trim().length > 0
    const hasDocPath = confirmation_doc_path && confirmation_doc_path.trim().length > 0

    if (!hasConfirmationNumber && !hasDocPath) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one of confirmation_number or confirmation_doc_path is required',
        },
        { status: 422 }
      )
    }

    // 4. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 5. Fetch the intake record
    const { data: intake, error: intakeErr } = await auth.supabase
      .from('matter_intake')
      .select('id')
      .eq('matter_id', matterId)
      .single()

    if (intakeErr || !intake) {
      return NextResponse.json(
        { success: false, error: 'Matter intake record not found' },
        { status: 404 }
      )
    }

    // 6. Update matter_intake
    const confirmedAt = new Date().toISOString()
    const { data: updatedIntake, error: updateErr } = await auth.supabase
      .from('matter_intake')
      .update({
        submission_confirmation_number: hasConfirmationNumber
          ? confirmation_number!.trim()
          : undefined,
        submission_confirmation_doc_path: hasDocPath
          ? confirmation_doc_path!.trim()
          : undefined,
        submission_confirmed_at: confirmedAt,
        submission_confirmed_by: auth.userId,
        updated_at: confirmedAt,
      } as any)
      .eq('id', intake.id)
      .select()
      .single()

    if (updateErr) {
      console.error('[confirm-submission] Update error:', updateErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update submission confirmation' },
        { status: 500 }
      )
    }

    // 7. Log activity
    const descriptionParts: string[] = []
    if (hasConfirmationNumber) descriptionParts.push(`Confirmation number: ${confirmation_number!.trim()}`)
    if (hasDocPath) descriptionParts.push(`Document path attached`)

    await auth.supabase.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      activity_type: 'submission_confirmed',
      title: 'Submission confirmed',
      description: descriptionParts.join('. '),
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: {
        confirmation_number: hasConfirmationNumber ? confirmation_number!.trim() : null,
        confirmation_doc_path: hasDocPath ? confirmation_doc_path!.trim() : null,
        confirmed_at: confirmedAt,
      } as any,
    })

    return NextResponse.json(
      { success: true, intake: updatedIntake },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[confirm-submission] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/confirm-submission')
