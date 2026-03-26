import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/matters/[id]/financial-clearance
 *
 * Financial Kill-Switch — calls the Postgres RPC `check_financial_clearance`
 * which computes outstanding balance and unallocated trust funds entirely
 * in the database. No frontend calculations.
 *
 * Returns: { cleared, outstanding_cents, unallocated_cents, trust_balance_cents,
 *            total_billed_cents, blockers[] }
 *
 * Auth: Sentinel 403 — authenticateRequest() + requirePermission('billing', 'view')
 * Tenant isolation enforced both here AND inside the RPC (via auth.uid()).
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params

    // ── Sentinel 403: Auth + Permission ───────────────────────────────────
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    // Use the user-scoped client so the RPC has access to auth.uid()
    // for its internal Sentinel tenant isolation check.
    const supabase = await createServerSupabaseClient()

    // ── Call the Postgres RPC ──────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('check_financial_clearance', {
      p_matter_id: matterId,
    })

    if (error) {
      // Handle Sentinel-style error codes from the RPC
      if (error.message?.includes('P0403') || error.message?.includes('cross-tenant')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 },
        )
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('[financial-clearance] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/financial-clearance')
