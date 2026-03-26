import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRetainerPdf } from '@/lib/utils/retainer-pdf'

/**
 * POST /api/matters/[id]/generate-retainer
 *
 * Smart-Document Assembler: Generates a branded Retainer Agreement PDF from the
 * matter's frozen fee_snapshot. Places it in the "Retainer" document slot and
 * prepares the e-sign placeholder.
 *
 * Performance budget: < 1.5s total (PDF gen + upload + slot placement).
 *
 * Dynamic clauses:
 *   - High/Critical risk_level → injects Risk Disclosure clause
 *   - fee_snapshot is immutable  -  template changes don't affect generated PDFs
 *
 * Returns: { success, documentId, storagePath, slotId?, signingDocumentId? }
 */
async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now()

  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const admin = createAdminClient()

    // 1. Fetch matter with fee_snapshot (lean query  -  20 col budget)
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, title, matter_number, matter_type_id, practice_area_id, responsible_lawyer_id, billing_type, risk_level, readiness_score, fee_snapshot, subtotal_cents, tax_amount_cents, total_amount_cents, tax_rate, tax_label, status, applicant_location, client_province, date_opened')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ success: false, error: 'Matter not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = matter as any

    if (!m.fee_snapshot) {
      return NextResponse.json(
        { success: false, error: 'No fee snapshot found. Assign a fee template to this matter first.' },
        { status: 400 },
      )
    }

    const feeSnapshot = m.fee_snapshot as {
      template_id?: string
      template_name?: string
      professional_fees?: { description: string; quantity?: number; unitPrice?: number; amount_cents?: number }[]
      government_fees?: { description: string; amount_cents?: number }[]
      disbursements?: { description: string; amount_cents?: number }[]
      hst_applicable?: boolean
      billing_type?: string
      snapshotted_at?: string
    }

    // 2. Fetch primary contact for this matter
    const { data: primaryLink } = await admin
      .from('matter_contacts')
      .select('contact_id, contacts!inner(first_name, last_name, email_primary, phone_primary, address_line1, city, province_state, postal_code)')
      .eq('matter_id', matterId)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = (primaryLink as any)?.contacts ?? null
    const clientName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : 'Client'
    const clientEmail = contact?.email_primary ?? null

    // 3. Fetch tenant info (firm name, address)
    const { data: tenant } = await admin
      .from('tenants')
      .select('name, address_line1, city, province, postal_code')
      .eq('id', auth.tenantId)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any
    const firmName = t?.name ?? 'Law Firm'
    const firmAddress = t
      ? [t.address_line1, t.city, t.province, t.postal_code].filter(Boolean).join(', ')
      : null

    // 4. Fetch lawyer name
    let lawyerName = firmName
    if (m.responsible_lawyer_id) {
      const { data: lawyer } = await admin
        .from('users')
        .select('first_name, last_name')
        .eq('id', m.responsible_lawyer_id)
        .single()
      if (lawyer) {
        lawyerName = [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ')
      }
    }

    // 5. Fetch practice area name
    let practiceArea: string | null = null
    if (m.practice_area_id) {
      const { data: pa } = await admin
        .from('practice_areas')
        .select('name')
        .eq('id', m.practice_area_id)
        .single()
      practiceArea = pa?.name ?? null
    }

    // 6. Fetch matter type name
    let matterTypeName: string | null = feeSnapshot.template_name ?? null
    if (m.matter_type_id) {
      const { data: mt } = await admin
        .from('matter_types')
        .select('name')
        .eq('id', m.matter_type_id)
        .single()
      matterTypeName = mt?.name ?? matterTypeName
    }

    // 7. Build PDF data from fee_snapshot
    const profFees = feeSnapshot.professional_fees ?? []
    const govtFees = feeSnapshot.government_fees ?? []
    const disbursements = feeSnapshot.disbursements ?? []

    const pdfData = {
      firmName,
      firmAddress,
      clientName,
      clientEmail,
      matterType: matterTypeName,
      billingType: feeSnapshot.billing_type ?? m.billing_type ?? 'flat_fee',
      lineItems: profFees.map(f => ({
        description: f.description ?? 'Professional Fee',
        quantity: f.quantity ?? 1,
        unitPrice: f.unitPrice ?? (f.amount_cents ? f.amount_cents / 100 : 0),
      })),
      governmentFees: govtFees.map(f => ({
        description: f.description ?? 'Government Fee',
        amount: f.amount_cents ? f.amount_cents / 100 : 0,
      })),
      disbursements: disbursements.map(f => ({
        description: f.description ?? 'Disbursement',
        amount: f.amount_cents ? f.amount_cents / 100 : 0,
      })),
      hstApplicable: feeSnapshot.hst_applicable ?? true,
      subtotalCents: m.subtotal_cents ?? 0,
      taxAmountCents: m.tax_amount_cents ?? 0,
      totalAmountCents: m.total_amount_cents ?? 0,
      matterNumber: m.matter_number,
      matterTitle: m.title,
      lawyerName,
      riskLevel: m.risk_level,
      readinessScore: m.readiness_score,
      snapshotDate: feeSnapshot.snapshotted_at ?? null,
      practiceArea,
    }

    // 8. Generate PDF (performance-critical  -  target < 500ms)
    const pdfBuffer = await generateRetainerPdf(pdfData)
    const pdfGenTime = Date.now() - startTime

    // 9. Upload to Supabase Storage (private bucket, tenant-scoped path)
    const timestamp = Date.now()
    const storagePath = `${auth.tenantId}/retainers/${matterId}/${timestamp}-retainer-agreement.pdf`
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex')

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 },
      )
    }

    // 10. Create document record
    const { data: docRecord, error: docError } = await admin
      .from('documents')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        file_name: `Retainer Agreement  -  ${clientName}.pdf`,
        file_type: 'application/pdf',
        file_size: pdfBuffer.length,
        category: 'retainer',
        description: `Auto-generated retainer agreement from fee snapshot. Matter: ${m.matter_number ?? matterId}`,
        storage_path: storagePath,
        storage_bucket: 'documents',
        uploaded_by: auth.userId,
        requires_signature: true,
        signature_status: 'pending',
      })
      .select('id')
      .single()

    if (docError) {
      return NextResponse.json(
        { success: false, error: `Document record failed: ${docError.message}` },
        { status: 500 },
      )
    }

    // 11. Place in "Retainer" document slot (if exists)
    let slotId: string | null = null
    const { data: retainerSlot } = await admin
      .from('document_slots')
      .select('id')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .ilike('slot_slug', '%retainer%')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (retainerSlot) {
      await admin
        .from('document_slots')
        .update({
          current_document_id: docRecord.id,
          status: 'pending_review',
          current_version: 1,
        })
        .eq('id', retainerSlot.id)

      slotId = retainerSlot.id
    }

    // 12. Create e-sign placeholder (signing_documents record)
    let signingDocumentId: string | null = null
    const { data: sigDoc } = await admin
      .from('signing_documents')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        contact_id: (primaryLink as any)?.contact_id ?? null,
        document_type: 'retainer_agreement',
        source_entity_type: 'matter',
        source_entity_id: matterId,
        title: `Retainer Agreement  -  ${clientName}`,
        storage_path: storagePath,
        checksum_sha256: checksum,
        file_size_bytes: pdfBuffer.length,
        created_by: auth.userId,
      } as never)
      .select('id')
      .single()

    if (sigDoc) {
      signingDocumentId = sigDoc.id
    }

    // 13. Audit log
    await admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        entity_type: 'document',
        entity_id: docRecord.id,
        action: 'retainer_pdf_generated',
        source: 'engine:document',
        severity: 'info',
        changes: {
          matter_id: matterId,
          matter_number: m.matter_number,
          client_name: clientName,
          total_cents: m.total_amount_cents,
          risk_level: m.risk_level,
          risk_clause_injected: m.risk_level === 'high' || m.risk_level === 'critical',
          checksum_sha256: checksum,
          pdf_gen_ms: pdfGenTime,
          total_ms: Date.now() - startTime,
          slot_placed: !!slotId,
          esign_prepared: !!signingDocumentId,
        },
      })

    const totalTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      documentId: docRecord.id,
      storagePath,
      slotId,
      signingDocumentId,
      checksum,
      riskClauseInjected: m.risk_level === 'high' || m.risk_level === 'critical',
      performance: {
        pdfGenMs: pdfGenTime,
        totalMs: totalTime,
        withinBudget: totalTime < 1500,
      },
    })
  } catch (err) {
    if ((err as any)?.name === 'AuthError') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Generate retainer error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/generate-retainer')
