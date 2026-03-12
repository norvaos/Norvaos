import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'

// 30 requests per minute per IP — prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

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

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params
    const admin = createAdminClient()

    // 1. Validate token
    const { data: link, error: linkError } = await admin
      .from('portal_links')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkError || !link) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired portal link' },
        { status: 404 }
      )
    }

    // Check expiry
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This portal link has expired' },
        { status: 410 }
      )
    }

    // 2. Parse FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const checklistItemId = formData.get('checklist_item_id') as string | null

    if (!file || !checklistItemId) {
      return NextResponse.json(
        { success: false, error: 'File and checklist item ID are required' },
        { status: 400 }
      )
    }

    // 3. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10 MB limit' },
        { status: 400 }
      )
    }

    // 4. Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'File type not allowed. Please upload PDF, images, or Word documents.' },
        { status: 400 }
      )
    }

    // 5. Verify checklist item belongs to this matter
    const { data: checklistItem, error: itemError } = await admin
      .from('matter_checklist_items')
      .select('id, matter_id, document_name, category')
      .eq('id', checklistItemId)
      .eq('matter_id', link.matter_id)
      .single()

    if (itemError || !checklistItem) {
      return NextResponse.json(
        { success: false, error: 'Checklist item not found for this matter' },
        { status: 404 }
      )
    }

    // 6. Upload file to Supabase Storage (same path pattern as useUploadDocument)
    const fileExt = file.name.split('.').pop() ?? 'bin'
    const filePath = `${link.tenant_id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Portal file upload error:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // 7. Create document record
    const { data: doc, error: docError } = await admin
      .from('documents')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: filePath,
        category: checklistItem.category || 'general',
        description: `Uploaded via client portal for: ${checklistItem.document_name}`,
      })
      .select('id')
      .single()

    if (docError || !doc) {
      console.error('Portal document record error:', docError)
      return NextResponse.json(
        { success: false, error: 'Failed to record document' },
        { status: 500 }
      )
    }

    // 8. Update checklist item: link document, set status to received
    const { error: updateError } = await admin
      .from('matter_checklist_items')
      .update({
        document_id: doc.id,
        status: 'received',
        received_at: new Date().toISOString(),
      })
      .eq('id', checklistItemId)

    if (updateError) {
      console.error('Portal checklist update error:', updateError)
      // Non-fatal: the file was uploaded, just the status did not update
    }

    // 9. Update portal link access tracking
    const { error: trackError } = await admin
      .from('portal_links')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (link.access_count ?? 0) + 1,
      })
      .eq('id', link.id)

    if (trackError) {
      console.error('Portal link tracking error:', trackError)
    }

    // 10. Log activity
    const { error: activityError } = await admin.from('activities').insert({
      tenant_id: link.tenant_id,
      matter_id: link.matter_id,
      contact_id: link.contact_id,
      activity_type: 'portal_upload',
      title: `Client uploaded "${file.name}" via portal`,
      description: `Document "${checklistItem.document_name}" received via client portal`,
      entity_type: 'matter',
      entity_id: link.matter_id,
      metadata: {
        checklist_item_id: checklistItemId,
        document_id: doc.id,
        file_name: file.name,
        file_size: file.size,
        portal_link_id: link.id,
      },
    })

    if (activityError) {
      console.error('Portal activity log error:', activityError)
    }

    return NextResponse.json(
      { success: true, document_id: doc.id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Portal upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/upload')
