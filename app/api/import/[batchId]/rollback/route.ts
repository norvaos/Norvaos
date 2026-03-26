import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { rollbackBatch } from '@/lib/services/import/rollback-engine'
import { logAuditServer } from '@/lib/queries/audit-logs'

/**
 * POST /api/import/[batchId]/rollback
 *
 * Roll back an entire import batch.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const { batchId } = await params

    // Verify batch exists and is rollback-eligible
    const { data: batch } = await admin
      .from('import_batches')
      .select('id, status, source_platform, entity_type')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 })
    }

    if (batch.status !== 'completed' && batch.status !== 'completed_with_errors') {
      return NextResponse.json(
        { error: `Cannot roll back a batch with status "${batch.status}".` },
        { status: 400 },
      )
    }

    const result = await rollbackBatch(admin, auth.tenantId, batchId, auth.userId)

    // Audit log  -  batch-level rollback event (per-matter events written by rollback-engine)
    logAuditServer({
      supabase: admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'import_batch',
      entityId: batchId,
      action: 'import_rollback',
      changes: {
        platform: batch.source_platform,
        entityType: batch.entity_type,
        rolledBackCount: result.rolledBackCount,
      },
    }).catch(() => {})

    return NextResponse.json({
      batchId,
      status: 'rolled_back',
      rolledBackCount: result.rolledBackCount,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-rollback] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/import/[batchId]/rollback')
