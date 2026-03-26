import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'

/**
 * GET /api/import/[batchId]
 *
 * Get import batch status and progress.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { batchId } = await params

    const { data: batch } = await admin
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 })
    }

    return NextResponse.json({
      batch: {
        id: batch.id,
        sourcePlatform: batch.source_platform,
        entityType: batch.entity_type,
        status: batch.status,
        fileName: batch.file_name,
        totalRows: batch.total_rows,
        processedRows: batch.processed_rows,
        succeededRows: batch.succeeded_rows,
        failedRows: batch.failed_rows,
        skippedRows: batch.skipped_rows,
        duplicateStrategy: batch.duplicate_strategy,
        columnMapping: batch.column_mapping,
        validationErrors: batch.validation_errors,
        importErrors: batch.import_errors,
        startedAt: batch.started_at,
        completedAt: batch.completed_at,
        rolledBackAt: batch.rolled_back_at,
        createdAt: batch.created_at,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-batch] GET error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/import/[batchId]')

/**
 * DELETE /api/import/[batchId]
 *
 * Delete a pending, validating, or failed import batch.
 * Cannot delete imports that are actively importing or already completed.
 */
async function handleDelete(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'manage')
    const admin = createAdminClient()

    const { batchId } = await params

    // Fetch current status
    const { data: batch } = await admin
      .from('import_batches')
      .select('id, status')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 })
    }

    const deletableStatuses = ['pending', 'validating', 'failed']
    if (!deletableStatuses.includes(batch.status)) {
      return NextResponse.json(
        { error: `Cannot delete an import with status "${batch.status}". Only pending, validating, or failed imports can be deleted.` },
        { status: 400 },
      )
    }

    // Delete related records first, then the batch
    await admin
      .from('import_records')
      .delete()
      .eq('batch_id', batchId)

    await admin
      .from('import_batches')
      .delete()
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)

    log.info('[import-batch] Deleted', {
      tenant_id: auth.tenantId,
      batch_id: batchId,
      previous_status: batch.status,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-batch] DELETE error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const DELETE = withTiming(handleDelete, 'DELETE /api/import/[batchId]')
