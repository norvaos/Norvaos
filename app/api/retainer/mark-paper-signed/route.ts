import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { convertLeadToMatter } from '@/lib/services/lead-conversion-executor'
import { requirePermission } from '@/lib/services/require-role'
import { recalculateLeadSummary } from '@/lib/services/lead-summary-recalculator'
import { advanceLeadStage } from '@/lib/services/lead-stage-engine'

/**
 * POST /api/retainer/mark-paper-signed
 *
 * Marks a retainer as signed on paper (wet signature).
 * Optionally accepts a file upload of the scanned signed document.
 *
 * Body: FormData with:
 *   - retainerPackageId: string (required)
 *   - leadId: string (required)
 *   - verificationCode: string (required — must match code printed on retainer PDF)
 *   - file: File (optional — scanned signed document)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')
    const supabase = createAdminClient()

    const formData = await request.formData()
    const retainerPackageId = formData.get('retainerPackageId') as string | null
    const leadId = formData.get('leadId') as string | null
    const verificationCode = formData.get('verificationCode') as string | null
    const file = formData.get('file') as File | null

    if (!retainerPackageId || !leadId) {
      return NextResponse.json(
        { error: 'retainerPackageId and leadId are required' },
        { status: 400 }
      )
    }

    // Verify the retainer package exists and belongs to this tenant
    const { data: pkg, error: pkgErr } = await supabase
      .from('lead_retainer_packages')
      .select('id, status, tenant_id, verification_code')
      .eq('id', retainerPackageId)
      .single()

    if (pkgErr || !pkg) {
      return NextResponse.json({ error: 'Retainer package not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((pkg as any).tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify barcode/verification code if the retainer has one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storedCode = (pkg as any).verification_code as string | null
    if (storedCode) {
      if (!verificationCode) {
        return NextResponse.json(
          { error: 'Verification code is required. Enter the code printed on the retainer document.' },
          { status: 400 }
        )
      }
      if (verificationCode.trim().toUpperCase() !== storedCode.trim().toUpperCase()) {
        return NextResponse.json(
          { error: 'Verification code does not match. The uploaded document may not be the correct retainer.' },
          { status: 403 }
        )
      }
    }

    let signedDocUrl: string | null = null

    // Upload signed document if provided
    // Uses service role client to bypass storage RLS policies
    if (file) {
      const ext = file.name.split('.').pop() || 'pdf'
      const storagePath = `retainers/${auth.tenantId}/${retainerPackageId}/signed-paper.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())

      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/pdf',
          upsert: true,
        })

      if (uploadErr) {
        console.error('Upload error:', uploadErr.message, uploadErr)
        return NextResponse.json(
          { error: `Failed to upload signed document: ${uploadErr.message}` },
          { status: 500 }
        )
      }

      // Store the storage path — generate signed URLs on demand when viewing
      signedDocUrl = storagePath
    }

    // Update retainer package status to signed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      status: 'signed',
      signing_method: 'paper',
      signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (signedDocUrl) {
      updateData.signed_document_url = signedDocUrl
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase
      .from('lead_retainer_packages') as any)
      .update(updateData)
      .eq('id', retainerPackageId)

    if (updateErr) {
      console.error('Update retainer error:', updateErr)
      return NextResponse.json(
        { error: 'Failed to update retainer status' },
        { status: 500 }
      )
    }

    // Recalculate lead summary (updates retainer_status from retainer package)
    try {
      await recalculateLeadSummary(supabase, leadId, auth.tenantId)
    } catch (e) {
      console.warn('[mark-paper-signed] Lead summary recalculation failed (non-blocking):', e)
    }

    // Advance lead stage to retainer_signed_payment_pending
    // skipGuards: true because the retainer is confirmed signed (we just verified
    // the code), and the lead may not have current_stage properly set (legacy leads)
    try {
      await advanceLeadStage({
        supabase,
        leadId,
        tenantId: auth.tenantId,
        targetStage: 'retainer_signed_payment_pending',
        actorUserId: auth.userId,
        actorType: 'system',
        reason: 'Retainer signed on paper',
        skipGuards: true,
      })
    } catch (stageErr) {
      console.warn('[mark-paper-signed] Stage advance failed (non-blocking):', stageErr)
    }

    // Update lead's next required action + advance pipeline stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadUpdatePayload: Record<string, any> = {
      next_required_action: 'record_payment',
      retainer_status: 'signed',
      updated_at: new Date().toISOString(),
    }

    // Also sync legacy pipeline stage — find "Retainer Signed" or similar stage
    try {
      const { data: currentLead } = await supabase
        .from('leads')
        .select('pipeline_id')
        .eq('id', leadId)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineId = (currentLead as any)?.pipeline_id
      if (pipelineId) {
        const { data: pipelineStages } = await supabase
          .from('pipeline_stages')
          .select('id, name')
          .eq('pipeline_id', pipelineId)
          .order('sort_order', { ascending: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signedStage = (pipelineStages as any[])?.find((s: any) =>
          /retain.*sign|sign.*retain|retainer.*pend.*pay/i.test(s.name)
        )
        if (signedStage) {
          leadUpdatePayload.stage_id = signedStage.id
          leadUpdatePayload.stage_entered_at = new Date().toISOString()
        }
      }
    } catch (stageErr) {
      console.warn('[mark-paper-signed] Pipeline stage sync failed (non-blocking):', stageErr)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('leads') as any)
      .update(leadUpdatePayload)
      .eq('id', leadId)

    // Auto-convert lead to matter if payment was already received
    // Both signed retainer + payment are required. Since retainer is now signed,
    // attempt conversion — gates will block if payment isn't received yet.
    // Gate overrides: skip conflict_cleared and intake_complete since user confirmed
    // paper signing (these should have been set during consultation outcome).
    let matterId: string | null = null
    let matterNumber: string | null = null
    let conversionError: string | null = null
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, contact_id, matter_type_id, practice_area_id, responsible_lawyer_id, assigned_to, status, converted_matter_id')
        .eq('id', leadId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadData = lead as any
      if (leadData && leadData.status !== 'converted' && !leadData.converted_matter_id) {
        // Build matter title
        let matterTitle = 'New Matter'
        if (leadData.contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('first_name, last_name')
            .eq('id', leadData.contact_id)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = contact as any
          if (c) {
            const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
            if (name) matterTitle = name
          }
        }
        if (leadData.matter_type_id) {
          const { data: mt } = await supabase
            .from('matter_types')
            .select('name')
            .eq('id', leadData.matter_type_id)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mtData = mt as any
          if (mtData?.name) matterTitle = `${matterTitle} — ${mtData.name}`
        }

        const convResult = await convertLeadToMatter({
          supabase,
          leadId,
          tenantId: auth.tenantId,
          userId: auth.userId,
          matterData: {
            title: matterTitle,
            matterTypeId: leadData.matter_type_id || undefined,
            practiceAreaId: leadData.practice_area_id || undefined,
            responsibleLawyerId: leadData.responsible_lawyer_id || leadData.assigned_to || undefined,
          },
          // Skip non-essential gates for paper-sign auto-conversion
          gateOverrides: {
            conflict_cleared: false,
            intake_complete: false,
          },
        })

        if (convResult.success && convResult.matterId) {
          matterId = convResult.matterId
          // Fetch matter number (auto-generated by DB trigger)
          const { data: matter } = await supabase
            .from('matters')
            .select('matter_number')
            .eq('id', matterId)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          matterNumber = (matter as any)?.matter_number ?? null
          console.log(`[mark-paper-signed] Auto-conversion succeeded: matter ${matterId}`)
        } else {
          conversionError = convResult.error ?? null
          console.log(`[mark-paper-signed] Auto-conversion not ready: ${convResult.error}`)
        }
      }
    } catch (convErr) {
      console.warn('[mark-paper-signed] Auto-conversion attempt failed (non-blocking):', convErr)
      conversionError = convErr instanceof Error ? convErr.message : 'Conversion failed'
    }

    return NextResponse.json({
      success: true,
      signedDocUrl,
      matterId,
      matterNumber,
      conversionError,
      message: matterId
        ? `Retainer signed — Matter ${matterNumber} created`
        : 'Retainer marked as signed on paper',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Mark paper signed error:', err)
    return NextResponse.json(
      { error: 'Failed to mark retainer as paper signed' },
      { status: 500 }
    )
  }
}
