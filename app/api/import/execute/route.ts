import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { executeImportSchema } from '@/lib/schemas/data-import'
import { executeImport } from '@/lib/services/import/import-engine'
import { executeApiImport } from '@/lib/services/import/api-import-engine'
import { logAuditServer } from '@/lib/queries/audit-logs'
import type { SourcePlatform, ImportEntityType, DuplicateStrategy, ColumnMapping } from '@/lib/services/import/types'

/**
 * POST /api/import/execute
 *
 * Execute the import for a validated batch.
 * Starts processing and returns immediately.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = executeImportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { batchId, duplicateStrategy } = parsed.data

    // Fetch batch
    const { data: batch } = await admin
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 })
    }

    const isApiMode = (batch as Record<string, unknown>).import_mode === 'api'

    // API batches can start from 'pending', 'validating', or 'paused'; CSV batches require 'validating' or 'paused'
    const allowedStatuses = isApiMode ? ['pending', 'validating', 'paused'] : ['validating', 'paused']
    if (!allowedStatuses.includes(batch.status)) {
      return NextResponse.json(
        { error: `Cannot execute a batch with status "${batch.status}".${isApiMode ? '' : ' Validate first.'}` },
        { status: 400 },
      )
    }

    // Update duplicate strategy
    await admin
      .from('import_batches')
      .update({
        duplicate_strategy: duplicateStrategy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    // Audit log
    logAuditServer({
      supabase: admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'import_batch',
      entityId: batchId,
      action: 'import_execute',
      changes: { platform: batch.source_platform, entityType: batch.entity_type, duplicateStrategy, importMode: isApiMode ? 'api' : 'csv' },
    }).catch(() => {})

    if (isApiMode) {
      // API import: rows already stored as JSON in storage
      executeApiImport({
        admin,
        tenantId: auth.tenantId,
        userId: auth.userId,
        batchId,
        platform: batch.source_platform as SourcePlatform,
        entityType: batch.entity_type as ImportEntityType,
        columnMapping: (batch.column_mapping ?? {}) as ColumnMapping,
        duplicateStrategy: duplicateStrategy as DuplicateStrategy,
      }).catch((err) => {
        log.error('[import-execute] API background execution failed', {
          tenant_id: auth.tenantId,
          batch_id: batchId,
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
      })
    } else {
      // CSV import: fetch CSV from storage
      let csvContent: string | null = null
      if (batch.storage_path) {
        const { data: fileData } = await admin.storage
          .from('import-files')
          .download(batch.storage_path)
        if (fileData) {
          csvContent = await fileData.text()
        }
      }

      if (!csvContent) {
        return NextResponse.json(
          { error: 'CSV file not found in storage. Please re-upload.' },
          { status: 400 },
        )
      }

      executeImport({
        admin,
        tenantId: auth.tenantId,
        userId: auth.userId,
        batchId,
        csvContent,
        platform: batch.source_platform as SourcePlatform,
        entityType: batch.entity_type as ImportEntityType,
        columnMapping: (batch.column_mapping ?? {}) as ColumnMapping,
        duplicateStrategy: duplicateStrategy as DuplicateStrategy,
      }).catch((err) => {
        log.error('[import-execute] CSV background execution failed', {
          tenant_id: auth.tenantId,
          batch_id: batchId,
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
      })
    }

    return NextResponse.json({
      batchId,
      status: 'importing',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-execute] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/import/execute')
