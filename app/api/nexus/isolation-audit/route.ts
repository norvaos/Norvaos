import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/nexus/isolation-audit
 *
 * Runs the tenant isolation verification and logs results.
 * Nexus-only (IP-restricted + platform-admin auth).
 */
const handlePost = withNexusAdmin(async (_request, { adminCtx }) => {
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('run_tenant_isolation_audit', {
    p_run_by: adminCtx.adminId ?? 'bearer-token',
  })

  if (error) {
    return NextResponse.json(
      { error: `Isolation audit failed: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ data, error: null })
})

/**
 * GET /api/nexus/isolation-audit
 *
 * Returns the latest isolation audit results.
 */
const handleGet = withNexusAdmin(async () => {
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('tenant_isolation_audit')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch audit history: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ data, error: null })
})

export const POST = withTiming(handlePost, 'POST /api/nexus/isolation-audit')
export const GET = withTiming(handleGet, 'GET /api/nexus/isolation-audit')
