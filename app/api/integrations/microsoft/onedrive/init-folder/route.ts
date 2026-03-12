import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureNorvaOSRootFolder } from '@/lib/services/microsoft-onedrive'

/**
 * POST /api/integrations/microsoft/onedrive/init-folder
 *
 * Manually triggers creation of the NorvaOS root folder in OneDrive.
 * Useful if the auto-creation during OAuth callback didn't complete.
 */
export async function POST() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const adminSupabase = createAdminClient()

    // Get the user's active Microsoft connection
    const { data: conn, error: connError } = await adminSupabase
      .from('microsoft_connections')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    if (connError || !conn) {
      return NextResponse.json(
        { error: 'No active Microsoft connection found' },
        { status: 404 }
      )
    }

    const folderId = await ensureNorvaOSRootFolder(conn.id, adminSupabase)

    return NextResponse.json({
      success: true,
      folderId,
      message: 'NorvaOS folder created/found in OneDrive',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('[onedrive/init-folder] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
