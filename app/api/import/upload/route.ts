import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { uploadImportSchema } from '@/lib/schemas/data-import'
import { validateCSVFile, parseCSVPreview, autoMapColumns } from '@/lib/services/import/csv-parser'
import { getAdapter } from '@/lib/services/import/adapters'
import { logAuditServer } from '@/lib/queries/audit-logs'
import type { SourcePlatform, ImportEntityType } from '@/lib/services/import/types'
import type { Json } from '@/lib/types/database'

/**
 * POST /api/import/upload
 *
 * Upload a CSV file to start an import.
 * Creates an import_batches record, stores the CSV, and returns auto-mapped columns.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const platform = formData.get('platform') as string
    const entityType = formData.get('entityType') as string

    // Validate platform and entityType
    const parsed = uploadImportSchema.safeParse({ platform, entityType })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid platform or entity type.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const fileError = validateCSVFile({ name: file.name, size: file.size })
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 })
    }

    // Read file content
    const csvContent = await file.text()
    if (!csvContent.trim()) {
      return NextResponse.json({ error: 'CSV file is empty.' }, { status: 400 })
    }

    // Parse preview
    const preview = parseCSVPreview(csvContent, 5)
    if (preview.headers.length === 0) {
      return NextResponse.json({ error: 'Could not detect CSV headers.' }, { status: 400 })
    }

    // Get adapter and auto-map columns
    const adapter = getAdapter(parsed.data.platform as SourcePlatform)
    const entityAdapter = adapter.getEntityAdapter(parsed.data.entityType as ImportEntityType)
    if (!entityAdapter) {
      return NextResponse.json({ error: `Entity type "${entityType}" not supported for ${adapter.displayName}.` }, { status: 400 })
    }

    const autoMap = autoMapColumns(preview.headers, entityAdapter.fieldMappings)

    // Store CSV in Supabase Storage
    const storagePath = `imports/${auth.tenantId}/${crypto.randomUUID()}.csv`
    const { error: storageError } = await admin.storage
      .from('import-files')
      .upload(storagePath, csvContent, {
        contentType: 'text/csv',
        upsert: false,
      })

    // If storage bucket doesn't exist or fails, store content reference but continue
    if (storageError) {
      log.warn('[import-upload] Storage upload failed, CSV will need re-upload for execute', {
        tenant_id: auth.tenantId,
        error_message: storageError.message,
      })
    }

    // Create batch record
    const { data: batch, error: batchError } = await admin
      .from('import_batches')
      .insert({
        tenant_id: auth.tenantId,
        source_platform: parsed.data.platform,
        entity_type: parsed.data.entityType,
        file_name: file.name,
        file_size_bytes: file.size,
        storage_path: storageError ? null : storagePath,
        total_rows: preview.totalRows,
        column_mapping: autoMap.mapped as unknown as Json,
        created_by: auth.userId,
      })
      .select('id')
      .single()

    if (batchError || !batch) {
      return NextResponse.json({ error: 'Failed to create import batch.' }, { status: 500 })
    }

    // Audit log
    logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'import_batch',
      entityId: batch.id,
      action: 'import_upload',
      changes: { platform, entityType, fileName: file.name, totalRows: preview.totalRows },
    }).catch(() => {})

    return NextResponse.json({
      batchId: batch.id,
      detectedHeaders: preview.headers,
      suggestedMapping: autoMap.mapped,
      unmappedHeaders: autoMap.unmapped,
      missingRequired: autoMap.missingRequired,
      totalRows: preview.totalRows,
      previewRows: preview.rows.slice(0, 5),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-upload] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/import/upload')
