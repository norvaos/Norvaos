import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOVEREIGN_EVENT_TYPES } from '@/lib/services/sovereign-audit-engine'

/**
 * GET /api/audit/stream
 *
 * Sovereign Audit Stream  -  Directive 052
 *
 * Returns a paginated, filterable stream of audit events from
 * the immutable sentinel_audit_log. Admin/owner role required.
 *
 * Query params:
 *   ?page=1          - Page number (default 1)
 *   ?limit=50        - Records per page (default 50, max 200)
 *   ?eventType=MATTER_IGNITED  - Filter by event type
 *   ?userId=uuid     - Filter by acting user
 *   ?from=2026-01-01 - Start date (inclusive)
 *   ?to=2026-03-26   - End date (inclusive, extends to end of day)
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()

    // Only admin / owner role can access the audit stream
    requirePermission(auth, 'settings', 'edit')

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)),
      200,
    )
    const eventType = url.searchParams.get('eventType')
    const userId = url.searchParams.get('userId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    // Validate eventType if provided
    if (
      eventType &&
      !(SOVEREIGN_EVENT_TYPES as readonly string[]).includes(eventType)
    ) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${SOVEREIGN_EVENT_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const offset = (page - 1) * limit

    // ── Build the query ────────────────────────────────────────────────────
    let query = admin
      .from('sentinel_audit_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (eventType) {
      query = query.eq('event_type', eventType)
    }
    if (userId) {
      query = query.eq('user_id', userId)
    }
    if (from) {
      query = query.gte('created_at', `${from}T00:00:00.000Z`)
    }
    if (to) {
      query = query.lte('created_at', `${to}T23:59:59.999Z`)
    }

    const { data: rawEntries, count, error } = await query

    if (error) {
      console.error('[audit/stream] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch audit entries' }, { status: 500 })
    }

    const entries = rawEntries ?? []

    // ── Join user info ─────────────────────────────────────────────────────
    // Collect unique user IDs from the result set and fetch names/avatars
    const userIds = [
      ...new Set(
        entries
          .map((e: Record<string, unknown>) => e.user_id as string | null)
          .filter(Boolean) as string[],
      ),
    ]

    let userMap: Record<string, { first_name: string | null; last_name: string | null; avatar_url: string | null; email: string }> = {}

    if (userIds.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, first_name, last_name, avatar_url, email')
        .in('id', userIds)

      if (users) {
        userMap = Object.fromEntries(
          users.map((u) => [u.id, { first_name: u.first_name, last_name: u.last_name, avatar_url: u.avatar_url, email: u.email }]),
        )
      }
    }

    // ── Shape the response ─────────────────────────────────────────────────
    const enrichedEntries = entries.map((entry: Record<string, unknown>) => {
      const uid = entry.user_id as string | null
      const user = uid ? userMap[uid] : null
      return {
        ...entry,
        user_first_name: user?.first_name ?? null,
        user_last_name: user?.last_name ?? null,
        user_avatar_url: user?.avatar_url ?? null,
        user_email: user?.email ?? null,
      }
    })

    return NextResponse.json({
      entries: enrichedEntries,
      total: count ?? 0,
      page,
      limit,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[audit/stream] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/audit/stream')
