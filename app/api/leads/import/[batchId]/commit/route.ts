import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { commitStagingToLeads } from '@/lib/services/bulk-lead-import/commit-engine'

/**
 * POST /api/leads/import/[batchId]/commit
 *
 * Commit approved staging rows into real leads + contacts.
 * Body: { pipelineId, stageId, defaultMatterTypeId? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { pipelineId, stageId, defaultMatterTypeId } = body

    if (!pipelineId || !stageId) {
      return NextResponse.json(
        { success: false, error: 'pipelineId and stageId are required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Verify batch belongs to tenant and is ready
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchErr } = await (admin as any)
      .from('import_batches')
      .select('id, status')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    if (batch.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: `Batch is not ready for commit (status: ${batch.status})` },
        { status: 400 }
      )
    }

    // Fire-and-forget: commit asynchronously
    commitStagingToLeads({
      supabase: admin,
      tenantId: auth.tenantId,
      batchId,
      userId: auth.userId,
      pipelineId,
      stageId,
      defaultMatterTypeId,
    }).catch((err) => {
      console.error('[bulk-import] Commit failed:', err)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(admin as any)
        .from('import_batches')
        .update({
          status: 'error',
          gatekeeper_summary: { phase: 'error', error: String(err) },
        })
        .eq('id', batchId)
    })

    return NextResponse.json({
      success: true,
      batchId,
      status: 'committing',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Commit failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
