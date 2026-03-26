import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCSVForLeadImport } from '@/lib/services/bulk-lead-import/parse-engine'
import { writeToStaging, runGatekeeperOnStaging } from '@/lib/services/bulk-lead-import/staging-engine'

/**
 * POST /api/leads/import/[batchId]/validate
 *
 * Accept column mapping, parse CSV with mapping, write to staging,
 * then kick off async gatekeeper validation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { columnMapping, sourceTag, campaignTag } = body

    const admin = createAdminClient()

    // Verify batch belongs to tenant (lean: 3 columns)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchErr } = await (admin as any)
      .from('import_batches')
      .select('id, tenant_id, file_path')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    // Download CSV from storage
    const { data: fileData } = await admin.storage.from('import-files').download(batch.file_path)
    if (!fileData) {
      return NextResponse.json({ success: false, error: 'Import file not found in storage' }, { status: 404 })
    }

    const csvContent = await fileData.text()

    // Parse with column mapping
    const { rows, totalRows } = parseCSVForLeadImport(csvContent, columnMapping)

    // Write to staging (synchronous  -  fast)
    await writeToStaging({
      supabase: admin,
      tenantId: auth.tenantId,
      batchId,
      rows,
      sourceTag,
      campaignTag,
    })

    // Fire-and-forget: run gatekeeper asynchronously
    runGatekeeperOnStaging({
      supabase: admin,
      tenantId: auth.tenantId,
      batchId,
    }).catch((err) => {
      console.error('[bulk-import] Gatekeeper failed:', err)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(admin as any)
        .from('import_batches')
        .update({ status: 'error', gatekeeper_summary: { phase: 'error', error: String(err) } })
        .eq('id', batchId)
    })

    return NextResponse.json({
      success: true,
      batchId,
      status: 'validating',
      totalRows,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
