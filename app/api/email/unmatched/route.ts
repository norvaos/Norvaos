import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/email/unmatched
 *
 * List unmatched email queue entries (pending triage).
 * Query params: status? (default: 'pending'), limit?, offset?
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'view')
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'pending'
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    // Fetch unmatched entries with thread data
    const { data: entries, error, count } = await admin
      .from('unmatched_email_queue')
      .select('*', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // Enrich with thread data
    const threadIds = (entries ?? []).map((e) => e.thread_id)
    let threadMap: Record<string, unknown> = {}

    if (threadIds.length > 0) {
      const { data: threads } = await admin
        .from('email_threads')
        .select('id, subject, participant_emails, last_message_at, message_count')
        .in('id', threadIds)

      if (threads) {
        threadMap = Object.fromEntries(threads.map((t) => [t.id, t]))
      }
    }

    const enrichedEntries = (entries ?? []).map((entry) => ({
      ...entry,
      thread: threadMap[entry.thread_id] ?? null,
    }))

    return NextResponse.json({ data: enrichedEntries, total: count ?? 0 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/unmatched] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch unmatched emails' }, { status: 500 })
  }
}

/**
 * POST /api/email/unmatched
 *
 * Resolve or dismiss an unmatched email queue entry.
 * Body: { id, action: 'resolve' | 'dismiss', matter_id? }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'edit')
    const { id, action, matter_id } = await request.json()

    if (!id || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
    }

    if (action !== 'resolve' && action !== 'dismiss') {
      return NextResponse.json({ error: 'Action must be "resolve" or "dismiss"' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify entry belongs to tenant
    const { data: entry } = await admin
      .from('unmatched_email_queue')
      .select('id, thread_id')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'pending')
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Queue entry not found or already resolved' }, { status: 404 })
    }

    if (action === 'resolve' && matter_id) {
      // Associate the thread to the matter
      const { manualAssociate } = await import('@/lib/services/email-association')
      await manualAssociate(admin, entry.thread_id, matter_id, auth.userId)
    }

    // Update queue entry status
    const newStatus = action === 'resolve' ? 'resolved' : 'dismissed'
    await admin
      .from('unmatched_email_queue')
      .update({
        status: newStatus,
        resolved_by: auth.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/unmatched] POST error:', error)
    return NextResponse.json({ error: 'Failed to update queue entry' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/email/unmatched')
export const POST = withTiming(handlePost, 'POST /api/email/unmatched')
