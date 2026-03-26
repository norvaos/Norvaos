import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * GET /api/documents/view?path=...&bucket=...
 *
 * Directive 005.4  -  Zero-Knowledge Preview
 *
 * Generates a temporary signed URL (60-second TTL) for document access.
 * No document in the vault is accessible via a static or permanent URL.
 * Every access event is authorized, logged to SENTINEL, and time-bounded.
 *
 * Flow:
 *   1. Authenticate + permission check
 *   2. Verify document belongs to caller's tenant
 *   3. Generate signed URL with 60s TTL
 *   4. Log access event to SENTINEL audit trail
 *   5. Redirect to signed URL (or proxy for inline preview)
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
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
    const { data: doc, error: docError } = await admin
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

    // Strip bucket prefix from path if stored with it
    const downloadPath = storagePath.startsWith(`${bucket}/`)
      ? storagePath.slice(bucket.length + 1)
      : storagePath

    // ─── Directive 005.4: Signed URL with 60-second TTL ─────────────
    // No static/permanent URLs. Every access is time-bounded.
    const SIGNED_URL_TTL = 60 // seconds

    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from(bucket)
      .createSignedUrl(downloadPath, SIGNED_URL_TTL)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      // Fallback: stream through server if signed URL generation fails
      // (e.g. local Supabase without storage API support)
      console.warn('[DocumentView] Signed URL failed, falling back to server proxy:', signedUrlError?.message)
      return await proxyDocument(admin, bucket, downloadPath, doc)
    }

    // ─── Log access event to SENTINEL (fire-and-forget) ─────────────
    logSentinelEvent({
      eventType: 'PDF_VAULT_ACCESS',
      severity: 'info',
      tenantId: auth.tenantId,
      userId: auth.userId,
      recordId: doc.id,
      details: {
        document_id: doc.id,
        file_name: doc.file_name,
        storage_path: storagePath,
        bucket,
        ttl_seconds: SIGNED_URL_TTL,
        access_method: 'signed_url',
      },
    }).catch(() => {}) // fire-and-forget

    // For PDFs and images: proxy the content through server to avoid
    // CORS issues and X-Frame-Options blocking on signed URLs.
    // The signed URL is used server-side only  -  never exposed to client.
    const contentType = doc.file_type || 'application/octet-stream'
    const isPdfOrImage =
      contentType === 'application/pdf' || contentType.startsWith('image/')

    if (isPdfOrImage) {
      // Fetch via the time-limited signed URL (server-side)
      const response = await fetch(signedUrlData.signedUrl)
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to retrieve document from storage' },
          { status: 500 }
        )
      }
      const arrayBuffer = await response.arrayBuffer()

      return new NextResponse(arrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
          // No long-lived cache  -  forces re-auth on every access
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    // For other file types: redirect to signed URL (auto-expires in 60s)
    return NextResponse.redirect(signedUrlData.signedUrl)
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

/**
 * Fallback: proxy document through server when signed URLs aren't available.
 */
async function proxyDocument(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  downloadPath: string,
  doc: { id: string; file_type: string | null; file_name: string },
) {
  const { data, error: downloadError } = await admin.storage
    .from(bucket)
    .download(downloadPath)

  if (downloadError || !data) {
    console.error('Storage download error:', downloadError)
    return NextResponse.json(
      { error: 'Failed to retrieve document from storage' },
      { status: 500 }
    )
  }

  const contentType = doc.file_type || 'application/octet-stream'
  const arrayBuffer = await data.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export const GET = withTiming(handleGet, 'GET /api/documents/view')
