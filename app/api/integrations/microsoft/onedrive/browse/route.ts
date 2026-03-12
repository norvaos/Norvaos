import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { browseOneDrive } from '@/lib/services/microsoft-onedrive'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/microsoft/onedrive/browse?path=Documents/Clients
 *
 * Lists files and folders in the user's OneDrive.
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path') || undefined

    // Get user's active connection
    const { data: conn } = await admin
      .from('microsoft_connections')
      .select('id, onedrive_enabled')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    if (!conn) {
      return NextResponse.json({ error: 'No active Microsoft connection' }, { status: 404 })
    }

    if (!conn.onedrive_enabled) {
      return NextResponse.json({ error: 'OneDrive is not enabled' }, { status: 403 })
    }

    const items = await browseOneDrive(conn.id, admin, path)
    return NextResponse.json({ data: items })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[onedrive/browse] Error:', error)
    return NextResponse.json({ error: 'Failed to browse OneDrive' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/onedrive/browse')
