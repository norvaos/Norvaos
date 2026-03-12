import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkUploadRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/kiosk/[token]/id-scan
 *
 * Upload ID scan image to restricted storage bucket.
 *
 * Rule #9: ID scans are highly sensitive.
 *   - Private storage bucket (service-role only)
 *   - check_ins:view for short-lived signed URLs
 *   - Every view logged
 *   - Auto-retention (90 days default) enforced before production
 *
 * Accepts multipart/form-data with 'file' and 'sessionId'.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Rate limit: 5 req/min per token+IP (strict for file uploads)
    const rateLimitResponse = checkUploadRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    // 1. Validate kiosk token
    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    // 2. Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const sessionId = formData.get('sessionId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // 3. Validate file
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: JPEG, PNG, WebP, HEIC.' },
        { status: 400 },
      )
    }

    // 4. Verify session belongs to tenant
    const { data: session } = await admin
      .from('check_in_sessions')
      .select('id, metadata')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 5. Upload to private 'id-scans' bucket (service-role only)
    //    Auto-create the bucket if it doesn't exist (first-use provisioning)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const filePath = `${tenantId}/${sessionId}/id-scan-${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Ensure the id-scans bucket exists (auto-provision on first upload)
    const { data: buckets } = await admin.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === 'id-scans')
    if (!bucketExists) {
      const { error: createBucketErr } = await admin.storage.createBucket('id-scans', {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      })
      if (createBucketErr) {
        log.error('[kiosk-id-scan] Failed to create id-scans bucket', {
          error_message: createBucketErr.message,
          tenant_id: tenantId,
        })
        return NextResponse.json(
          { error: 'ID scan storage not configured. Please contact your administrator.' },
          { status: 503 },
        )
      }
      log.info('[kiosk-id-scan] Auto-created id-scans storage bucket')
    }

    const { data: uploadData, error: uploadErr } = await admin
      .storage
      .from('id-scans')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      log.error('[kiosk-id-scan] Upload error', {
        error_message: uploadErr.message,
        session_id: sessionId,
        tenant_id: tenantId,
      })

      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
    }

    // 6. Update session with scan path
    const metadata = (session.metadata ?? {}) as Record<string, unknown>

    await admin
      .from('check_in_sessions')
      .update({
        id_scan_path: uploadData.path,
        id_scan_uploaded_at: new Date().toISOString(),
        current_step: 'id_scanned',
        metadata: {
          ...metadata,
          id_scan_file_type: file.type,
          id_scan_file_size: file.size,
        } as unknown as Json,
      })
      .eq('id', sessionId)

    log.info('[kiosk-id-scan] ID scan uploaded', {
      session_id: sessionId,
      tenant_id: tenantId,
      file_size: file.size,
    })

    return NextResponse.json({
      success: true,
      scanPath: uploadData.path,
    })
  } catch (error) {
    log.error('[kiosk-id-scan] Unexpected error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/kiosk/[token]/id-scan')
