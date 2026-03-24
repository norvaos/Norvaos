import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { getTaxProfilesWithCodes } from '@/lib/services/billing/tax-calculation.service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── GET /api/billing/tax-profiles ────────────────────────────────────────────

async function handleGet(_request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>
  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { supabase, tenantId, userId } = auth

  const { allowed } = await checkBillingPermission(
    supabase,
    userId,
    tenantId,
    'GET /api/billing/tax-profiles',
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const result = await getTaxProfilesWithCodes(supabase, tenantId)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, taxProfiles: result.data })
}

export const GET = withTiming(handleGet, 'GET /api/billing/tax-profiles')
