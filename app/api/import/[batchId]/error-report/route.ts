import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'

/**
 * GET /api/import/[batchId]/error-report
 *
 * Download a CSV report of failed/skipped rows for a given import batch.
 * Includes the original source data and the error message for each row.
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

    // Verify batch belongs to tenant
    const { data: batch } = await admin
      .from('import_batches')
      .select('id, file_name, entity_type, source_platform, column_mapping')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 })
    }

    // Fetch failed and skipped records
    const { data: records, error: fetchError } = await admin
      .from('import_records')
      .select('row_number, source_data, status, error_message')
      .eq('batch_id', batchId)
      .eq('tenant_id', auth.tenantId)
      .in('status', ['failed', 'skipped'])
      .order('row_number', { ascending: true })
      .limit(5000)

    if (fetchError) {
      log.error('[error-report] Failed to fetch records', { error_message: fetchError.message })
      return NextResponse.json({ error: 'Failed to fetch error records.' }, { status: 500 })
    }

    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No failed or skipped rows found for this import.' }, { status: 404 })
    }

    // Build CSV
    // Collect all source data keys across all rows to build a consistent header
    const sourceKeys = new Set<string>()
    for (const rec of records) {
      const data = rec.source_data as Record<string, unknown> | null
      if (data) {
        for (const key of Object.keys(data)) {
          if (!key.startsWith('__')) {
            sourceKeys.add(key)
          }
        }
      }
    }

    const sortedKeys = Array.from(sourceKeys).sort()
    const headers = ['Row', 'Status', 'Error', ...sortedKeys]

    const csvRows: string[] = [headers.map(escapeCSV).join(',')]

    for (const rec of records) {
      const data = (rec.source_data as Record<string, unknown>) ?? {}
      const row = [
        String(rec.row_number),
        rec.status,
        rec.error_message ?? '',
        ...sortedKeys.map((key) => {
          const val = data[key]
          return val != null ? String(val) : ''
        }),
      ]
      csvRows.push(row.map(escapeCSV).join(','))
    }

    const csvContent = csvRows.join('\n')
    const fileName = `import-errors-${batch.source_platform}-${batch.entity_type}-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[error-report] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export const GET = withTiming(handleGet, 'GET /api/import/[batchId]/error-report')
