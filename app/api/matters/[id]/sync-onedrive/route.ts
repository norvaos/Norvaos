import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/sync-onedrive
 *
 * Creates or re-syncs the OneDrive folder structure for an existing matter.
 * Safe to call multiple times  -  idempotent (skips folders already synced).
 *
 * Uses the calling user's Microsoft connection. If the user has no active
 * OneDrive connection, returns 400.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')

    // 1. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, matter_number, title')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found' },
        { status: 404 }
      )
    }

    // 2. Look up the user's Microsoft / OneDrive connection (admin client needed)
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const adminClient = createServiceRoleClient()

    const { data: conn } = await adminClient
      .from('microsoft_connections')
      .select('id, onedrive_enabled')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'No active Microsoft connection found. Connect your account in Settings → Integrations.' },
        { status: 400 }
      )
    }

    if (!conn.onedrive_enabled) {
      return NextResponse.json(
        { success: false, error: 'OneDrive is not enabled on your Microsoft connection. Enable it in Settings → Integrations.' },
        { status: 400 }
      )
    }

    // 3. Ensure the matter folder exists in OneDrive
    const { ensureMatterSubfolder, syncMatterFoldersToOneDrive } =
      await import('@/lib/services/microsoft-onedrive')

    const matterFolder = await ensureMatterSubfolder(conn.id, adminClient, {
      matterId,
      matterNumber: matter.matter_number,
      matterTitle: matter.title,
    })

    // 4. Sync all subfolders from matter_folders → OneDrive
    await syncMatterFoldersToOneDrive(conn.id, adminClient, {
      matterId,
      matterOneDriveFolderId: matterFolder.folderId,
    })

    // 5. Log activity
    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      activity_type: 'onedrive_synced',
      title: 'OneDrive folders synced',
      description: `Folder structure synced to OneDrive at ${matterFolder.folderPath}`,
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: { folder_path: matterFolder.folderPath } as any,
    })

    return NextResponse.json({
      success: true,
      folderPath: matterFolder.folderPath,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('[sync-onedrive] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync OneDrive folders' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/sync-onedrive')

const admin = createAdminClient()