/**
 * POST /api/matters/[id]/ghost-writer
 *
 * Ghost-Writer — AI generates a response draft for an inbound email
 * before the lawyer opens the thread.
 *
 * GET  /api/matters/[id]/ghost-writer?threadId=xxx
 *   → Returns existing ghost drafts for a thread
 *
 * POST /api/matters/[id]/ghost-writer
 *   → Triggers ghost draft generation for a specific inbound email
 *
 * PATCH /api/matters/[id]/ghost-writer
 *   → Updates draft status (reviewed, sent, discarded)
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { generateGhostDraft } from '@/lib/services/ghost-writer'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('threadId')

    let query = supabase
      .from('email_ghost_drafts')
      .select('id, email_thread_id, email_message_id, draft_subject, draft_body_text, draft_body_html, status, model, duration_ms, created_at, reviewed_by, reviewed_at')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })

    if (threadId) {
      query = query.eq('email_thread_id', threadId)
    }

    // Only return non-discarded drafts by default
    query = query.neq('status', 'discarded')

    const { data, error } = await query.limit(20)

    if (error) throw error

    return NextResponse.json({ drafts: data })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch drafts' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    const body = await request.json()
    const {
      threadId,
      messageId,
      inboundSubject,
      inboundBody,
      fromAddress,
      fromName,
    } = body as {
      threadId: string
      messageId?: string
      inboundSubject: string
      inboundBody: string
      fromAddress: string
      fromName?: string
    }

    if (!threadId || !inboundSubject || !inboundBody || !fromAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: threadId, inboundSubject, inboundBody, fromAddress' },
        { status: 400 }
      )
    }

    const result = await generateGhostDraft(supabase, {
      tenantId: auth.tenantId,
      matterId,
      threadId,
      messageId,
      inboundSubject,
      inboundBody,
      fromAddress,
      fromName,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      draft: {
        id: result.draftId,
        body: result.draftBody,
      },
      usage: result.usage,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ghost-Writer failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params // validate matterId exists
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    const body = await request.json()
    const { draftId, status } = body as {
      draftId: string
      status: 'reviewed' | 'sent' | 'discarded'
    }

    if (!draftId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: draftId, status' },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'reviewed') {
      updates.reviewed_by = auth.userId
      updates.reviewed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('email_ghost_drafts')
      .update(updates)
      .eq('id', draftId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update draft' },
      { status: 500 }
    )
  }
}
