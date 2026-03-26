import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/documents/persist-scan  -  Directive 40.0 §2
 *
 * Persists OCR scan results into a document's ai_extracted_data JSONB column.
 * Called after a scan is completed and user confirms the results.
 *
 * Body: { document_id: string, scan_data: DocumentScanResult }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'update')

    const body = await request.json()
    const { document_id, scan_data } = body

    if (!document_id || !scan_data) {
      return NextResponse.json(
        { error: 'document_id and scan_data are required' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // Verify document belongs to tenant
    const { data: doc, error: docError } = await admin
      .from('documents')
      .select('id, tenant_id')
      .eq('id', document_id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    // Persist scan results
    const aiExtractedData = {
      detected_document_type: scan_data.detected_document_type,
      confidence: scan_data.confidence,
      extracted_fields: scan_data.extracted_fields,
      raw_text_summary: scan_data.raw_text_summary,
      scanned_at: new Date().toISOString(),
      scanned_by: auth.userId,
    }

    const { error: updateError } = await admin
      .from('documents')
      .update({ ai_extracted_data: aiExtractedData })
      .eq('id', document_id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to persist scan data', details: updateError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, document_id })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('[persist-scan] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/persist-scan')
