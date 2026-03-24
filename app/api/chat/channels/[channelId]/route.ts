import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/chat/channels/[channelId] — Get channel details with members
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'view')
    const { userId, tenantId } = auth
    const admin = createAdminClient()
    const { channelId } = await params

    // Verify user is a member
    const { data: membership } = await admin
      .from('chat_channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
    }

    // Fetch channel
    const { data: channel, error: chError } = await admin
      .from('chat_channels')
      .select('id, tenant_id, name, channel_type, matter_id, created_at')
      .eq('id', channelId)
      .eq('tenant_id', tenantId)
      .single()

    if (chError || !channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Fetch members with user details
    const { data: members } = await admin
      .from('chat_channel_members')
      .select('id, user_id, last_read_at, joined_at')
      .eq('channel_id', channelId)

    // Resolve member names
    const memberUserIds = members?.map((m) => m.user_id) ?? []
    const { data: users } = await admin
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .in('id', memberUserIds)

    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u]),
    )

    const membersWithDetails = (members ?? []).map((m) => {
      const user = userMap.get(m.user_id)
      return {
        ...m,
        first_name: user?.first_name ?? null,
        last_name: user?.last_name ?? null,
        avatar_url: user?.avatar_url ?? null,
      }
    })

    // Fetch matter info if matter channel
    let matter = null
    if (channel.matter_id) {
      const { data: matterData } = await admin
        .from('matters')
        .select('id, title, matter_number')
        .eq('id', channel.matter_id)
        .single()
      matter = matterData
    }

    return NextResponse.json({
      channel: {
        ...channel,
        members: membersWithDetails,
        matter,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/channels/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/chat/channels/[channelId]')
