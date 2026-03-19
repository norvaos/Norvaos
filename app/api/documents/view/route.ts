import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/documents/view?path=...&bucket=...
 *
 * Streams a document from Supabase Storage through the server.
 * Uses admin client to bypass storage RLS, then verifies the caller
 * owns the document via tenant-scoped RLS on the documents table.
 *
 * Returns the file with correct Content-Type so it renders inline
 * in iframes (PDFs) and img tags (images) without X-Frame-Options issues.
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'view')

    const { searchParams } = new URL(request.url)
    const storagePath = searchParams.get('path')
    const bucket = searchParams.get('bucket') || 'documents'

    if (!storagePath) {
      return NextResponse.json(
        { error: 'path query parameter is required' },
        { status: 400 }
      )
    }

    // Verify the document belongs to the caller's tenant
    const { data: doc, error: docError } = await auth.supabase
      .from('documents')
      .select('id, file_type, file_name')
      .eq('storage_path', storagePath)
      .eq('tenant_id', auth.tenantId)
      .limit(1)
      .maybeSingle()

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    // Download via admin client (bypasses storage RLS).
    // Strip bucket prefix from path if it was stored with it (e.g. "documents/a/b.pdf" → "a/b.pdf")
    const downloadPath = storagePath.startsWith(`${bucket}/`)
      ? storagePath.slice(bucket.length + 1)
      : storagePath

    const adminSupabase = createAdminClient()
    const { data, error: downloadError } = await adminSupabase.storage
      .from(bucket)
      .download(downloadPath)

    if (downloadError || !data) {
      console.error('Storage download error:', downloadError)
      return NextResponse.json(
        { error: 'Failed to retrieve document from storage' },
        { status: 500 }
      )
    }

    // Stream the file back with correct content type
    const contentType = doc.file_type || 'application/octet-stream'
    const arrayBuffer = await data.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document view error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/documents/view')
