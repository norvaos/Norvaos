import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleDelete(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'documents', 'delete')

    const body = await request.json()
    const { id, storagePath } = body as { id: string; storagePath: string }

    if (!id) {
      return NextResponse.json(
        { error: 'Document id is required' },
        { status: 400 }
      )
    }

    // Verify document belongs to tenant
    const { data: doc, error: docError } = await admin
      .from('documents')
      .select('id, file_name, matter_id')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Delete from storage using admin client (storage RLS blocks client-side deletes)
    // Skip for OneDrive documents (empty storagePath)  -  we only remove the NorvaOS
    // record, not the file from OneDrive (it may be shared or modified externally)
    const adminSupabase = createAdminClient()
    if (storagePath && storagePath.length > 0) {
      const { error: storageError } = await adminSupabase.storage
        .from('documents')
        .remove([storagePath])

      if (storageError) {
        console.error('Storage delete error:', storageError)
        // Continue to delete the DB record even if storage fails  - 
        // orphaned storage files are less harmful than orphaned DB records
      }
    }

    // Delete document record (RLS-scoped)
    const { error: deleteError } = await admin
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete document record', details: deleteError.message },
        { status: 500 }
      )
    }

    // Audit log
    await logAuditServer({
      supabase: admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'document',
      entityId: id,
      action: 'document_deleted',
      changes: { file_name: doc.file_name, storage_path: storagePath },
      metadata: { matter_id: doc.matter_id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const DELETE = withTiming(handleDelete, 'DELETE /api/documents/delete')
