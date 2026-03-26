import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendClientEmail } from '@/lib/services/email-service'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/send-test-notification
 *
 * Send a test email notification to the primary client contact on a matter.
 * Used to verify that the email notification flow works end-to-end.
 *
 * Body: { subject?: string, body?: string }
 * Returns: { success, recipient_email, notification_type }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // TODO: Refactor to use authenticateRequest() + requirePermission()
  try {
    const { id: matterId } = await params
    const supabase = await createClient()

    // Auth
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tenant
    const { data: appUser } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Verify matter belongs to tenant
    const { data: matter } = await supabase
      .from('matters')
      .select('id, title, matter_number')
      .eq('id', matterId)
      .eq('tenant_id', appUser.tenant_id)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // Find primary client contact
    const { data: primaryClient } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    // Fall back to any client contact if no primary
    const contactRow = primaryClient ?? (await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .limit(1)
      .maybeSingle()
    ).data

    if (!contactRow?.contact_id) {
      return NextResponse.json(
        { error: 'No client contact found for this matter' },
        { status: 400 }
      )
    }

    // Get contact email for the response
    const { data: contact } = await supabase
      .from('contacts')
      .select('email_primary, first_name, email_notifications_enabled')
      .eq('id', contactRow.contact_id)
      .single()

    if (!contact?.email_primary) {
      return NextResponse.json(
        { error: 'Client contact has no email address' },
        { status: 400 }
      )
    }

    if (contact.email_notifications_enabled === false) {
      return NextResponse.json(
        { error: 'Email notifications are disabled for this contact' },
        { status: 400 }
      )
    }

    // Parse optional custom subject/body
    const body = await request.json().catch(() => ({}))
    const subject = (body as Record<string, unknown>).subject as string | undefined
    const emailBody = (body as Record<string, unknown>).body as string | undefined

    const matterRef = matter.matter_number || matter.title || 'your case'

    // Use admin client for the write operations inside sendClientEmail
    const admin = createAdminClient()

    // Send test notification
    await sendClientEmail({
      supabase: admin,
      tenantId: appUser.tenant_id,
      matterId,
      contactId: contactRow.contact_id,
      notificationType: 'general',
      templateData: {
        subject: subject || `Test Notification  -  ${matterRef}`,
        body: emailBody || `This is a test notification for ${matterRef}. If you received this email, the notification system is working correctly.`,
        cta_label: 'View Your Case',
      },
    })

    return NextResponse.json({
      success: true,
      recipient_email: contact.email_primary,
      recipient_name: contact.first_name,
      notification_type: 'general',
    })
  } catch (error) {
    console.error('[send-test-notification] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/send-test-notification')
