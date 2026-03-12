import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: connection } = await admin
      .from('platform_connections')
      .select('id, platform_user_id, platform_user_name, location_id, is_active, error_count, last_error, created_at')
      .eq('tenant_id', auth.tenantId)
      .eq('platform', 'ghl')
      .eq('is_active', true)
      .single()

    return NextResponse.json({ data: connection || null })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[ghl/status] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/ghl/status')
