import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/chat/channels/[channelId]/read  -  Mark channel as read
 * Updates the user's last_read_at timestamp.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'view')
    const { userId } = auth
    const { channelId } = await params
    const admin = createAdminClient()

    const { error } = await admin
      .from('chat_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', userId)

    if (error) {
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/read] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/chat/channels/[channelId]/read')
