import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { validateImportSchema } from '@/lib/schemas/data-import'
import { parseCSV } from '@/lib/services/import/csv-parser'
import { validateRows } from '@/lib/services/import/validation-engine'
import { detectDuplicates } from '@/lib/services/import/duplicate-detector'
import { getAdapter } from '@/lib/services/import/adapters'
import type { Json } from '@/lib/types/database'
import type { SourcePlatform, ImportEntityType } from '@/lib/services/import/types'

/**
 * POST /api/import/validate
 *
 * Validate mapped rows and return a preview with errors and duplicates.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = validateImportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { batchId, columnMapping } = parsed.data

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

    if (batch.status !== 'pending' && batch.status !== 'validating') {
      return NextResponse.json(
        { error: `Cannot validate a batch with status "${batch.status}".` },
        { status: 400 },
      )
    }

    // Get adapter
    const adapter = getAdapter(batch.source_platform as SourcePlatform)
    const entityAdapter = adapter.getEntityAdapter(batch.entity_type as ImportEntityType)
    if (!entityAdapter) {
      return NextResponse.json({ error: 'Entity adapter not found.' }, { status: 400 })
    }

    // Fetch CSV from storage or require re-upload
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

    // Parse full CSV
    const parsedCsv = parseCSV(csvContent)

    // Validate rows
    const { validRows, invalidRows, allErrors } = validateRows(
      parsedCsv.rows,
      columnMapping,
      entityAdapter,
    )

    // Detect duplicates
    const duplicates = await detectDuplicates(
      admin,
      auth.tenantId,
      batch.entity_type as ImportEntityType,
      validRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
    )

    // Update batch with column mapping and status
    await admin
      .from('import_batches')
      .update({
        column_mapping: columnMapping as unknown as Json,
        validation_errors: allErrors.slice(0, 200) as unknown as Json,
        status: 'validating',
        total_rows: parsedCsv.totalRows,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    return NextResponse.json({
      totalRows: parsedCsv.totalRows,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      duplicateRows: duplicates.length,
      errors: allErrors.slice(0, 50),
      duplicates: duplicates.slice(0, 50),
      previewRows: validRows.slice(0, 20).map((r) => ({
        rowNumber: r.rowNumber,
        data: r.data,
        isDuplicate: duplicates.some((d) => d.rowNumber === r.rowNumber),
      })),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-validate] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/import/validate')
