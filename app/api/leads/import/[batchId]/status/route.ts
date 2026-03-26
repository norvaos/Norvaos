import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/leads/import/[batchId]/status
 *
 * Poll gatekeeper progress for a batch.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')

    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error } = await (admin as any)
      .from('import_batches')
      .select('id, status, total_rows, file_name, gatekeeper_summary, created_at')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (error || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, batch })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch status'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
