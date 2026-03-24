import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'
import { withTiming } from '@/lib/middleware/request-timing'

type RouteContext = { params: Promise<{ token: string }> }

interface ResubmitBody {
  targets: Array<{
    type: 'field' | 'document'
    profile_path?: string
    slot_id?: string
  }>
}

/**
 * POST /api/portal/[token]/field-verifications/resubmit
 *
 * Called by the client portal when the user clicks "Fixed It" after
 * correcting a rejected field or re-uploading a rejected document.
 *
 * Flips verification_status from 'rejected' → 'submitted' so the
 * lawyer sees the item is ready for re-review.
 *
 * Also broadcasts a realtime update on the intake:{matterId} channel.
 */
async function handlePost(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { token } = await params
    const link = await validatePortalToken(token)
    const admin = createAdminClient()

    const body = (await request.json()) as ResubmitBody

    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json(
        { error: 'targets array is required' },
        { status: 400 },
      )
    }

    let processed = 0

    for (const target of body.targets) {
      if (target.type === 'field' && target.profile_path) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (admin as any)
          .from('field_verifications')
          .update({
            verification_status: 'submitted',
            rejection_reason: null,
          })
          .eq('matter_id', link.matter_id)
          .eq('tenant_id', link.tenant_id)
          .eq('profile_path', target.profile_path)
          .eq('verification_status', 'rejected')

        if (!error) processed++
      } else if (target.type === 'document' && target.slot_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (admin as any)
          .from('document_slots')
          .update({
            verification_status: 'submitted',
            verification_rejection_reason: null,
          })
          .eq('id', target.slot_id)
          .eq('matter_id', link.matter_id)
          .eq('verification_status', 'rejected')

        if (!error) processed++
      }
    }

    // Broadcast realtime update so the lawyer dashboard refreshes
    try {
      const channel = admin.channel(`intake:${link.matter_id}`)
      await channel.send({
        type: 'broadcast',
        event: 'verification_update',
        payload: {
          action: 'resubmit',
          targets: body.targets.map((t) => ({
            type: t.type,
            id: t.type === 'field' ? t.profile_path : t.slot_id,
          })),
          verification_status: 'submitted',
          timestamp: new Date().toISOString(),
        },
      })
      admin.removeChannel(channel)
    } catch {
      // Non-fatal
      console.warn('[portal/resubmit] Realtime broadcast failed')
    }

    // Log activity
    await admin.from('activities').insert({
      tenant_id: link.tenant_id,
      matter_id: link.matter_id,
      contact_id: link.contact_id,
      activity_type: 'portal_ircc_form_completed',
      title: `Client re-submitted ${processed} corrected item${processed !== 1 ? 's' : ''} for review`,
      entity_type: 'field_verification',
      metadata: {
        action: 'resubmit',
        target_count: body.targets.length,
        processed,
      },
    })

    return NextResponse.json({
      success: true,
      processed,
    })
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('[portal/resubmit] error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/field-verifications/resubmit')
