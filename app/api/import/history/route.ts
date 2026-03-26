import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'

/**
 * GET /api/import/history
 *
 * List all import batches for the tenant, newest first.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: batches, error } = await admin
      .from('import_batches')
      .select('id, source_platform, entity_type, status, file_name, total_rows, succeeded_rows, failed_rows, skipped_rows, duplicate_strategy, created_at, completed_at, rolled_back_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      log.error('[import-history] Query error', { error_message: error.message })
      return NextResponse.json({ error: 'Failed to fetch import history.' }, { status: 500 })
    }

    return NextResponse.json({
      batches: (batches ?? []).map((b) => ({
        id: b.id,
        sourcePlatform: b.source_platform,
        entityType: b.entity_type,
        status: b.status,
        fileName: b.file_name,
        totalRows: b.total_rows,
        succeededRows: b.succeeded_rows,
        failedRows: b.failed_rows,
        skippedRows: b.skipped_rows,
        duplicateStrategy: b.duplicate_strategy,
        createdAt: b.created_at,
        completedAt: b.completed_at,
        rolledBackAt: b.rolled_back_at,
      })),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-history] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/import/history')
