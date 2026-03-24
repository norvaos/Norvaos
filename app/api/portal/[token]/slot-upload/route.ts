import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAutoRenamedPath } from '@/lib/services/document-slot-engine'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'
import { dispatchNotification } from '@/lib/services/notification-engine'

// 30 requests per minute per IP — prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * POST /api/portal/[token]/slot-upload
 *
 * Portal-based document upload into a specific document slot.
 * Uses the same versioning RPC as staff uploads but operates via
 * admin client (no user session — security via token validation).
 *
 * Enforces: file type, file size, slot ownership, no overwrite of accepted docs.
 */
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

    // ── 2. Parse FormData ──────────────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const slotId = formData.get('slot_id') as string | null

    if (!file || !slotId) {
      return NextResponse.json(
        { success: false, error: 'File and slot_id are required' },
        { status: 400 }
      )
    }

    // ── 3. Fetch and validate slot ─────────────────────────────────────
    const { data: slot, error: slotError } = await admin
      .from('document_slots')
      .select(
        'id, slot_name, slot_slug, person_role, category, accepted_file_types, max_file_size_bytes, matter_id, is_active, status'
      )
      .eq('id', slotId)
      .eq('matter_id', link.matter_id)
      .eq('is_active', true)
      .single()

    if (slotError || !slot) {
      return NextResponse.json(
        { success: false, error: 'Document slot not found for this matter' },
        { status: 404 }
      )
    }

    // Guard: client cannot overwrite accepted documents
    if (slot.status === 'accepted') {
      return NextResponse.json(
        { success: false, error: 'This document has already been accepted and cannot be replaced' },
        { status: 400 }
      )
    }

    // ── 4. Validate file type against slot constraints ─────────────────
    if (
      slot.accepted_file_types &&
      slot.accepted_file_types.length > 0 &&
      !slot.accepted_file_types.includes(file.type)
    ) {
      const allowedLabels = slot.accepted_file_types
        .map((t: string) => t.split('/').pop()?.toUpperCase() ?? t)
        .join(', ')
      return NextResponse.json(
        { success: false, error: `File type not allowed. Accepted formats: ${allowedLabels}` },
        { status: 400 }
      )
    }

    // ── 5. Validate file size against slot constraints ──────────────────
    if (slot.max_file_size_bytes && file.size > slot.max_file_size_bytes) {
      const maxMB = Math.round(slot.max_file_size_bytes / (1024 * 1024))
      return NextResponse.json(
        { success: false, error: `File size exceeds ${maxMB} MB limit` },
        { status: 400 }
      )
    }

    // ── 6. Upload to Supabase Storage ──────────────────────────────────
    const fileExt = file.name.split('.').pop() ?? 'bin'

    // Fetch matter_number for auto-naming
    const { data: matterRow } = await admin
      .from('matters')
      .select('matter_number')
      .eq('id', link.matter_id)
      .single()

    const autoRenamed = buildAutoRenamedPath({
      tenantId: link.tenant_id,
      matterNumber: matterRow?.matter_number ?? null,
      slotSlug: slot.slot_slug,
      personRole: slot.person_role,
      versionNumber: 0, // provisional — corrected after RPC
      originalExtension: fileExt,
    })

    // Use timestamp prefix to prevent collisions before version is known
    const storagePath = `${link.tenant_id}/${Date.now()}-${autoRenamed.fileName}`

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[portal-slot-upload] Storage upload error:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // ── 7. Create document record ──────────────────────────────────────
    const { data: doc, error: docError } = await admin
      .from('documents')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        file_name: autoRenamed.fileName,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        document_type: slot.category || 'general',
      })
      .select('id')
      .single()

    if (docError || !doc) {
      console.error('[portal-slot-upload] Document record error:', docError)
      return NextResponse.json(
        { success: false, error: 'Failed to record document' },
        { status: 500 }
      )
    }

    // ── 8. Call upload_document_version RPC ─────────────────────────────
    // p_uploaded_by = null because portal uploads are anonymous (FK to users)
    // The contact_id is tracked in the documents table and activity log
    const { data: versionNumber, error: rpcError } = await admin.rpc(
      'upload_document_version',
      {
        p_tenant_id: link.tenant_id,
        p_slot_id: slot.id,
        p_document_id: doc.id,
        p_storage_path: storagePath,
        p_file_name: autoRenamed.fileName,
        p_file_size: file.size,
        p_file_type: file.type,
        p_uploaded_by: null as unknown as string, // portal uploads have no user session
      }
    )

    if (rpcError) {
      console.error('[portal-slot-upload] RPC error:', rpcError)
      return NextResponse.json(
        { success: false, error: 'Failed to create document version' },
        { status: 500 }
      )
    }

    // ── 9. Correct file_name with actual version number ────────────────
    const correctedPath = buildAutoRenamedPath({
      tenantId: link.tenant_id,
      matterNumber: matterRow?.matter_number ?? null,
      slotSlug: slot.slot_slug,
      personRole: slot.person_role,
      versionNumber: versionNumber as number,
      originalExtension: fileExt,
    })

    if (correctedPath.fileName !== autoRenamed.fileName) {
      await admin
        .from('documents')
        .update({ file_name: correctedPath.fileName })
        .eq('id', doc.id)

      await admin
        .from('document_versions')
        .update({ file_name: correctedPath.fileName })
        .eq('slot_id', slot.id)
        .eq('version_number', versionNumber as number)
    }

    // ── 10. Log activity ───────────────────────────────────────────────
    await admin.from('activities').insert({
      tenant_id: link.tenant_id,
      matter_id: link.matter_id,
      contact_id: link.contact_id,
      activity_type: 'portal_slot_upload',
      title: `Client uploaded "${correctedPath.fileName}" via portal`,
      description: `Document "${slot.slot_name}" (v${versionNumber}) received via client portal`,
      entity_type: 'document_slot',
      entity_id: slot.id,
      metadata: {
        slot_id: slot.id,
        slot_name: slot.slot_name,
        slot_slug: slot.slot_slug,
        document_id: doc.id,
        version_number: versionNumber,
        file_name: correctedPath.fileName,
        file_size: file.size,
        portal_link_id: link.id,
      },
    })

    // ── 11. Notify responsible lawyer about the client upload ────────
    try {
      const { data: matterDetail } = await admin
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('id', link.matter_id)
        .single()

      if (matterDetail?.responsible_lawyer_id) {
        await dispatchNotification(admin, {
          tenantId: link.tenant_id,
          eventType: 'document_uploaded',
          recipientUserIds: [matterDetail.responsible_lawyer_id],
          title: 'Client uploaded a document',
          message: `A document was uploaded to "${slot.slot_name}" via the client portal.`,
          entityType: 'matter',
          entityId: link.matter_id,
          priority: 'normal',
        })
      }
    } catch (e) {
      // Non-blocking — don't fail the upload if notification fails
      console.error('[slot-upload] Notification dispatch failed:', e)
    }

    return NextResponse.json(
      { success: true, document_id: doc.id, version_number: versionNumber },
      { status: 201 }
    )
  } catch (error) {
    console.error('[portal-slot-upload] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/slot-upload')
