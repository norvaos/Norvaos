import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAutoRenamedPath } from '@/lib/services/document-slot-engine'
import { checkTenantLimit, rateLimitResponse } from '@/lib/middleware/tenant-limiter'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'
import { dispatchNotification } from '@/lib/services/notification-engine'
import { checkAndNotifyReadiness } from '@/lib/services/matter-readiness-notifier'
import { broadcastDocumentStatus } from '@/lib/services/document-realtime'
import { withTiming } from '@/lib/middleware/request-timing'

async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'documents', 'create')

    const limit = await checkTenantLimit(auth.tenantId, 'documents/upload')
    if (!limit.allowed) return rateLimitResponse(limit)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const matterId = formData.get('matter_id') as string | null
    const contactId = formData.get('contact_id') as string | null
    const leadId = formData.get('lead_id') as string | null
    const taskId = formData.get('task_id') as string | null
    const category = formData.get('category') as string | null
    const description = formData.get('description') as string | null
    const displayName = formData.get('display_name') as string | null
    const slotId = formData.get('slot_id') as string | null
    const storageLocation = (formData.get('storage_location') as string | null) ?? 'local'

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    // Track enforcement state for downstream logic
    let isEnforcementEnabled = false

    // Document gating for enforcement-enabled matters
    if (matterId) {
      const { data: matter, error: matterError } = await admin
        .from('matters')
        .select('id, tenant_id, matter_type_id, intake_status')
        .eq('id', matterId)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (matterError || !matter) {
        return NextResponse.json(
          { error: 'Matter not found' },
          { status: 404 }
        )
      }

      if (matter.matter_type_id) {
        const { data: matterType } = await admin
          .from('matter_types')
          .select('enforcement_enabled')
          .eq('id', matter.matter_type_id)
          .single()

        if (matterType?.enforcement_enabled) {
          isEnforcementEnabled = true

          // Intake gating: block uploads if intake is incomplete
          if (
            matter.intake_status === 'incomplete' ||
            matter.intake_status === 'not_applicable'
          ) {
            return NextResponse.json(
              {
                error:
                  'Documents cannot be uploaded until the Core Data Card is at least complete. Please fill in the required intake data first.',
              },
              { status: 403 }
            )
          }

          // Slot enforcement: enforcement-enabled matters require a slot_id
          if (!slotId) {
            return NextResponse.json(
              {
                error:
                  'A document slot must be selected for uploads on enforcement-enabled matters.',
              },
              { status: 400 }
            )
          }
        }
      }
    }

    // Slot validation (if slot_id provided)
    let slotData: {
      id: string
      slot_slug: string
      person_role: string | null
      accepted_file_types: string[]
      max_file_size_bytes: number
      matter_id: string
    } | null = null

    let matterNumber: string | null = null

    if (slotId) {
      const { data: slot, error: slotError } = await admin
        .from('document_slots')
        .select('id, slot_slug, person_role, accepted_file_types, max_file_size_bytes, matter_id, is_active')
        .eq('id', slotId)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (slotError || !slot) {
        return NextResponse.json(
          { error: 'Document slot not found' },
          { status: 404 }
        )
      }

      if (!slot.is_active) {
        return NextResponse.json(
          { error: 'This document slot is no longer active' },
          { status: 400 }
        )
      }

      // Validate slot belongs to the specified matter
      if (matterId && slot.matter_id !== matterId) {
        return NextResponse.json(
          { error: 'Document slot does not belong to this matter' },
          { status: 400 }
        )
      }

      // Validate file type against slot's accepted types
      if (slot.accepted_file_types && slot.accepted_file_types.length > 0) {
        if (!slot.accepted_file_types.includes(file.type)) {
          return NextResponse.json(
            {
              error: `File type "${file.type}" is not accepted for this document slot. Accepted types: ${slot.accepted_file_types.join(', ')}`,
            },
            { status: 400 }
          )
        }
      }

      // Validate file size against slot's max size
      if (slot.max_file_size_bytes && file.size > slot.max_file_size_bytes) {
        const maxMB = Math.round(slot.max_file_size_bytes / (1024 * 1024))
        return NextResponse.json(
          {
            error: `File size exceeds the maximum allowed size of ${maxMB} MB for this document slot.`,
          },
          { status: 400 }
        )
      }

      slotData = { ...slot, accepted_file_types: slot.accepted_file_types ?? [], max_file_size_bytes: slot.max_file_size_bytes ?? 0 }

      // Fetch matter number for auto-rename
      const { data: matterRow } = await admin
        .from('matters')
        .select('matter_number')
        .eq('id', slot.matter_id)
        .single()

      matterNumber = matterRow?.matter_number ?? null
    }

    // ─── OneDrive Upload Branch ──────────────────────────────────────────────
    if (storageLocation === 'onedrive') {
      const adminSupabase = createAdminClient()

      // Validate: user has an active OneDrive connection
      const { data: conn } = await adminSupabase
        .from('microsoft_connections')
        .select('id, onedrive_enabled')
        .eq('user_id', auth.userId)
        .eq('is_active', true)
        .single()

      if (!conn || !conn.onedrive_enabled) {
        return NextResponse.json(
          { error: 'OneDrive is not connected or not enabled' },
          { status: 403 }
        )
      }

      // Determine OneDrive folder path — organized by entity type
      // Structure: NorvaOS/Matters/{MatterName}/, NorvaOS/Contacts/{ContactName}/, etc.
      const effectiveMatterId = matterId || (slotData?.matter_id ?? null)
      let folderPath = 'NorvaOS'

      const {
        ensureMatterSubfolder,
        ensureContactSubfolder,
        ensureLeadSubfolder,
        ensureTaskSubfolder,
        uploadToOneDrive,
      } = await import('@/lib/services/microsoft-onedrive')

      if (effectiveMatterId) {
        // Matter documents → NorvaOS/Matters/{MatterNumber} - {Title}/
        const { data: matterInfo } = await admin
          .from('matters')
          .select('matter_number, title')
          .eq('id', effectiveMatterId)
          .single()

        if (matterInfo) {
          const { folderPath: matterPath } = await ensureMatterSubfolder(conn.id, adminSupabase, {
            matterId: effectiveMatterId,
            matterNumber: matterInfo.matter_number,
            matterTitle: matterInfo.title,
          })
          folderPath = matterPath
        }
      } else if (contactId) {
        // Contact documents → NorvaOS/Contacts/{First Last}/
        const { data: contactInfo } = await admin
          .from('contacts')
          .select('first_name, last_name')
          .eq('id', contactId)
          .single()

        if (contactInfo) {
          const contactName = [contactInfo.first_name, contactInfo.last_name].filter(Boolean).join(' ') || 'Unnamed Contact'
          const { folderPath: contactPath } = await ensureContactSubfolder(conn.id, adminSupabase, {
            contactId,
            contactName,
          })
          folderPath = contactPath
        }
      } else if (leadId) {
        // Lead documents → NorvaOS/Leads/{Lead Name}/
        const { data: leadInfo } = await admin
          .from('leads')
          .select('id, contacts(first_name, last_name)')
          .eq('id', leadId)
          .single()

        if (leadInfo) {
          const leadContact = (leadInfo as unknown as { contacts: { first_name: string; last_name: string } | null }).contacts
          const leadName = leadContact ? [leadContact.first_name, leadContact.last_name].filter(Boolean).join(' ') : 'Unnamed Lead'
          const { folderPath: leadPath } = await ensureLeadSubfolder(conn.id, adminSupabase, {
            leadId,
            leadName,
          })
          folderPath = leadPath
        }
      } else if (taskId) {
        // Task documents → NorvaOS/Tasks/{Task Title}/
        const { data: taskInfo } = await admin
          .from('tasks')
          .select('title')
          .eq('id', taskId)
          .single()

        if (taskInfo) {
          const { folderPath: taskPath } = await ensureTaskSubfolder(conn.id, adminSupabase, {
            taskId,
            taskTitle: taskInfo.title,
          })
          folderPath = taskPath
        }
      }

      // Upload to OneDrive
      const fileBuffer = Buffer.from(await file.arrayBuffer())
      const effectiveFileName = displayName || file.name

      const { oneDriveItemId, webUrl } = await uploadToOneDrive(conn.id, adminSupabase, {
        file: fileBuffer,
        fileName: effectiveFileName,
        folderPath,
      })

      // Create document record (no Supabase Storage path)
      const effectiveCategory = slotData ? slotData.slot_slug : (category || 'general')
      const { data: doc, error: docError } = await admin
        .from('documents')
        .insert({
          tenant_id: auth.tenantId,
          matter_id: effectiveMatterId,
          contact_id: contactId,
          lead_id: leadId,
          task_id: taskId,
          uploaded_by: auth.userId,
          file_name: effectiveFileName,
          file_type: file.type,
          file_size: file.size,
          storage_path: '', // No local storage — stored in OneDrive
          category: effectiveCategory,
          description: description,
          external_id: oneDriveItemId,
          external_provider: 'microsoft_onedrive',
          onedrive_item_id: oneDriveItemId,
          onedrive_web_url: webUrl,
        })
        .select()
        .single()

      if (docError) {
        return NextResponse.json(
          { error: 'Failed to create document record', details: docError.message },
          { status: 500 }
        )
      }

      // Broadcast upload event for real-time portal updates
      if (doc && effectiveMatterId) {
        broadcastDocumentStatus({
          documentId: doc.id,
          matterId: effectiveMatterId,
          fileName: effectiveFileName,
          status: 'uploaded',
          category: effectiveCategory,
          updatedAt: doc.created_at ?? new Date().toISOString(),
        }).catch(() => {})
      }

      // Slot version tracking (reuse same logic)
      let versionNumber: number | null = null
      if (slotData && doc) {
        const fileExt = file.name.split('.').pop() ?? 'bin'
        const { data: rpcResult, error: rpcError } = await (admin as any).rpc(
          'upload_document_version',
          {
            p_tenant_id: auth.tenantId,
            p_slot_id: slotData.id,
            p_document_id: doc.id,
            p_storage_path: '',
            p_file_name: effectiveFileName,
            p_file_size: file.size,
            p_file_type: file.type,
            p_uploaded_by: auth.userId,
          }
        )
        if (!rpcError && rpcResult) {
          versionNumber = rpcResult as number
        }
      }

      // Invalidate gating cache
      if (effectiveMatterId) {
        await invalidateGating(auth.tenantId, effectiveMatterId)
      }

      // Directive 012: Smart notification batching — check readiness instead
      // of alerting per-document. Only fires "Matter Ready for Review" when
      // 100% of Identity + Financial slots are filled.
      if (effectiveMatterId) {
        checkAndNotifyReadiness(admin, {
          tenantId: auth.tenantId,
          matterId: effectiveMatterId,
          uploadedByUserId: auth.userId,
        }).catch(() => {}) // fire-and-forget
      }

      return NextResponse.json(
        {
          success: true,
          document: doc,
          storage: 'onedrive',
          ...(versionNumber !== null && { version_number: versionNumber }),
        },
        { status: 201 }
      )
    }

    // ─── Supabase Storage Upload (default) ────────────────────────────────────
    // Determine file path — auto-rename for slot uploads, legacy for non-slot
    const adminSupabase = createAdminClient()
    const fileExt = file.name.split('.').pop() ?? 'bin'
    let filePath: string
    let autoFileName: string | null = null

    if (slotData) {
      // Auto-rename: use provisional version 1 (actual version assigned by RPC)
      // The storage path uses a provisional version; the display name will be
      // corrected after the RPC assigns the real version number.
      const autoRenamed = buildAutoRenamedPath({
        tenantId: auth.tenantId,
        matterNumber,
        slotSlug: slotData.slot_slug,
        personRole: slotData.person_role,
        versionNumber: 0, // Placeholder — real version assigned by RPC
        originalExtension: fileExt,
      })
      // Use timestamp prefix to avoid storage collisions before version is known
      filePath = `${auth.tenantId}/${Date.now()}-${autoRenamed.fileName}`
      autoFileName = autoRenamed.fileName
    } else {
      // Legacy path for non-slot uploads
      filePath = `${auth.tenantId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    }

    // ── SENTINEL Vault Hashing: compute SHA-256 of file content ──────────
    const fileBuffer = await file.arrayBuffer()
    const contentHash = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')

    const { error: uploadError } = await adminSupabase.storage
      .from('documents')
      .upload(filePath, Buffer.from(fileBuffer), { contentType: file.type })

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      )
    }

    // Create document record
    const effectiveCategory = slotData ? slotData.slot_slug : (category || 'general')
    const { data: doc, error: docError } = await admin
      .from('documents')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId || (slotData?.matter_id ?? null),
        contact_id: contactId,
        lead_id: leadId,
        task_id: taskId,
        uploaded_by: auth.userId,
        file_name: autoFileName || displayName || file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: filePath,
        category: effectiveCategory,
        description: description,
        content_hash: contentHash,
        tamper_status: 'verified',
      })
      .select()
      .single()

    if (docError) {
      return NextResponse.json(
        { error: 'Failed to create document record', details: docError.message },
        { status: 500 }
      )
    }

    // Broadcast upload event for real-time portal updates
    const uploadMatterId = matterId || (slotData?.matter_id ?? null)
    if (doc && uploadMatterId) {
      broadcastDocumentStatus({
        documentId: doc.id,
        matterId: uploadMatterId,
        fileName: autoFileName || displayName || file.name,
        status: 'uploaded',
        category: effectiveCategory,
        updatedAt: doc.created_at ?? new Date().toISOString(),
      }).catch(() => {})
    }

    // Version tracking via RPC (for slot uploads)
    let versionNumber: number | null = null

    if (slotData && doc) {
      const { data: rpcResult, error: rpcError } = await (admin as any).rpc(
        'upload_document_version',
        {
          p_tenant_id: auth.tenantId,
          p_slot_id: slotData.id,
          p_document_id: doc.id,
          p_storage_path: filePath,
          p_file_name: autoFileName || file.name,
          p_file_size: file.size,
          p_file_type: file.type,
          p_uploaded_by: auth.userId,
        }
      )

      if (rpcError) {
        console.error('Version tracking RPC error:', rpcError)
        // Document was uploaded successfully — version tracking failure is logged
        // but does not fail the request. The slot status was updated by the RPC
        // or will need manual intervention.
      } else {
        versionNumber = rpcResult as number

        // Update the document file_name with the actual version number
        if (versionNumber && slotData) {
          const correctedName = buildAutoRenamedPath({
            tenantId: auth.tenantId,
            matterNumber,
            slotSlug: slotData.slot_slug,
            personRole: slotData.person_role,
            versionNumber,
            originalExtension: fileExt,
          })

          await admin
            .from('documents')
            .update({ file_name: correctedName.fileName })
            .eq('id', doc.id)
        }
      }
    }

    const effectiveMatterId = matterId || (slotData?.matter_id ?? null)
    if (effectiveMatterId) {
      await invalidateGating(auth.tenantId, effectiveMatterId)
      // Auto-sync immigration intake status so upload advances the matter
      // (e.g. client_in_progress → review_required when all mandatory docs uploaded)
      try {
        await syncImmigrationIntakeStatus(admin, effectiveMatterId, auth.userId)
      } catch (err) {
        console.error('[document-upload] Status sync failed (non-fatal):', err)
      }
    }

    // Directive 012: Smart notification batching — check readiness instead
    // of alerting per-document. Only fires "Matter Ready for Review" when
    // 100% of Identity + Financial slots are filled.
    if (effectiveMatterId) {
      checkAndNotifyReadiness(admin, {
        tenantId: auth.tenantId,
        matterId: effectiveMatterId,
        uploadedByUserId: auth.userId,
      }).catch(() => {}) // fire-and-forget
    }

    return NextResponse.json(
      {
        success: true,
        document: doc,
        ...(versionNumber !== null && { version_number: versionNumber }),
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Document upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/upload')

const admin = createAdminClient()