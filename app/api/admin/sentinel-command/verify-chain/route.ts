import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/sentinel-command/verify-chain
 *
 * Runs the sentinel_verify_chain() function to check the integrity
 * of the immutable audit log hash chain. Returns the verification
 * result including the first broken link if tampered.
 *
 * Admin-only access (settings:edit permission gate).
 *
 * Query params:
 *   ?limit=1000   -  max rows to verify (default 1000, max 10000)
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()

    // Enforce admin role
    const role = requirePermission(auth, 'settings', 'edit')
    const roleName = role.name.toLowerCase()
    if (roleName !== 'admin' && roleName !== 'super_admin' && roleName !== 'superadmin') {
      throw new AuthError('Chain verification requires admin role', 403)
    }

    const url = new URL(request.url)
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? '1000', 10),
      10000,
    )

    const admin = createAdminClient()

    // RPC not yet in generated types  -  cast through unknown
    const { data, error } = await (admin.rpc as any)('sentinel_verify_chain', {
      p_limit: limit,
    }) as { data: unknown; error: any }

    if (error) {
      console.error('[sentinel-verify-chain] RPC error:', error)
      return NextResponse.json({ error: 'Failed to verify chain' }, { status: 500 })
    }

    const rows = data as Record<string, unknown>[] | Record<string, unknown> | null
    const result = Array.isArray(rows) ? rows[0] : rows

    return NextResponse.json({
      chain_valid: result?.is_valid ?? false,
      total_checked: result?.total_checked ?? 0,
      first_broken_seq: result?.first_broken ?? null,
      broken_row_id: result?.broken_id ?? null,
      expected_hash: result?.expected_hash ?? null,
      actual_hash: result?.actual_hash ?? null,
      verified_at: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[sentinel-verify-chain] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/sentinel-command/verify-chain')
