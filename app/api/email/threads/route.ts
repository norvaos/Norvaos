import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/email/threads
 *
 * List email threads with optional matter filter.
 * Query params: matter_id?, is_archived?, limit?, offset?
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matter_id')
    const isArchived = searchParams.get('is_archived')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    let query = admin
      .from('email_threads')
      .select('*', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (matterId) {
      query = query.eq('matter_id', matterId)
    }

    if (isArchived !== null) {
      query = query.eq('is_archived', isArchived === 'true')
    } else {
      // Default: show non-archived
      query = query.eq('is_archived', false)
    }

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ data: data ?? [], total: count ?? 0 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/threads] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch email threads' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/email/threads')
