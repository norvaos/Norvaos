import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * POST /api/documents/verify-integrity
 *
 * Vault Hashing Tamper Detection — Downloads a document from storage,
 * recomputes its SHA-256, and compares against the stored content_hash.
 * If the hashes don't match, fires a CRITICAL SENTINEL alert.
 *
 * Body: { documentId: string }
 *
 * Returns:
 *   { status: 'verified' | 'tampered' | 'unchecked', ... }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'view')

    const body = await request.json()
    const { documentId } = body as { documentId: string }

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── 1. Fetch document record ─────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docError } = await (supabase as any)
      .from('documents')
      .select('id, content_hash, storage_path, file_name, tenant_id, storage_bucket')
      .eq('id', documentId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!doc.content_hash) {
      return NextResponse.json({
        status: 'unchecked',
        documentId,
        message: 'No content hash recorded (uploaded before vault hashing was enabled)',
      })
    }

    if (!doc.storage_path) {
      return NextResponse.json({
        status: 'unchecked',
        documentId,
        message: 'Document stored externally — cannot verify integrity',
      })
    }

    // ── 2. Download file from storage ────────────────────────────────

    const bucket = doc.storage_bucket || 'documents'
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(doc.storage_path)

    if (downloadError || !fileData) {
      return NextResponse.json({
        status: 'missing',
        documentId,
        message: 'File not found in storage — may have been deleted externally',
      })
    }

    // ── 3. Recompute SHA-256 ─────────────────────────────────────────

    const fileBytes = new Uint8Array(await fileData.arrayBuffer())
    const currentHash = createHash('sha256').update(fileBytes).digest('hex')

    const isTampered = currentHash !== doc.content_hash

    // ── 4. Update tamper status ──────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('documents')
      .update({
        tamper_status: isTampered ? 'tampered' : 'verified',
        hash_verified_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    // ── 5. Fire SENTINEL alert if tampered ───────────────────────────

    if (isTampered) {
      logSentinelEvent({
        eventType: 'DOCUMENT_TAMPER',
        severity: 'critical',
        tenantId: auth.tenantId,
        userId: auth.userId,
        tableName: 'documents',
        recordId: documentId,
        details: {
          file_name: doc.file_name,
          expected_hash: doc.content_hash.slice(0, 16) + '...',
          actual_hash: currentHash.slice(0, 16) + '...',
          alert: 'TAMPER DETECTED: Document content modified outside NorvaOS',
        },
      }).catch(() => {})
    }

    return NextResponse.json({
      status: isTampered ? 'tampered' : 'verified',
      documentId,
      fileName: doc.file_name,
      expectedHash: doc.content_hash.slice(0, 8) + '...',
      actualHash: currentHash.slice(0, 8) + '...',
      verifiedAt: new Date().toISOString(),
      isTampered,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[verify-integrity] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/verify-integrity')
