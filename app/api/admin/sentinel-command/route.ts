import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/sentinel-command
 *
 * Security Command Centre — admin-only access to the immutable
 * sentinel_audit_log. Returns events with severity highlighting
 * and violation forensics.
 *
 * Query params:
 *   ?limit=50         — max records (default 50, max 200)
 *   ?severity=critical — filter by severity
 *   ?event_type=TENANT_VIOLATION — filter by event type
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()

    // Enforce super_admin / admin role — settings:edit is the admin gate
    const role = requirePermission(auth, 'settings', 'edit')

    // Double-check: must be admin or super_admin role by name
    const roleName = role.name.toLowerCase()
    if (roleName !== 'admin' && roleName !== 'super_admin' && roleName !== 'superadmin') {
      throw new AuthError('Security Command Centre requires admin role', 403)
    }

    const url = new URL(request.url)
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? '50', 10),
      200,
    )
    const severity = url.searchParams.get('severity')
    const eventType = url.searchParams.get('event_type')

    const admin = createAdminClient()
    let query = admin
      .from('sentinel_audit_log')
      .select('id, event_type, severity, tenant_id, user_id, auth_user_id, table_name, record_id, ip_address, request_path, details, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (severity) {
      query = query.eq('severity', severity)
    }
    if (eventType) {
      query = query.eq('event_type', eventType)
    }

    const { data, error } = await query

    if (error) {
      console.error('[sentinel-command] Query error:', error)
      return NextResponse.json({ error: 'Failed to query audit log' }, { status: 500 })
    }

    // Enrich with severity counts for the dashboard header
    const { data: countData } = await admin
      .from('sentinel_audit_log')
      .select('severity')

    const counts = {
      total: countData?.length ?? 0,
      critical: countData?.filter((r: { severity: string }) => r.severity === 'critical').length ?? 0,
      breach: countData?.filter((r: { severity: string }) => r.severity === 'breach').length ?? 0,
      warning: countData?.filter((r: { severity: string }) => r.severity === 'warning').length ?? 0,
      info: countData?.filter((r: { severity: string }) => r.severity === 'info').length ?? 0,
    }

    return NextResponse.json({
      events: data ?? [],
      counts,
      limit,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[sentinel-command] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/sentinel-command')
