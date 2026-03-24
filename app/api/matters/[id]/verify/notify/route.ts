import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { sendClientEmail } from '@/lib/services/email-service'

type RouteContext = { params: Promise<{ id: string }> }

interface NotifyBody {
  targets: Array<{
    type: 'field' | 'document'
    profile_path?: string
    slot_id?: string
  }>
  rejection_reason: string
  rejection_slug?: string | null
}

/**
 * POST /api/matters/[id]/verify/notify
 *
 * Sends a "rejected-item-nudge" transactional email to the client
 * after a lawyer rejects field(s) or document(s) during verification.
 *
 * This is fire-and-forget — the rejection has already been saved via the
 * parent /verify endpoint. This just handles the email notification.
 *
 * Permission: form_packs:create (Lawyer/Admin only — same as verify)
 */
async function handlePost(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')

    const body = (await request.json()) as NotifyBody

    if (!body.targets || !body.rejection_reason) {
      return NextResponse.json(
        { error: 'targets and rejection_reason are required' },
        { status: 400 },
      )
    }

    // Fetch matter reference
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, reference_number')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // Find the primary contact via matter_contacts junction
    const { data: primaryMc } = await auth.supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .limit(1)
      .maybeSingle()

    if (!primaryMc?.contact_id) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Matter has no primary contact',
      })
    }

    const contactId = primaryMc.contact_id

    // Build item names from targets
    const itemNames: string[] = []
    for (const target of body.targets) {
      if (target.type === 'field' && target.profile_path) {
        // Use the last segment of the profile path as a readable name
        const segments = target.profile_path.split('.')
        const readable = segments[segments.length - 1]
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
        itemNames.push(readable)
      } else if (target.type === 'document' && target.slot_id) {
        // Fetch slot name
        const { data: slot } = await auth.supabase
          .from('document_slots')
          .select('slot_name')
          .eq('id', target.slot_id)
          .single()
        itemNames.push(slot?.slot_name || 'Document')
      }
    }

    // Send the notification email using the 'general' type
    // (the email service handles template rendering + Resend dispatch)
    await sendClientEmail({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      matterId,
      contactId,
      notificationType: 'general',
      templateData: {
        emailType: 'rejected_item_nudge',
        rejectedItems: itemNames.map((name) => ({
          name,
          reason: body.rejection_reason,
        })),
        rejectionSlug: body.rejection_slug,
        itemCount: body.targets.length,
      },
    })

    return NextResponse.json({ success: true, notified: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('[verify/notify] error:', error)
    // Non-fatal — return 200 even if email fails since the rejection was already saved
    return NextResponse.json({
      success: true,
      notified: false,
      reason: 'Email dispatch failed',
    })
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/verify/notify')
