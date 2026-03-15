import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/email/threads/[threadId]
 *
 * Fetch a single email thread with all its messages.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { threadId } = await params

    // Fetch thread
    const { data: thread, error: threadError } = await admin
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Fetch messages for this thread
    const { data: messages } = await admin
      .from('email_messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('tenant_id', auth.tenantId)
      .order('received_at', { ascending: true })

    // Fetch attachments for all messages
    const messageIds = (messages ?? []).map((m) => m.id)
    let attachments: Record<string, unknown[]> = {}
    if (messageIds.length > 0) {
      const { data: attachmentData } = await admin
        .from('email_attachments')
        .select('*')
        .in('message_id', messageIds)

      // Group by message_id
      attachments = (attachmentData ?? []).reduce(
        (acc, att) => {
          const key = att.message_id
          if (!acc[key]) acc[key] = []
          acc[key].push(att)
          return acc
        },
        {} as Record<string, unknown[]>
      )
    }

    // Enrich messages with attachments
    const enrichedMessages = (messages ?? []).map((m) => ({
      ...m,
      attachments: attachments[m.id] ?? [],
    }))

    // Fetch linked matter and contact names
    let matterTitle: string | null = null
    let contactName: string | null = null

    if (thread.matter_id) {
      const { data: matter } = await admin
        .from('matters')
        .select('id, title')
        .eq('id', thread.matter_id)
        .single()
      matterTitle = matter?.title ?? null
    }

    if (thread.contact_id) {
      const { data: contact } = await admin
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('id', thread.contact_id)
        .single()
      contactName = contact
        ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || null
        : null
    }

    return NextResponse.json({
      data: {
        ...thread,
        matterTitle,
        contactName,
        messages: enrichedMessages,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/threads/[threadId]] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/email/threads/[threadId]')
