import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/import/[batchId]/skipped-report
 *
 * Returns a CSV of all rows that were skipped due to duplicate detection,
 * with the field that matched and the existing contact ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { batchId } = await params

    // Verify batch belongs to this tenant
    const { data: batch } = await admin
      .from('import_batches')
      .select('id, entity_type')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
    }

    // Fetch all skipped records
    const { data: records } = await admin
      .from('import_records')
      .select('row_number, source_data, error_message')
      .eq('batch_id', batchId)
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'skipped')
      .order('row_number', { ascending: true })

    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No skipped rows found.' }, { status: 404 })
    }

    // Collect all field keys from source data
    const allKeys = Array.from(
      new Set(
        records.flatMap((r) =>
          Object.keys((r.source_data as Record<string, unknown>) ?? {}),
        ),
      ),
    ).filter((k) => !k.startsWith('__'))

    const escape = (v: string) =>
      v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v

    const header = [...allKeys, 'duplicate_reason', 'row_number'].join(',')
    const csvRows = records.map((r) => {
      const data = (r.source_data as Record<string, unknown>) ?? {}
      const values = allKeys.map((k) => escape(String(data[k] ?? '')))
      values.push(escape(r.error_message ?? 'Duplicate'))
      values.push(String(r.row_number))
      return values.join(',')
    })

    const csv = [header, ...csvRows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="skipped-duplicates-${batchId.slice(0, 8)}.csv"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
