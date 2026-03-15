import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { classifyPostSubmissionDocument } from '@/lib/services/post-submission-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/classify-document
 *
 * Classify a post-submission document received from IRCC.
 * Triggers configured actions (stage change, deadline, task, communication).
 *
 * Body: { document_id?: string, type_key: string }
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json(
        { error: 'Matter not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { document_id, type_key } = body

    if (!type_key) {
      return NextResponse.json(
        { error: 'type_key is required' },
        { status: 400 }
      )
    }

    const result = await classifyPostSubmissionDocument(
      auth.supabase,
      matterId,
      document_id ?? null,
      type_key,
      auth.userId
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      outcomeEventId: result.outcomeEventId,
      actionsTriggered: result.actionsTriggered,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    console.error('Classify document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/classify-document')
