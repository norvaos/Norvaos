import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchNotification } from '@/lib/services/notification-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/chat/channels/[channelId]/messages  -  Paginated messages
 * Query params: cursor (ISO date), limit (default 50)
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'view')
    const { userId, supabase } = auth
    const { channelId } = await params

    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)

    // Verify membership
    const { data: membership } = await supabase
      .from('chat_channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
    }

    // Fetch messages
    let query = supabase
      .from('chat_messages')
      .select('id, tenant_id, channel_id, sender_id, content, attachments, mentions, matter_id, document_id, task_id, is_edited, edited_at, is_deleted, created_at')
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: messages, error: msgError } = await query

    if (msgError) {
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Resolve sender names
    const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))]
    const { data: senders } = await supabase
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .in('id', senderIds)

    const senderMap = new Map(
      (senders ?? []).map((u) => [u.id, u]),
    )

    const enrichedMessages = (messages ?? []).map((msg) => {
      const sender = senderMap.get(msg.sender_id)
      return {
        ...msg,
        sender_name: sender
          ? [sender.first_name, sender.last_name].filter(Boolean).join(' ') || 'Unknown'
          : 'Unknown',
        sender_avatar_url: sender?.avatar_url ?? null,
      }
    })

    // Reverse to chronological order for display
    enrichedMessages.reverse()

    const hasMore = (messages?.length ?? 0) === limit
    const nextCursor = messages && messages.length > 0
      ? messages[messages.length - 1].created_at
      : null

    return NextResponse.json({
      messages: enrichedMessages,
      has_more: hasMore,
      next_cursor: nextCursor,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/messages] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/chat/channels/[channelId]/messages  -  Send a message
 * Body: { content: string, mentions?: string[], matter_id?: string, document_id?: string, task_id?: string }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'create')
    const { userId, tenantId, supabase } = auth
    const { channelId } = await params
    const admin = createAdminClient()

    // Verify membership (read  -  auth client)
    const { data: membership } = await supabase
      .from('chat_channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
    }

    const body = await request.json()
    const { content, mentions, matter_id, document_id, task_id } = body as {
      content: string
      mentions?: string[]
      matter_id?: string
      document_id?: string
      task_id?: string
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    // Insert message (write  -  admin client)
    const { data: message, error: msgError } = await admin
      .from('chat_messages')
      .insert({
        tenant_id: tenantId,
        channel_id: channelId,
        sender_id: userId,
        content: content.trim(),
        mentions: mentions ?? [],
        matter_id: matter_id ?? null,
        document_id: document_id ?? null,
        task_id: task_id ?? null,
      })
      .select()
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    // Update sender's last_read_at (write  -  admin client)
    await admin
      .from('chat_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', userId)

    // Resolve sender name for response (read  -  auth client)
    const { data: sender } = await supabase
      .from('users')
      .select('first_name, last_name, avatar_url')
      .eq('id', userId)
      .single()

    const senderName = sender
      ? [sender.first_name, sender.last_name].filter(Boolean).join(' ') || 'Unknown'
      : 'Unknown'

    // Dispatch notification to other channel members (non-blocking, read  -  auth client)
    const { data: otherMembers } = await supabase
      .from('chat_channel_members')
      .select('user_id')
      .eq('channel_id', channelId)
      .neq('user_id', userId)

    if (otherMembers && otherMembers.length > 0) {
      dispatchNotification(admin, {
        tenantId,
        eventType: 'new_message',
        recipientUserIds: otherMembers.map((m) => m.user_id),
        title: `New message from ${senderName}`,
        message: content.trim().length > 100
          ? content.trim().slice(0, 100) + '...'
          : content.trim(),
        entityType: 'chat',
        entityId: channelId,
      }).catch(() => {
        // Non-blocking  -  notification failures don't affect message send
      })
    }

    return NextResponse.json({
      message: {
        ...message,
        sender_name: senderName,
        sender_avatar_url: sender?.avatar_url ?? null,
      },
    }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[chat/messages] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/chat/channels/[channelId]/messages')
export const POST = withTiming(handlePost, 'POST /api/chat/channels/[channelId]/messages')
