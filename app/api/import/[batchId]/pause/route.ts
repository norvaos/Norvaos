import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/import/[batchId]/pause
 *
 * Signals the running import to pause after the current batch of rows.
 * Sets pause_requested = true and status = 'pausing'.
 * The import engine checks this flag between every batch of 50 rows.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { batchId } = await params

    const { data: batch } = await admin
      .from('import_batches')
      .select('id, status, tenant_id')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
    }

    if (batch.status !== 'importing') {
      return NextResponse.json(
        { error: `Cannot pause a batch with status "${batch.status}". Only importing batches can be paused.` },
        { status: 400 },
      )
    }

    await admin
      .from('import_batches')
      .update({
        pause_requested: true,
        status: 'pausing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    return NextResponse.json({ batchId, status: 'pausing' })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
