import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { sendInternalEmail } from '@/lib/services/email-service'
import { log } from '@/lib/utils/logger'

/**
 * POST /api/notifications/matter-assigned
 *
 * Sends assignment notification emails to the responsible lawyer and
 * any assigned staff members when a matter is first assigned.
 *
 * Body: { matterId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const body = await request.json()
    const { matterId } = body as { matterId: string }

    if (!matterId) {
      return NextResponse.json({ error: 'matterId is required' }, { status: 400 })
    }

    // Fetch matter details + responsible lawyer + followup lawyer
    const { data: matter, error: matterError } = await auth.supabase
      .from('matters')
      .select(`
        id,
        title,
        matter_number,
        responsible_lawyer_id,
        followup_lawyer_id,
        responsible_lawyer:users!matters_responsible_lawyer_id_fkey(
          id, first_name, last_name, email
        ),
        followup_lawyer:users!matters_followup_lawyer_id_fkey(
          id, first_name, last_name, email
        )
      `)
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    const matterRef = matter.matter_number || matter.title || 'New Matter'
    const matterUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/matters/${matterId}`

    const message = `A new matter has been assigned to you.\n\nMatter: ${matter.title}\nReference: ${matterRef}\n\nPlease open the matter and complete the Onboarding tab to ensure all information is verified before proceeding.`

    // Collect unique recipients (lawyer + followup, deduplicated)
    const recipients: { name: string; email: string }[] = []

    type UserRef = { id: string; first_name: string; last_name: string; email: string } | null
    const lawyer = matter.responsible_lawyer as unknown as UserRef
    const followup = matter.followup_lawyer as unknown as UserRef

    if (lawyer?.email) {
      recipients.push({
        name: `${lawyer.first_name} ${lawyer.last_name}`.trim() || lawyer.email,
        email: lawyer.email,
      })
    }
    if (followup?.email && followup.email !== lawyer?.email) {
      recipients.push({
        name: `${followup.first_name} ${followup.last_name}`.trim() || followup.email,
        email: followup.email,
      })
    }

    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No recipients with email addresses found' })
    }

    // Send to each recipient (non-blocking, fire-and-forget)
    await Promise.allSettled(
      recipients.map((r) =>
        sendInternalEmail({
          supabase: auth.supabase,
          tenantId: auth.tenantId,
          recipientEmail: r.email,
          recipientName: r.name,
          title: `New Matter Assigned: ${matter.title}`,
          message,
          entityType: 'matter',
          entityId: matterId,
        })
      )
    )

    return NextResponse.json({ sent: recipients.length, matterRef })
  } catch (err) {
    log.error('notifications.matter_assigned.error', {
      error_message: err instanceof Error ? err.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 })
  }
}
