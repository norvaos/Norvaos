import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCSV } from '@/lib/services/import/csv-parser'
import { validateRows } from '@/lib/services/import/validation-engine'
import { getAdapter } from '@/lib/services/import/adapters'
import type { SourcePlatform, ImportEntityType } from '@/lib/services/import/types'

/**
 * GET /api/import/validate/errors?batchId=xxx
 *
 * Returns a CSV file of all invalid rows with their error messages,
 * so the user can fix them and re-import.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')
    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 })
    }

    const { data: batch } = await admin
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch || !batch.storage_path) {
      return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
    }

    const adapter = getAdapter(batch.source_platform as SourcePlatform)
    const entityAdapter = adapter.getEntityAdapter(batch.entity_type as ImportEntityType)
    if (!entityAdapter) {
      return NextResponse.json({ error: 'Entity adapter not found.' }, { status: 400 })
    }

    const { data: fileData } = await admin.storage
      .from('import-files')
      .download(batch.storage_path)

    if (!fileData) {
      return NextResponse.json({ error: 'Could not load import data.' }, { status: 500 })
    }

    const fileContent = await fileData.text()
    const columnMapping = (batch.column_mapping ?? {}) as Record<string, string>

    let rows: Record<string, string>[]
    if (batch.import_mode === 'api') {
      rows = JSON.parse(fileContent)
    } else {
      rows = parseCSV(fileContent).rows
    }

    const { invalidRows } = validateRows(rows, columnMapping, entityAdapter)

    if (invalidRows.length === 0) {
      return NextResponse.json({ error: 'No invalid rows found.' }, { status: 404 })
    }

    // Build CSV  -  original row data + error_reason column
    const allKeys = Array.from(
      new Set(invalidRows.flatMap((r) => Object.keys(r.data as Record<string, unknown>)))
    ).filter((k) => !k.startsWith('__'))

    const header = [...allKeys, 'error_reason'].join(',')
    const csvRows = invalidRows.map((row) => {
      const data = row.data as Record<string, unknown>
      const values = allKeys.map((k) => {
        const v = String(data[k] ?? '')
        return v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"`
          : v
      })
      const reason = row.errors.map((e) => e.message).join('; ')
      values.push(`"${reason.replace(/"/g, '""')}"`)
      return values.join(',')
    })

    const csv = [header, ...csvRows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="import-errors-${batchId.slice(0, 8)}.csv"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
