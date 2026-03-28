import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 15 })

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

// ── GET  -  list client-submitted documents ──────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = await limiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Fetch client-submitted documents for this matter
    const { data: docs } = await admin
      .from('documents')
      .select('id, file_name, file_type, file_size, category, description, created_at')
      .eq('matter_id', link.matter_id)
      .eq('category', 'client_submitted')
      .order('created_at', { ascending: false })

    return NextResponse.json({ documents: docs ?? [] })
  } catch (err) {
    console.error('[Client Upload GET] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST  -  upload a new document ───────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = await limiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentName = (formData.get('document_name') as string | null)?.trim()
    const description = (formData.get('description') as string | null)?.trim()

    if (!file || !documentName) {
      return NextResponse.json(
        { error: 'File and document name are required' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10 MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Please upload PDF, images, or Word/Excel documents.' },
        { status: 400 }
      )
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop() ?? 'bin'
    const filePath = `${link.tenant_id}/client-uploads/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Client Upload] Storage error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create document record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docError } = await (admin as any)
      .from('documents')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        file_name: documentName,
        file_type: file.type,
        file_size: file.size,
        storage_path: filePath,
        category: 'client_submitted',
        description: description || `Submitted via client portal: ${documentName}`,
      })
      .select('id, file_name, created_at')
      .single()

    if (docError) {
      console.error('[Client Upload] Document record error:', docError)
      return NextResponse.json({ error: 'Failed to record document' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: doc })
  } catch (err) {
    console.error('[Client Upload POST] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
