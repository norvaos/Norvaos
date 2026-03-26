import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const createChannelSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  channel_type: z.enum(['group', 'matter']),
  member_ids: z.array(z.string().uuid()).min(1, 'At least one member is required'),
  matter_id: z.string().uuid().optional().nullable(),
}).refine(
  (data) => data.channel_type !== 'matter' || !!data.matter_id,
  { message: 'matter_id is required for matter channels', path: ['matter_id'] }
)

/**
 * GET /api/chat/channels  -  List current user's chat channels
 * Returns channels with last message preview and unread count.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'view')
    const { userId, tenantId } = auth
    const admin = createAdminClient()

    // Get all channels the user is a member of
    const { data: memberships, error: memError } = await admin
      .from('chat_channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', userId)

    if (memError) {
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ channels: [] })
    }

    const channelIds = memberships.map((m) => m.channel_id)
    const lastReadMap = new Map(
      memberships.map((m) => [m.channel_id, m.last_read_at]),
    )

    // Fetch channel details
    const { data: channels, error: chError } = await admin
      .from('chat_channels')
      .select('id, tenant_id, name, channel_type, matter_id, created_at')
      .in('id', channelIds)
      .eq('tenant_id', tenantId)

    if (chError || !channels) {
      return NextResponse.json({ error: 'Failed to fetch channel details' }, { status: 500 })
    }

    // Fetch per-channel data  -  parallelize inner queries (was N+3 sequential)
    const channelResults = await Promise.all(
      channels.map(async (channel) => {
        const lastRead = lastReadMap.get(channel.id)

        // Build unread count query based on lastRead presence
        const unreadQuery = lastRead
          ? admin
              .from('chat_messages')
              .select('*', { count: 'exact', head: true })
              .eq('channel_id', channel.id)
              .eq('is_deleted', false)
              .neq('sender_id', userId)
              .gt('created_at', lastRead)
          : admin
              .from('chat_messages')
              .select('*', { count: 'exact', head: true })
              .eq('channel_id', channel.id)
              .eq('is_deleted', false)
              .neq('sender_id', userId)

        // Fire all 3 queries in parallel (was sequential)
        const [lastMsgResult, unreadResult, membersResult] = await Promise.all([
          admin
            .from('chat_messages')
            .select('id, content, sender_id, created_at')
            .eq('channel_id', channel.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1),
          unreadQuery,
          admin
            .from('chat_channel_members')
            .select('user_id')
            .eq('channel_id', channel.id),
        ])

        const lastMessage = lastMsgResult.data?.[0] ?? null
        const unreadCount = unreadResult.count ?? 0
        const members = membersResult.data

        // Resolve member names for DMs (single lookup if needed)
        let displayName = channel.name
        if (channel.channel_type === 'direct' && members) {
          const otherMemberId = members.find((m) => m.user_id !== userId)?.user_id
          if (otherMemberId) {
            const { data: otherUser } = await admin
              .from('users')
              .select('first_name, last_name')
              .eq('id', otherMemberId)
              .single()
            if (otherUser) {
              displayName = [otherUser.first_name, otherUser.last_name]
                .filter(Boolean)
                .join(' ') || 'Unknown'
            }
          }
        }

        return {
          ...channel,
          display_name: displayName,
          last_message: lastMessage,
          unread_count: unreadCount,
          member_count: members?.length ?? 0,
        }
      }),
    )

    // Sort by last message time (most recent first)
    channelResults.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at
      const bTime = b.last_message?.created_at ?? b.created_at
      return new Date(bTime ?? '').getTime() - new Date(aTime ?? '').getTime()
    })

    return NextResponse.json({ channels: channelResults })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/channels] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/chat/channels  -  Create a new channel
 * Body: { name?: string, channel_type: 'group' | 'matter', member_ids: string[], matter_id?: string }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'create')
    const { userId, tenantId } = auth
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createChannelSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { name, channel_type, member_ids, matter_id } = parsed.data

    // Create channel
    const { data: channel, error: chError } = await admin
      .from('chat_channels')
      .insert({
        tenant_id: tenantId,
        name: name || null,
        channel_type,
        matter_id: matter_id || null,
      })
      .select()
      .single()

    if (chError || !channel) {
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
    }

    // Add members (always include creator)
    const allMemberIds = [...new Set([userId, ...member_ids])]
    const memberInserts = allMemberIds.map((uid) => ({
      channel_id: channel.id,
      user_id: uid,
    }))

    const { error: memError } = await admin
      .from('chat_channel_members')
      .insert(memberInserts)

    if (memError) {
      // Cleanup channel on member insert failure
      await admin.from('chat_channels').delete().eq('id', channel.id)
      return NextResponse.json({ error: 'Failed to add members' }, { status: 500 })
    }

    return NextResponse.json({ channel }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/channels] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/chat/channels')
export const POST = withTiming(handlePost, 'POST /api/chat/channels')
