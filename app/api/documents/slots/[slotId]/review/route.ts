import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { reviewDocumentSlot } from '@/lib/services/document-review-engine'
import { checkTenantLimit, rateLimitResponse } from '@/lib/middleware/tenant-limiter'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import { checkAndFlagRepeatedRejections } from '@/lib/services/document-rejection-handler'

/**
 * POST /api/documents/slots/[slotId]/review
 *
 * Review a document slot: accept, request re-upload, or reject.
 * Uses the review_document_version() RPC for atomic state transitions.
 *
 * Body: { action: 'accept' | 'needs_re_upload' | 'reject', reason?: string, notify_client?: boolean }
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const { slotId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'edit')

    const limit = await checkTenantLimit(auth.tenantId, 'documents/review')
    if (!limit.allowed) return rateLimitResponse(limit)

    const body = await request.json()
    const { action, reason, rejection_reason_code, notify_client } = body

    if (!action || !['accept', 'needs_re_upload', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: accept, needs_re_upload, or reject' },
        { status: 400 }
      )
    }

    const result = await reviewDocumentSlot({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      slotId,
      action,
      reason,
      rejectionReasonCode: rejection_reason_code,
      notifyClient: notify_client ?? false,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    // Invalidate gating cache after successful review
    const { data: slot } = await auth.supabase
      .from('document_slots')
      .select('matter_id')
      .eq('id', slotId)
      .single()
    if (slot?.matter_id) {
      await invalidateGating(auth.tenantId, slot.matter_id)
      // Auto-sync immigration intake status so the matter advances (e.g. review_required →
      // intake_complete → drafting_enabled) without requiring a manual Recalculate click.
      try {
        await syncImmigrationIntakeStatus(auth.supabase, slot.matter_id, auth.userId)
      } catch (err) {
        console.error('[document-review] Status sync failed (non-fatal):', err)
      }
      // Check for repeated rejections (3+) and raise DOCUMENT_AUTHENTICITY risk flag
      if (action === 'reject') {
        try {
          await checkAndFlagRepeatedRejections(auth.supabase, auth.tenantId, slot.matter_id, slotId)
        } catch (err) {
          console.error('[document-review] Rejection flag check failed (non-fatal):', err)
        }
      }
    }

    return NextResponse.json({
      success: true,
      slot_id: result.slotId,
      version_number: result.versionNumber,
      new_status: result.newStatus,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document review error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/slots/[slotId]/review')
