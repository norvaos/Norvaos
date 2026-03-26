import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/leads/import/[batchId]/discard
 *
 * Discard an import batch  -  deletes staging rows and marks batch as discarded.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const admin = createAdminClient()

    // Verify batch ownership and not already committed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchErr } = await (admin as any)
      .from('import_batches')
      .select('id, status, file_path')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    if (batch.status === 'committed') {
      return NextResponse.json(
        { success: false, error: 'Cannot discard a committed batch' },
        { status: 400 }
      )
    }

    // Delete staging rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('lead_import_staging')
      .delete()
      .eq('batch_id', batchId)

    // Delete file from storage
    if (batch.file_path) {
      await admin.storage.from('import-files').remove([batch.file_path])
    }

    // Mark batch as discarded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('import_batches')
      .update({ status: 'discarded' })
      .eq('id', batchId)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discard failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
