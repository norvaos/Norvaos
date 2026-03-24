/**
 * POST /api/matters/[id]/submission-package
 *
 * Assembles a complete submission package (IRCC forms + documents)
 * into a single PDF for download.
 *
 * Requires authenticated staff user with matter access.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assembleSubmissionPackage } from '@/lib/services/packet-assembler'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: matterId } = await context.params
  const admin = createAdminClient()

  try {
    // 1. Verify matter exists and get tenant
    const { data: matter, error: matterError } = await admin
      .from('matters')
      .select('id, tenant_id, title, matter_number')
      .eq('id', matterId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // 2. Assemble package
    const result = await assembleSubmissionPackage(
      matterId,
      matter.tenant_id,
      admin,
    )

    // 3. Upload to Supabase storage
    const fileName = `${matter.matter_number ?? matterId}_submission_package_${Date.now()}.pdf`
    const storagePath = `${matter.tenant_id}/submission-packages/${matterId}/${fileName}`

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, result.pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload package', detail: uploadError.message },
        { status: 500 },
      )
    }

    // 4. Generate signed download URL (1 hour expiry)
    const { data: signedUrl } = await admin.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)

    return NextResponse.json({
      success: true,
      downloadUrl: signedUrl?.signedUrl ?? null,
      storagePath,
      fileName,
      totalPages: result.totalPages,
      formsIncluded: result.formsIncluded,
      documentsIncluded: result.documentsIncluded,
      assembledAt: result.assembledAt,
      items: result.items,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Assembly failed', detail: message },
      { status: 500 },
    )
  }
}
