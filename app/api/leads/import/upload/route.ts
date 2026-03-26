import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCSVPreview, autoMapLeadColumns } from '@/lib/services/bulk-lead-import/parse-engine'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * POST /api/leads/import/upload
 *
 * Upload a CSV file for bulk lead import.
 * Parses headers, auto-maps columns, stores file, creates batch record.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const importSourceId = formData.get('importSourceId') as string | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') {
      return NextResponse.json({ success: false, error: 'Only CSV files are supported' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File exceeds 10 MB limit' }, { status: 400 })
    }

    const csvContent = await file.text()
    if (!csvContent.trim()) {
      return NextResponse.json({ success: false, error: 'File is empty' }, { status: 400 })
    }

    // Parse preview
    const { headers, preview, totalRows } = parseCSVPreview(csvContent)
    const suggestedMapping = autoMapLeadColumns(headers)
    const mappedKeys = new Set(Object.values(suggestedMapping))
    const unmappedHeaders = headers.filter((h) => !suggestedMapping[h])

    const admin = createAdminClient()

    // Store file in Supabase Storage
    const storagePath = `lead-imports/${auth.tenantId}/${Date.now()}_${file.name}`
    await admin.storage.from('import-files').upload(storagePath, csvContent, {
      contentType: 'text/csv',
    })

    // Create import batch record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchErr } = await (admin as any)
      .from('import_batches')
      .insert({
        tenant_id: auth.tenantId,
        created_by: auth.userId,
        source_platform: 'csv_lead_import',
        entity_type: 'lead_bulk',
        status: 'pending_mapping',
        file_name: file.name,
        file_path: storagePath,
        total_rows: totalRows,
        import_source_id: importSourceId ?? null,
        gatekeeper_summary: { total: totalRows, processed: 0, phase: 'uploading' },
      })
      .select('id')
      .single()

    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Failed to create import batch' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      headers,
      suggestedMapping,
      unmappedHeaders,
      missingRequired: ['first_name', 'last_name', 'email'].filter((k) => !mappedKeys.has(k)),
      totalRows,
      preview,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
