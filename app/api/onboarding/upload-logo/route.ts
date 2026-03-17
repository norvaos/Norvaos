import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { withTiming } from '@/lib/middleware/request-timing'

const BUCKET = 'firm-assets'
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * POST /api/onboarding/upload-logo
 *
 * Accepts a multipart/form-data file upload and stores it in the
 * "firm-assets" Supabase Storage bucket.
 *
 * Returns: { url: string }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File must be under 2 MB.' }, { status: 413 })
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPG, SVG, or WebP files are accepted.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${auth.tenantId}/logo-${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    const storage = createServiceRoleClient()

    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType:  file.type,
        upsert:       true,
        cacheControl: '31536000',
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = storage.storage
      .from(BUCKET)
      .getPublicUrl(path)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/upload-logo')
