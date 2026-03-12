import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToOneDrive, linkOneDriveFile } from '@/lib/services/microsoft-onedrive'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/integrations/microsoft/onedrive/upload
 *
 * Uploads a local file to OneDrive and creates a linked document record.
 * Expects multipart/form-data with: file, folderPath?, matterId?, contactId?, category?
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
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

    const folderPath = formData.get('folderPath') as string | null
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Upload to OneDrive
    const { oneDriveItemId } = await uploadToOneDrive(conn.id, admin, {
      file: fileBuffer,
      fileName: file.name,
      folderPath: folderPath || undefined,
    })

    // Link the uploaded file as a document
    const document = await linkOneDriveFile(conn.id, admin, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      oneDriveItemId,
      matterId: (formData.get('matterId') as string) || undefined,
      contactId: (formData.get('contactId') as string) || undefined,
      category: (formData.get('category') as string) || undefined,
    })

    return NextResponse.json({ data: document })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[onedrive/upload] Error:', error)
    return NextResponse.json({ error: 'Failed to upload to OneDrive' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/integrations/microsoft/onedrive/upload')
