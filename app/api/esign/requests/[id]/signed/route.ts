import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'

// ── GET /api/esign/requests/[id]/signed ──────────────────────────────────────
// Downloads the signed PDF for a completed signing request.

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

  const { supabase, tenantId } = auth

  try {
    // 1. Fetch the signing request
    const { data: signingRequest, error: reqErr } = await supabase
      .from('signing_requests' as never)
      .select('*' as never)
      .eq('id' as never, id)
      .eq('tenant_id' as never, tenantId)
      .single()

    if (reqErr || !signingRequest) {
      return NextResponse.json(
        { error: 'Signing request not found' },
        { status: 404 },
      )
    }

    const req = signingRequest as Record<string, unknown>

    // 2. Validate status is signed
    if (req.status !== 'signed') {
      return NextResponse.json(
        { error: 'Document has not been signed yet' },
        { status: 400 },
      )
    }

    // 3. Check for signed document path
    if (!req.signed_document_path) {
      return NextResponse.json(
        { error: 'Signed document not available' },
        { status: 404 },
      )
    }

    // 4. Download from Supabase storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('documents')
      .download(req.signed_document_path as string)

    if (downloadErr || !fileData) {
      console.error('Signed document download error:', downloadErr)
      return NextResponse.json(
        { error: 'Failed to download signed document' },
        { status: 500 },
      )
    }

    // 5. Return the PDF
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
    console.error('E-sign signed document download error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = handleGet
