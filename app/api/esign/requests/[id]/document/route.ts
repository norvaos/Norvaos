import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'

// ── GET /api/esign/requests/[id]/document ────────────────────────────────────
// Downloads the source PDF for a signing request (authenticated users only).

async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let auth: Awaited<ReturnType<typeof authenticateRequest>>

  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  requirePermission(auth, 'documents', 'view')

  const { supabase, tenantId } = auth

  try {
    // 1. Fetch the signing request with its document
    const { data: signingRequest, error: reqErr } = await supabase
      .from('signing_requests' as never)
      .select('*, signing_documents(*)' as never)
      .eq('id' as never, id)
      .eq('tenant_id' as never, tenantId)
      .single()

    if (reqErr || !signingRequest) {
      return NextResponse.json(
        { error: 'Signing request not found' },
        { status: 404 },
      )
    }

    // 2. Extract the document record
    const doc = (signingRequest as Record<string, unknown>).signing_documents as
      | Record<string, unknown>
      | null

    if (!doc || !doc.storage_path) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    // 3. Download from Supabase storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('documents')
      .download(doc.storage_path as string)

    if (downloadErr || !fileData) {
      console.error('Document download error:', downloadErr)
      return NextResponse.json(
        { error: 'Failed to download document' },
        { status: 500 },
      )
    }

    // 4. Return the PDF
    const buffer = Buffer.from(await fileData.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('E-sign document download error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = handleGet
