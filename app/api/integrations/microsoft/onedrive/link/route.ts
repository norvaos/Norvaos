import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkOneDriveFile } from '@/lib/services/microsoft-onedrive'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/integrations/microsoft/onedrive/link
 *
 * Links a OneDrive file to a NorvaOS document record.
 * Body: { oneDriveItemId, matterId?, contactId?, category? }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()
    const body = await request.json()

    if (!body.oneDriveItemId) {
      return NextResponse.json({ error: 'oneDriveItemId is required' }, { status: 400 })
    }

    const { data: conn } = await admin
      .from('microsoft_connections')
      .select('id, onedrive_enabled')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    if (!conn || !conn.onedrive_enabled) {
      return NextResponse.json({ error: 'OneDrive is not enabled' }, { status: 403 })
    }

    const document = await linkOneDriveFile(conn.id, admin, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      oneDriveItemId: body.oneDriveItemId,
      matterId: body.matterId,
      contactId: body.contactId,
      category: body.category,
    })

    return NextResponse.json({ data: document })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[onedrive/link] Error:', error)
    return NextResponse.json({ error: 'Failed to link file' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/integrations/microsoft/onedrive/link')
