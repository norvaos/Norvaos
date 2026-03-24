import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const directMessageSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID'),
})

/**
 * POST /api/chat/direct — Find or create a direct message channel
 * Body: { user_id: string } — the other user to DM
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'create')
    const { userId, tenantId, supabase } = auth
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = directMessageSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const otherUserId = parsed.data.user_id

    if (otherUserId === userId) {
      return NextResponse.json({ error: 'Cannot create DM with yourself' }, { status: 400 })
    }

    // Verify other user exists in same tenant
    const { data: otherUser } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('id', otherUserId)
      .eq('tenant_id', tenantId)
      .single()

    if (!otherUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find existing direct channel between these two users — parallel
    const [{ data: myChannels }, { data: theirChannels }] = await Promise.all([
      supabase
        .from('chat_channel_members')
        .select('channel_id')
        .eq('user_id', userId),
      supabase
        .from('chat_channel_members')
        .select('channel_id')
        .eq('user_id', otherUserId),
    ])

    if (myChannels && theirChannels) {
      const myChannelIds = new Set(myChannels.map((m) => m.channel_id))
      const sharedChannelIds = theirChannels
        .filter((m) => myChannelIds.has(m.channel_id))
        .map((m) => m.channel_id)

      if (sharedChannelIds.length > 0) {
        // Check if any shared channel is a direct channel with exactly 2 members
        const { data: directChannels } = await supabase
          .from('chat_channels')
          .select('id, tenant_id, name, channel_type, matter_id, created_at')
          .in('id', sharedChannelIds)
          .eq('channel_type', 'direct')
          .eq('tenant_id', tenantId)

        if (directChannels && directChannels.length > 0) {
          // Verify it has exactly 2 members
          for (const dc of directChannels) {
            const { count } = await supabase
              .from('chat_channel_members')
              .select('*', { count: 'exact', head: true })
              .eq('channel_id', dc.id)

            if (count === 2) {
              return NextResponse.json({ channel: dc, created: false })
            }
          }
        }
      }
    }

    // No existing DM found — create one (write — admin client)
    const { data: channel, error: chError } = await admin
      .from('chat_channels')
      .insert({
        tenant_id: tenantId,
        channel_type: 'direct',
        name: null,
      })
      .select()
      .single()

    if (chError || !channel) {
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
    }

    // Add both users as members (write — admin client)
    const { error: memError } = await admin
      .from('chat_channel_members')
      .insert([
        { channel_id: channel.id, user_id: userId },
        { channel_id: channel.id, user_id: otherUserId },
      ])

    if (memError) {
      await admin.from('chat_channels').delete().eq('id', channel.id).eq('tenant_id', tenantId)
      return NextResponse.json({ error: 'Failed to add members' }, { status: 500 })
    }

    return NextResponse.json({ channel, created: true }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/direct] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/chat/direct')
