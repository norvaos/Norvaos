import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/auth/me
 *
 * Returns the current user's tenant data for the TenantProvider.
 * Uses the admin client to bypass RLS  -  the authenticateRequest() call
 * already validates the session and resolves the tenant.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const { data: tenant, error } = await admin
      .from('tenants')
      .select('*')
      .eq('id', auth.tenantId)
      .single()

    if (error || !tenant) {
      return NextResponse.json(
        { error: 'Failed to load tenant' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: tenant })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/auth/me')
