import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { sendClientEmail } from '@/lib/services/email-service'
import { createAdminClient } from '@/lib/supabase/admin'

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')

    const body = await request.json()
    const { subject, message, contactId } = body as {
      subject: string
      message: string
      contactId: string
    }

    if (!subject?.trim() || !message?.trim() || !contactId) {
      return NextResponse.json({ error: 'subject, message, and contactId are required' }, { status: 400 })
    }

    // Use admin client so we can access tenant/contact data needed by email service
    const supabase = createAdminClient()

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    await sendClientEmail({
      supabase,
      tenantId: auth.tenantId,
      matterId,
      contactId,
      notificationType: 'general',
      templateData: {
        subject: subject.trim(),
        body: message.trim(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[send-client-email] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/send-client-email')
