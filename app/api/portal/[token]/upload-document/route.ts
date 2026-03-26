import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'
import { broadcastDocumentStatus } from '@/lib/services/document-realtime'

/**
 * POST /api/portal/[token]/upload-document
 *
 * Generic portal document upload to the `matter-documents` Storage bucket.
 * Used by portal components (e.g. document request cards) to upload files
 * on behalf of clients who access the portal via a one-time token.
 *
 * Security: token is validated before any upload proceeds. The storage path
 * is namespaced by matter_id so cross-matter access is structurally impossible.
 *
 * FormData fields:
 *   file       — the File to upload (required)
 *   slot_id    — optional document_slot UUID to link the upload (falls back to generic upload)
 *   label      — optional human-readable label stored in the activity log
 */

// 30 requests per minute per IP
const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
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
  'text/plain',
]

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, retryAfterMs } = rateLimiter.check(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const { token } = await params

  // ── Token validation ────────────────────────────────────────────────────────
  let link: Awaited<ReturnType<typeof validatePortalToken>>
  try {
    link = await validatePortalToken(token)
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  const admin = createAdminClient()

  // ── Parse FormData ──────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const slotId = formData.get('slot_id') as string | null
  const label = (formData.get('label') as string | null) ?? file?.name ?? 'document'

  if (!file) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
  }

  // ── File validation ─────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: 'File size exceeds 25 MB limit' },
      { status: 400 }
    )
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: 'File type not allowed. Please upload a PDF, image, or Office document.' },
      { status: 400 }
    )
  }

  // ── If a slot_id is provided, verify it belongs to this matter ─────────────
  if (slotId) {
    const { data: slot } = await admin
      .from('document_slots')
      .select('id, status')
      .eq('id', slotId)
      .eq('matter_id', link.matter_id)
      .maybeSingle()

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Document slot not found for this matter' },
        { status: 404 }
      )
    }

    if (slot.status === 'accepted') {
      return NextResponse.json(
        { success: false, error: 'This document has already been accepted and cannot be replaced' },
        { status: 400 }
      )
    }
  }

  // ── Upload to matter-documents bucket ──────────────────────────────────────
  // Path: {matter_id}/portal/{timestamp}-{sanitized_filename}
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${link.matter_id}/portal/${Date.now()}-${sanitizedName}`

  const { error: uploadError } = await admin.storage
    .from('matter-documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[upload-document] Storage upload error:', uploadError)
    return NextResponse.json(
      { success: false, error: 'Failed to upload file. Please try again.' },
      { status: 500 }
    )
  }

  // ── Create document record ─────────────────────────────────────────────────
  const { data: doc, error: docError } = await admin
    .from('documents')
    .insert({
      tenant_id: link.tenant_id,
      matter_id: link.matter_id,
      contact_id: link.contact_id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      category: 'portal_upload',
      description: `Uploaded via client portal: ${label}`,
    })
    .select('id')
    .single()

  if (docError || !doc) {
    console.error('[upload-document] Document record error:', docError)
    // Non-fatal: file is in storage; return path so caller can retry the record
    return NextResponse.json(
      { success: true, storage_path: storagePath, document_id: null, warning: 'Document record could not be saved.' },
      { status: 201 }
    )
  }

  // Directive 012: Broadcast to lawyer dashboard in real-time
  broadcastDocumentStatus({
    documentId: doc.id,
    matterId: link.matter_id,
    fileName: file.name,
    status: 'uploaded',
    category: 'portal_upload',
    updatedAt: new Date().toISOString(),
  }).catch(() => {})

  // ── Log activity (fire-and-forget) ──────────────────────────────────────────
  admin.from('activities').insert({
    tenant_id: link.tenant_id,
    matter_id: link.matter_id,
    contact_id: link.contact_id,
    activity_type: 'portal_document_upload',
    title: `Client uploaded "${file.name}" via portal`,
    description: `Document "${label}" received via client portal`,
    entity_type: 'matter',
    entity_id: link.matter_id,
    metadata: {
      document_id: doc.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      slot_id: slotId,
      portal_link_id: link.id,
    },
  }).then(() => {}, (err: unknown) => {
    console.error('[upload-document] Activity log error:', err)
  })

  return NextResponse.json(
    {
      success: true,
      document_id: doc.id,
      storage_path: storagePath,
    },
    { status: 201 }
  )
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/upload-document')
