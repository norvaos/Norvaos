import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { manualAssociate, getAssociationSuggestions } from '@/lib/services/email-association'

/**
 * POST /api/email/threads/[threadId]/associate
 *
 * Manually associate an email thread to a matter.
 * Body: { matter_id }
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const { threadId } = await params
    const { matter_id } = await request.json()

    if (!matter_id) {
      return NextResponse.json({ error: 'Missing matter_id' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify thread belongs to this tenant
    const { data: thread } = await admin
      .from('email_threads')
      .select('id')
      .eq('id', threadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Verify matter belongs to this tenant
    const { data: matter } = await admin
      .from('matters')
      .select('id')
      .eq('id', matter_id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    await manualAssociate(admin, threadId, matter_id, auth.userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/threads/associate] POST error:', error)
    return NextResponse.json({ error: 'Failed to associate thread' }, { status: 500 })
  }
}

/**
 * GET /api/email/threads/[threadId]/associate
 *
 * Get association suggestions for an unmatched thread.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const { threadId } = await params
    const admin = createAdminClient()

    // Verify thread belongs to this tenant
    const { data: thread } = await admin
      .from('email_threads')
      .select('id')
      .eq('id', threadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const suggestions = await getAssociationSuggestions(admin, threadId)

    return NextResponse.json({ data: suggestions })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/threads/associate] GET error:', error)
    return NextResponse.json({ error: 'Failed to get suggestions' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/email/threads/[threadId]/associate')
export const GET = withTiming(handleGet, 'GET /api/email/threads/[threadId]/associate')
