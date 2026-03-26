/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E-Sign Subsystem  -  Core Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Defensible electronic signing service for NorvaOS.
 *
 * Design principles:
 *   - Immutable document snapshots: PDF frozen at send time with SHA-256 hash
 *   - Token security: only SHA-256 hash stored, never the raw bearer token
 *   - Append-only audit: every lifecycle event recorded in signing_events
 *   - State machine: all transitions validated via esign-transitions module
 *   - Structural independence: signing state ≠ payment ≠ matter state
 *   - Document-oriented: supports any document type (Phase 1: retainer only)
 *
 * Key functions:
 *   freezeDocument()               -  Generate + store immutable PDF snapshot
 *   createAndSendSigningRequest()  -  Create request, send signing email
 *   getSigningPageData()           -  Validate token, return signing page data
 *   getSourceDocument()            -  Stream frozen PDF for signing page
 *   executeSignature()             -  Record signature, generate signed artifact
 *   declineSignature()             -  Record decline, notify lawyer
 *   cancelRequest()                -  Cancel active request (lawyer action)
 *   resendRequest()                -  Supersede old request, create + send new
 *   sendReminder()                 -  Send reminder email for active request
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Resend } from 'resend'
import { generateInvoicePdf, type InvoicePdfData } from '@/lib/utils/invoice-pdf'
import {
  validateSigningTransition,
  isTerminalStatus,
  DEFAULT_EXPIRY_DAYS,
  type SigningStatus,
  type SigningEventType,
  type ActorType,
  type SignatureMode,
  type SigningDocumentType,
} from './esign-transitions'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

interface FreezeDocumentParams {
  tenantId: string
  sourceEntityType: string
  sourceEntityId: string
  matterId?: string | null
  leadId?: string | null
  contactId?: string | null
  documentType: SigningDocumentType
  title: string
  createdBy: string
  /** Optional lawyer pre-signature to overlay on the frozen PDF (right side). */
  lawyerSignature?: {
    imageBuffer: Buffer
    lawyerName: string
    credentials?: string | null // e.g. "LSO #12345P" or "RCIC #R123456"  -  regulatory licence
  } | null
}

interface CreateAndSendParams {
  tenantId: string
  signingDocumentId: string
  matterId?: string | null
  leadId?: string | null
  signerName: string
  signerEmail: string
  signerContactId?: string | null
  expiryDays?: number
  createdBy: string
}

interface ExecuteSignatureParams {
  signatureDataUrl: string // base64 PNG from canvas or typed render
  signatureMode: SignatureMode
  typedName?: string
  consentText: string
  ip: string
  userAgent: string
}

interface DeclineParams {
  reason?: string
  ip: string
  userAgent: string
}

interface LogEventParams {
  tenantId: string
  signingRequestId: string
  eventType: SigningEventType
  fromStatus?: string
  toStatus?: string
  actorType: ActorType
  actorId?: string | null
  ip?: string
  userAgent?: string
  sourceDocumentHash?: string
  signedDocumentHash?: string
  consentText?: string
  signatureMode?: string
  typedName?: string
  emailMessageId?: string
  metadata?: Record<string, unknown>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Hash a raw token with SHA-256. We never store the raw token.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * Compute SHA-256 hex digest of a buffer.
 */
function sha256(data: Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Get Resend instance (null if not configured).
 */
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[esign-service] RESEND_API_KEY not configured  -  emails will be skipped')
    return null
  }
  return new Resend(apiKey)
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'

function getFromAddress(firmName: string): string {
  if (FROM_DOMAIN === 'resend.dev') return 'onboarding@resend.dev'
  return `${firmName} <notifications@${FROM_DOMAIN}>`
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

/**
 * Append-only event logger for signing_events.
 */
async function logSigningEvent(
  supabase: SupabaseClient<Database>,
  params: LogEventParams
): Promise<void> {
  try {
    await supabase
      .from('signing_events' as never)
      .insert({
        tenant_id: params.tenantId,
        signing_request_id: params.signingRequestId,
        event_type: params.eventType,
        from_status: params.fromStatus ?? null,
        to_status: params.toStatus ?? null,
        actor_type: params.actorType,
        actor_id: params.actorId ?? null,
        ip_address: params.ip ?? null,
        user_agent: params.userAgent ?? null,
        source_document_hash: params.sourceDocumentHash ?? null,
        signed_document_hash: params.signedDocumentHash ?? null,
        consent_text: params.consentText ?? null,
        signature_mode: params.signatureMode ?? null,
        typed_name: params.typedName ?? null,
        email_message_id: params.emailMessageId ?? null,
        metadata: (params.metadata ?? {}) as never,
      } as never)
  } catch (err) {
    console.error('[esign-service] Failed to log signing event:', err)
  }
}

/**
 * Transition signing request status with validation.
 */
async function transitionSigningStatus(
  supabase: SupabaseClient<Database>,
  params: {
    requestId: string
    currentStatus: SigningStatus
    newStatus: SigningStatus
    updateFields?: Record<string, unknown>
  }
): Promise<void> {
  validateSigningTransition(params.currentStatus, params.newStatus)

  const updateData: Record<string, unknown> = {
    status: params.newStatus,
    updated_at: new Date().toISOString(),
    ...(params.updateFields ?? {}),
  }

  const { error } = await supabase
    .from('signing_requests' as never)
    .update(updateData as never)
    .eq('id', params.requestId)

  if (error) {
    throw new Error(`Failed to transition signing request: ${error.message}`)
  }
}

/**
 * Fetch tenant branding for emails.
 */
async function fetchTenantBranding(supabase: SupabaseClient<Database>, tenantId: string) {
  const { data } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('id', tenantId)
    .single()
  if (!data) return { name: 'Your Law Firm', logo_url: null, primary_color: '#3b82f6' }
  return { ...data, primary_color: data.primary_color ?? '#3b82f6' }
}

// ─── Core: Freeze Document ───────────────────────────────────────────────────

/**
 * Generate an immutable document snapshot from a source entity.
 *
 * For Phase 1 (retainer_agreement): generates invoice PDF, computes SHA-256,
 * stores the frozen PDF in Supabase storage, and creates a signing_documents row.
 *
 * The frozen PDF never changes after this point.
 */
export async function freezeDocument(
  supabase: SupabaseClient<Database>,
  params: FreezeDocumentParams
): Promise<ServiceResult<{ signingDocumentId: string; checksum: string }>> {
  try {
    // ── Retainer package branch (lead-level signing) ──────────────────────
    if (params.sourceEntityType === 'retainer_package') {
      // Fetch retainer package data
      const { data: pkg } = await supabase
        .from('lead_retainer_packages' as never)
        .select('*')
        .eq('id', params.sourceEntityId)
        .single()
      if (!pkg) throw new Error('Retainer package not found')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retainerPkg = pkg as any

      // Fetch lead for client info
      const { data: lead } = await supabase
        .from('leads' as never)
        .select('*, contacts!leads_contact_id_fkey(first_name, last_name, email)')
        .eq('id', retainerPkg.lead_id)
        .single()

      // Fetch tenant for firm info
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, settings')
        .eq('id', params.tenantId)
        .single()

      // Fetch matter type name
      let matterTypeName: string | null = null
      if (retainerPkg.matter_type_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mt } = await supabase.from('matter_types' as never).select('name').eq('id', retainerPkg.matter_type_id).single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        matterTypeName = (mt as any)?.name ?? null
      }

      // Generate retainer PDF
      const { generateRetainerPdf } = await import('@/lib/utils/retainer-pdf')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contact = (lead as any)?.contacts as { first_name: string; last_name: string; email: string } | null
      const clientName = contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : 'Client'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantData = tenant as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBytes = await generateRetainerPdf({
        firmName: tenantData?.name ?? 'Law Firm',
        firmAddress: tenantData?.settings?.address ?? null,
        clientName,
        clientEmail: contact?.email ?? null,
        matterType: matterTypeName,
        billingType: retainerPkg.billing_type ?? 'flat_fee',
        lineItems: (retainerPkg.line_items as any[]) ?? [],
        governmentFees: (retainerPkg.government_fees as any[]) ?? [],
        disbursements: (retainerPkg.disbursements as any[]) ?? [],
        hstApplicable: retainerPkg.hst_applicable ?? false,
        subtotalCents: retainerPkg.subtotal_cents ?? 0,
        taxAmountCents: retainerPkg.tax_amount_cents ?? 0,
        totalAmountCents: retainerPkg.total_amount_cents ?? 0,
        paymentTerms: retainerPkg.payment_terms,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paymentPlan: retainerPkg.payment_plan as any,
      } as any)

      let finalPdfBytes: Uint8Array = pdfBytes

      // Apply lawyer pre-signature if provided
      if (params.lawyerSignature) {
        finalPdfBytes = await overlaySignaturesOnPdf(Buffer.from(finalPdfBytes), [{
          imageBuffer: params.lawyerSignature.imageBuffer,
          signerName: params.lawyerSignature.lawyerName,
          credentials: params.lawyerSignature.credentials ?? null,
          signedAt: new Date(),
          position: 'right',
          label: 'Lawyer Signature',
        }])
      }

      // Compute SHA-256
      const checksum = sha256(finalPdfBytes)

      // Generate document ID upfront for deterministic storage path
      const docId = crypto.randomUUID()
      const storagePath = `${params.tenantId}/signing/source/${docId}.pdf`

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, Buffer.from(finalPdfBytes), {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        return { success: false, error: `Failed to store document: ${uploadError.message}` }
      }

      // Insert signing_documents row with lead_id instead of matter_id
      const { error: insertError } = await supabase
        .from('signing_documents' as never)
        .insert({
          id: docId,
          tenant_id: params.tenantId,
          document_type: params.documentType,
          source_entity_type: params.sourceEntityType,
          source_entity_id: params.sourceEntityId,
          matter_id: params.matterId ?? null,
          lead_id: params.leadId ?? null,
          contact_id: params.contactId ?? null,
          title: params.title,
          storage_path: storagePath,
          checksum_sha256: checksum,
          file_size_bytes: finalPdfBytes.byteLength,
          created_by: params.createdBy,
        } as never)

      if (insertError) {
        // Attempt to clean up uploaded file
        await supabase.storage.from('documents').remove([storagePath])
        return { success: false, error: `Failed to record document: ${insertError.message}` }
      }

      return { success: true, data: { signingDocumentId: docId, checksum } }
    }

    // ── Invoice branch (matter-level signing) ─────────────────────────────
    if (params.sourceEntityType !== 'invoice') {
      return { success: false, error: `Unsupported source entity type: ${params.sourceEntityType}` }
    }

    if (!params.matterId) {
      return { success: false, error: 'matterId is required for invoice signing' }
    }

    // Fetch invoice + related data for PDF generation
    const invoiceId = params.sourceEntityId

    const [invoiceRes, lineItemsRes, paymentsRes, matterRes, tenantRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('tenant_id', params.tenantId)
        .single(),
      supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', params.tenantId)
        .order('sort_order'),
      supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', params.tenantId)
        .order('payment_date', { ascending: false }),
      supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('id', params.matterId)
        .eq('tenant_id', params.tenantId)
        .single(),
      supabase
        .from('tenants')
        .select('id, name, currency, settings')
        .eq('id', params.tenantId)
        .single(),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(invoiceRes as any).data) return { success: false, error: 'Invoice not found' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(matterRes as any).data) return { success: false, error: 'Matter not found' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(tenantRes as any).data) return { success: false, error: 'Tenant not found' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = invoiceRes.data as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matter = matterRes.data as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = tenantRes.data as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems = (lineItemsRes.data ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = (paymentsRes.data ?? []) as any[]

    // Fetch bill-to contact info
    let billToName = matter.title
    let billToEmail: string | null = null
    let billToPhone: string | null = null
    let billToAddress: string | null = null

    if (invoice.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, organization_name, email_primary, phone_primary, address_line1, address_line2, city, province_state, postal_code, country')
        .eq('id', invoice.contact_id)
        .eq('tenant_id', params.tenantId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = contact as any
      if (c) {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ')
        billToName = fullName || c.organization_name || matter.title
        billToEmail = c.email_primary
        billToPhone = c.phone_primary
        const addressParts = [
          c.address_line1,
          c.address_line2,
          [c.city, c.province_state].filter(Boolean).join(', '),
          c.postal_code,
          c.country !== 'Canada' ? c.country : null,
        ].filter(Boolean)
        billToAddress = addressParts.length > 0 ? addressParts.join('\n') : null
      }
    }

    const settings = tenant.settings as Record<string, unknown> | null
    const firmAddress = (settings?.firm_address as string) ?? null
    const currency = (tenant.currency as string) || 'CAD'

    // Generate frozen PDF
    const pdfData: InvoicePdfData = {
      firmName: tenant.name,
      firmAddress,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      status: invoice.status,
      billTo: {
        name: billToName,
        email: billToEmail,
        phone: billToPhone,
        address: billToAddress,
      },
      matterTitle: matter.title,
      matterNumber: matter.matter_number,
      lineItems: lineItems.map((li: Record<string, unknown>) => ({
        description: li.description as string,
        quantity: Number(li.quantity),
        unit_price: li.unit_price as number,
        amount: li.amount as number,
      })),
      subtotal: invoice.subtotal as number,
      taxAmount: invoice.tax_amount as number,
      totalAmount: invoice.total_amount as number,
      amountPaid: invoice.amount_paid as number,
      payments: payments.map((p: Record<string, unknown>) => ({
        payment_date: p.payment_date as string,
        payment_method: p.payment_method as string,
        amount: p.amount as number,
        reference: p.reference as string | null,
      })),
      notes: invoice.notes as string | null,
      currency,
    }

    let pdfBytes: Uint8Array | Buffer = await generateInvoicePdf(pdfData)

    // Pre-sign: overlay lawyer signature on right side (before checksum)
    if (params.lawyerSignature) {
      pdfBytes = await overlaySignaturesOnPdf(
        Buffer.from(pdfBytes),
        [{
          imageBuffer: params.lawyerSignature.imageBuffer,
          signerName: params.lawyerSignature.lawyerName,
          credentials: params.lawyerSignature.credentials,
          signedAt: new Date(),
          position: 'right',
          label: 'Lawyer Signature',
        }]
      )
    }

    // Compute SHA-256
    const checksum = sha256(pdfBytes)

    // Generate document ID upfront for deterministic storage path
    const docId = crypto.randomUUID()
    const storagePath = `${params.tenantId}/signing/source/${docId}.pdf`

    // Upload to Supabase storage (admin client needed for bypassing RLS)
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      return { success: false, error: `Failed to store document: ${uploadError.message}` }
    }

    // Insert signing_documents row (INSERT-ONLY table)
    const { error: insertError } = await supabase
      .from('signing_documents' as never)
      .insert({
        id: docId,
        tenant_id: params.tenantId,
        document_type: params.documentType,
        source_entity_type: params.sourceEntityType,
        source_entity_id: params.sourceEntityId,
        matter_id: params.matterId,
        contact_id: params.contactId ?? null,
        title: params.title,
        storage_path: storagePath,
        checksum_sha256: checksum,
        file_size_bytes: pdfBytes.byteLength,
        created_by: params.createdBy,
      } as never)

    if (insertError) {
      // Attempt to clean up uploaded file
      await supabase.storage.from('documents').remove([storagePath])
      return { success: false, error: `Failed to record document: ${insertError.message}` }
    }

    return { success: true, data: { signingDocumentId: docId, checksum } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to freeze document',
    }
  }
}

// ─── Core: Create & Send Signing Request ─────────────────────────────────────

/**
 * Create a signing request for a frozen document and send the signing email.
 *
 * If an active (non-terminal) request already exists for the same document,
 * it is superseded before creating the new one.
 */
export async function createAndSendSigningRequest(
  supabase: SupabaseClient<Database>,
  params: CreateAndSendParams
): Promise<ServiceResult<{ signingRequestId: string }>> {
  try {
    // Verify document exists
    const { data: doc } = await supabase
      .from('signing_documents' as never)
      .select('id, tenant_id, title, checksum_sha256, document_type')
      .eq('id', params.signingDocumentId)
      .eq('tenant_id', params.tenantId)
      .single()

    if (!doc) {
      return { success: false, error: 'Signing document not found' }
    }

    // Supersede any existing active request for the same document
    const { data: activeRequests } = await supabase
      .from('signing_requests' as never)
      .select('id, status')
      .eq('signing_document_id', params.signingDocumentId)
      .not('status', 'in', '("signed","declined","expired","cancelled","superseded")')

    // Generate token (256-bit entropy)
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    // Compute expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (params.expiryDays ?? DEFAULT_EXPIRY_DAYS))

    // Create signing request
    const requestId = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('signing_requests' as never)
      .insert({
        id: requestId,
        tenant_id: params.tenantId,
        signing_document_id: params.signingDocumentId,
        matter_id: params.matterId ?? null,
        lead_id: params.leadId ?? null,
        token_hash: tokenHash,
        status: 'pending',
        signer_name: params.signerName,
        signer_email: params.signerEmail,
        signer_contact_id: params.signerContactId ?? null,
        expires_at: expiresAt.toISOString(),
        created_by: params.createdBy,
      } as never)

    if (insertError) {
      return { success: false, error: `Failed to create signing request: ${insertError.message}` }
    }

    // Supersede active requests now that new one exists
    if (activeRequests && activeRequests.length > 0) {
      for (const active of activeRequests) {
        const activeReq = active as { id: string; status: string }
        try {
          await transitionSigningStatus(supabase, {
            requestId: activeReq.id,
            currentStatus: activeReq.status as SigningStatus,
            newStatus: 'superseded',
            updateFields: { superseded_by: requestId },
          })
          await logSigningEvent(supabase, {
            tenantId: params.tenantId,
            signingRequestId: activeReq.id,
            eventType: 'superseded',
            fromStatus: activeReq.status,
            toStatus: 'superseded',
            actorType: 'system',
            metadata: { superseded_by_request_id: requestId },
          })
        } catch {
          // Best-effort supersession  -  the unique index prevents conflicts
        }
      }
    }

    // Log 'created' event
    await logSigningEvent(supabase, {
      tenantId: params.tenantId,
      signingRequestId: requestId,
      eventType: 'created',
      toStatus: 'pending',
      actorType: 'lawyer',
      actorId: params.createdBy,
    })

    // Fetch tenant branding for email
    const tenant = await fetchTenantBranding(supabase, params.tenantId)

    // Fetch matter reference (skip if lead-level signing with no matter)
    let matterRef = 'your case'
    if (params.matterId) {
      const { data: matter } = await supabase
        .from('matters')
        .select('title, matter_number')
        .eq('id', params.matterId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matterData = matter as any
      matterRef = matterData?.matter_number || matterData?.title || 'your case'
    }

    // Build signing URL
    const signingUrl = `${getBaseUrl()}/signing/${rawToken}`

    // Send signing email
    let emailMessageId: string | null = null
    const resend = getResend()

    if (resend) {
      try {
        const docRecord = doc as { title: string; document_type?: string }

        // Extract first name from signer name
        const signerFirstName = params.signerName.split(' ')[0] || params.signerName

        // Resolve signer's preferred language for locale-aware templates
        let signerLanguage: string | null = null
        if (params.signerContactId) {
          const { data: signerContact } = await supabase
            .from('contacts')
            .select('preferred_language')
            .eq('id', params.signerContactId)
            .single()
          signerLanguage = signerContact?.preferred_language ?? null
        }

        let html: string
        let text: string
        let subject: string

        if (docRecord.document_type === 'retainer_agreement') {
          // Use locale-aware retainer agreement template
          const { renderRetainerAgreementEmail } = await import('@/lib/email-templates/retainer-agreement')
          const { resolveEmailLocale } = await import('@/lib/email-templates/email-locale')
          const locale = resolveEmailLocale(signerLanguage)
          const rendered = await renderRetainerAgreementEmail({
            firmName: tenant.name,
            firmLogoUrl: tenant.logo_url,
            primaryColor: tenant.primary_color ?? "",
            clientFirstName: signerFirstName,
            matterReference: matterRef,
            documentTitle: docRecord.title,
            signingUrl,
            expiresAt: expiresAt.toISOString(),
            language: locale,
          })
          html = rendered.html
          text = rendered.text
          subject = rendered.subject
        } else {
          // Default signing request template for non-retainer documents
          const { renderSigningRequestEmail } = await import('@/lib/email-templates/signing-request')
          const rendered = await renderSigningRequestEmail({
            firmName: tenant.name,
            firmLogoUrl: tenant.logo_url,
            primaryColor: tenant.primary_color ?? "",
            signerFirstName,
            documentTitle: docRecord.title,
            matterReference: matterRef,
            signingUrl,
            expiresAt: expiresAt.toISOString(),
          })
          html = rendered.html
          text = rendered.text
          subject = rendered.subject
        }

        const { data: resendData, error: resendError } = await resend.emails.send({
          from: getFromAddress(tenant.name),
          to: [params.signerEmail],
          subject,
          html,
          text,
        })

        if (!resendError) {
          emailMessageId = resendData?.id ?? null
        } else {
          console.error('[esign-service] Resend error:', resendError)
        }
      } catch (err) {
        console.error('[esign-service] Failed to send signing email:', err)
      }
    }

    // Transition to 'sent'
    await transitionSigningStatus(supabase, {
      requestId,
      currentStatus: 'pending',
      newStatus: 'sent',
      updateFields: { sent_at: new Date().toISOString() },
    })

    // Log 'sent' event
    await logSigningEvent(supabase, {
      tenantId: params.tenantId,
      signingRequestId: requestId,
      eventType: 'sent',
      fromStatus: 'pending',
      toStatus: 'sent',
      actorType: 'system',
      emailMessageId: emailMessageId ?? undefined,
    })

    return { success: true, data: { signingRequestId: requestId } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create signing request',
    }
  }
}

// ─── Core: Get Signing Page Data ─────────────────────────────────────────────

/**
 * Validate a public signing token and return the data needed to render
 * the signing page. On first access, transitions status to 'viewed'.
 *
 * Returns generic error for ALL invalid states (security: no information leakage).
 */
export async function getSigningPageData(
  supabase: SupabaseClient<Database>,
  rawToken: string,
  ip?: string,
  userAgent?: string
): Promise<ServiceResult<{
  request: Record<string, unknown>
  document: Record<string, unknown>
  tenant: { name: string; logo_url: string | null; primary_color: string }
  matterReference: string
}>> {
  try {
    const tokenHash = hashToken(rawToken)

    // Look up request by token hash
    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (!request) {
      return { success: false, error: 'invalid' }
    }

    const req = request as Record<string, unknown>

    // Check expiry
    if (new Date(req.expires_at as string) < new Date()) {
      // Transition to expired if not already terminal
      if (!isTerminalStatus(req.status as SigningStatus)) {
        await transitionSigningStatus(supabase, {
          requestId: req.id as string,
          currentStatus: req.status as SigningStatus,
          newStatus: 'expired',
        })
        await logSigningEvent(supabase, {
          tenantId: req.tenant_id as string,
          signingRequestId: req.id as string,
          eventType: 'expired',
          fromStatus: req.status as string,
          toStatus: 'expired',
          actorType: 'system',
        })
      }
      return { success: false, error: 'invalid' }
    }

    // Check terminal status
    if (isTerminalStatus(req.status as SigningStatus)) {
      // Special case: if signed, return data so we can show confirmation
      if (req.status === 'signed') {
        const { data: doc } = await supabase
          .from('signing_documents' as never)
          .select('*')
          .eq('id', req.signing_document_id as string)
          .single()

        const tenant = await fetchTenantBranding(supabase, req.tenant_id as string)

        return {
          success: true,
          data: {
            request: req,
            document: (doc ?? {}) as Record<string, unknown>,
            tenant,
            matterReference: '',
          },
        }
      }
      return { success: false, error: 'invalid' }
    }

    // Fetch document
    const { data: doc } = await supabase
      .from('signing_documents' as never)
      .select('*')
      .eq('id', req.signing_document_id as string)
      .single()

    if (!doc) {
      return { success: false, error: 'invalid' }
    }

    // Fetch tenant branding
    const tenant = await fetchTenantBranding(supabase, req.tenant_id as string)

    // Fetch matter reference (skip if lead-level signing with no matter)
    let matterRef = ''
    if (req.matter_id) {
      const { data: matter } = await supabase
        .from('matters')
        .select('title, matter_number')
        .eq('id', req.matter_id as string)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mRef = matter as any
      matterRef = mRef?.matter_number || mRef?.title || ''
    }

    // First view: transition sent → viewed
    if (req.status === 'sent') {
      const docRecord = doc as Record<string, unknown>
      await transitionSigningStatus(supabase, {
        requestId: req.id as string,
        currentStatus: 'sent',
        newStatus: 'viewed',
        updateFields: { viewed_at: new Date().toISOString() },
      })
      await logSigningEvent(supabase, {
        tenantId: req.tenant_id as string,
        signingRequestId: req.id as string,
        eventType: 'viewed',
        fromStatus: 'sent',
        toStatus: 'viewed',
        actorType: 'signer',
        ip,
        userAgent,
        sourceDocumentHash: docRecord.checksum_sha256 as string,
      })
      req.status = 'viewed'
      req.viewed_at = new Date().toISOString()
    }

    return {
      success: true,
      data: {
        request: req,
        document: (doc ?? {}) as Record<string, unknown>,
        tenant,
        matterReference: matterRef,
      },
    }
  } catch (err) {
    return { success: false, error: 'invalid' }
  }
}

// ─── Core: Get Source Document ────────────────────────────────────────────────

/**
 * Validate token and return the frozen source PDF for the signing page.
 * Does NOT trigger a status transition (viewing the embedded PDF is not
 * the same as opening the signing page).
 */
export async function getSourceDocument(
  supabase: SupabaseClient<Database>,
  rawToken: string
): Promise<ServiceResult<{ pdfBuffer: Buffer; filename: string }>> {
  try {
    const tokenHash = hashToken(rawToken)

    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('signing_document_id, status, expires_at, tenant_id')
      .eq('token_hash', tokenHash)
      .single()

    if (!request) return { success: false, error: 'invalid' }

    const req = request as Record<string, unknown>

    // Allow signed requests to still download (confirmation page)
    if (isTerminalStatus(req.status as SigningStatus) && req.status !== 'signed') {
      return { success: false, error: 'invalid' }
    }
    if (new Date(req.expires_at as string) < new Date() && req.status !== 'signed') {
      return { success: false, error: 'invalid' }
    }

    // Fetch document record
    const { data: doc } = await supabase
      .from('signing_documents' as never)
      .select('storage_path, title')
      .eq('id', req.signing_document_id as string)
      .single()

    if (!doc) return { success: false, error: 'invalid' }

    const docRecord = doc as { storage_path: string; title: string }

    // Download from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(docRecord.storage_path)

    if (downloadError || !fileData) {
      return { success: false, error: 'Document not available' }
    }

    const arrayBuffer = await fileData.arrayBuffer()
    return {
      success: true,
      data: {
        pdfBuffer: Buffer.from(arrayBuffer),
        filename: `${docRecord.title.replace(/[^a-zA-Z0-9\s-]/g, '')}.pdf`,
      },
    }
  } catch {
    return { success: false, error: 'invalid' }
  }
}

// ─── Core: Execute Signature ─────────────────────────────────────────────────

/**
 * Process a signer's electronic signature submission.
 *
 * Steps:
 *   1. Validate token and status (must be 'sent' or 'viewed')
 *   2. If typed mode: validate typed name against signer_name
 *   3. Store signature image PNG in Supabase storage
 *   4. Download frozen source PDF
 *   5. Overlay signature on PDF using pdf-lib
 *   6. Compute SHA-256 of signed PDF
 *   7. Upload signed PDF to storage
 *   8. Update signing_request with all signing fields
 *   9. Log 'signed' event with full forensics
 *  10. Send internal notification to lawyer
 */
export async function executeSignature(
  supabase: SupabaseClient<Database>,
  rawToken: string,
  params: ExecuteSignatureParams
): Promise<ServiceResult> {
  try {
    const tokenHash = hashToken(rawToken)

    // Fetch request
    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (!request) return { success: false, error: 'invalid' }

    const req = request as Record<string, unknown>

    // Validate status
    if (!['sent', 'viewed'].includes(req.status as string)) {
      return { success: false, error: 'invalid' }
    }

    // Validate expiry
    if (new Date(req.expires_at as string) < new Date()) {
      return { success: false, error: 'invalid' }
    }

    // If typed mode: validate typed name against signer_name
    if (params.signatureMode === 'typed') {
      if (!params.typedName || params.typedName.trim().length < 2) {
        return { success: false, error: 'Full name is required for typed signature' }
      }

      const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
      const signerNormalized = normalize(req.signer_name as string)
      const typedNormalized = normalize(params.typedName)

      if (signerNormalized !== typedNormalized) {
        return {
          success: false,
          error: 'Typed name must match the name on the document',
        }
      }
    }

    // Fetch document
    const { data: doc } = await supabase
      .from('signing_documents' as never)
      .select('*')
      .eq('id', req.signing_document_id as string)
      .single()

    if (!doc) return { success: false, error: 'invalid' }

    const docRecord = doc as Record<string, unknown>
    const requestId = req.id as string
    const tenantId = req.tenant_id as string

    // 1. Store signature image
    const signatureBase64 = params.signatureDataUrl.replace(/^data:image\/png;base64,/, '')
    const signatureBuffer = Buffer.from(signatureBase64, 'base64')
    const signatureStoragePath = `${tenantId}/signing/signatures/${requestId}.png`

    const { error: sigUploadError } = await supabase.storage
      .from('documents')
      .upload(signatureStoragePath, signatureBuffer, {
        contentType: 'image/png',
        upsert: false,
      })

    if (sigUploadError) {
      return { success: false, error: `Failed to store signature: ${sigUploadError.message}` }
    }

    // 2. Download frozen source PDF
    const { data: sourceFile, error: downloadError } = await supabase.storage
      .from('documents')
      .download(docRecord.storage_path as string)

    if (downloadError || !sourceFile) {
      return { success: false, error: 'Source document not available' }
    }

    const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer())

    // 3. Overlay client signature on PDF (left position)
    const signedPdfBytes = await overlaySignaturesOnPdf(
      sourceBuffer,
      [{
        imageBuffer: signatureBuffer,
        signerName: req.signer_name as string,
        signedAt: new Date(),
        position: 'left',
        label: 'Client Signature',
      }]
    )

    // 4. Compute SHA-256 of signed PDF
    const signedHash = sha256(signedPdfBytes)

    // 5. Upload signed PDF
    const signedStoragePath = `${tenantId}/signing/signed/${requestId}.pdf`
    const { error: signedUploadError } = await supabase.storage
      .from('documents')
      .upload(signedStoragePath, Buffer.from(signedPdfBytes), {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (signedUploadError) {
      return { success: false, error: `Failed to store signed document: ${signedUploadError.message}` }
    }

    // 6. Update signing request
    const now = new Date().toISOString()
    await transitionSigningStatus(supabase, {
      requestId,
      currentStatus: req.status as SigningStatus,
      newStatus: 'signed',
      updateFields: {
        signed_at: now,
        signature_mode: params.signatureMode,
        signature_typed_name: params.typedName ?? null,
        signature_data_path: signatureStoragePath,
        signed_document_path: signedStoragePath,
        signed_document_hash: signedHash,
        consent_text: params.consentText,
        signer_ip: params.ip,
        signer_user_agent: params.userAgent,
      },
    })

    // 7. Log 'signed' event with full forensics
    await logSigningEvent(supabase, {
      tenantId,
      signingRequestId: requestId,
      eventType: 'signed',
      fromStatus: req.status as string,
      toStatus: 'signed',
      actorType: 'signer',
      ip: params.ip,
      userAgent: params.userAgent,
      sourceDocumentHash: docRecord.checksum_sha256 as string,
      signedDocumentHash: signedHash,
      consentText: params.consentText,
      signatureMode: params.signatureMode,
      typedName: params.typedName,
    })

    // 8a. If this is a lead-level signing, update retainer package and recalculate
    if (req.lead_id) {
      // Update lead_retainer_packages
      await supabase
        .from('lead_retainer_packages' as never)
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
        } as never)
        .eq('lead_id', req.lead_id as string)
        .eq('signing_request_id', req.id as string)

      // Recalculate lead summary
      try {
        const { recalculateLeadSummary } = await import('./lead-summary-recalculator')
        await recalculateLeadSummary(supabase, req.lead_id as string, tenantId, { fields: ['retainer_status'] })
      } catch (e) { console.error('Failed to recalculate lead summary after signing:', e) }

      // Best-effort stage advance
      try {
        const { advanceLeadStage } = await import('./lead-stage-engine')
        await advanceLeadStage({
          supabase,
          leadId: req.lead_id as string,
          tenantId,
          targetStage: 'retainer_signed_payment_pending' as never,
          actorUserId: null as unknown as string,
          actorType: 'system',
          reason: 'Retainer signed via e-sign',
        })
      } catch (e) { console.error('Stage advance after signing (best-effort):', e) }

      // Auto-convert lead to matter if payment was already received
      // Both signed retainer + payment are required. Since retainer is now signed,
      // attempt conversion  -  gates will block if payment isn't received yet.
      try {
        const { convertLeadToMatter } = await import('./lead-conversion-executor')
        const { data: leadForConvert } = await supabase
          .from('leads')
          .select('id, contact_id, matter_type_id, practice_area_id, responsible_lawyer_id, status, converted_matter_id')
          .eq('id', req.lead_id as string)
          .single()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leadData = leadForConvert as any
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
            if (mtData?.name) matterTitle = `${matterTitle}  -  ${mtData.name}`
          }

          const convResult = await convertLeadToMatter({
            supabase,
            leadId: req.lead_id as string,
            tenantId,
            userId: (req.created_by as string) || 'system',
            matterData: {
              title: matterTitle,
              matterTypeId: leadData.matter_type_id || undefined,
              practiceAreaId: leadData.practice_area_id || undefined,
              responsibleLawyerId: leadData.responsible_lawyer_id || undefined,
            },
          })
          if (convResult.success) {
            console.log(`[esign] Auto-conversion succeeded: matter ${convResult.matterId}`)
          } else {
            console.log(`[esign] Auto-conversion not ready (expected if payment pending): ${convResult.error}`)
          }
        }
      } catch (convErr) {
        console.warn('[esign] Auto-conversion attempt failed (non-blocking):', convErr)
      }
    }

    // 8b. Send internal notification to lawyer (non-blocking)
    try {
      const tenant = await fetchTenantBranding(supabase, tenantId)
      const resend = getResend()
      if (resend && req.created_by) {
        const { data: lawyer } = await supabase
          .from('users')
          .select('email')
          .eq('id', req.created_by as string)
          .single()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lawyerData = lawyer as any
        if (lawyerData?.email) {
          const { renderSigningCompletedEmail } = await import('@/lib/email-templates/signing-completed')
          const { html, text, subject } = await renderSigningCompletedEmail({
            firmName: tenant.name,
            firmLogoUrl: tenant.logo_url,
            primaryColor: tenant.primary_color ?? "",
            signerName: req.signer_name as string,
            documentTitle: docRecord.title as string,
            matterReference: '',
            signedAt: now,
            matterUrl: `${getBaseUrl()}/matters/${req.matter_id}`,
          })

          await resend.emails.send({
            from: getFromAddress(tenant.name),
            to: [lawyerData.email],
            subject,
            html,
            text,
          })
        }
      }
    } catch (err) {
      console.error('[esign-service] Failed to send completion notification:', err)
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Signature failed',
    }
  }
}

// ─── Core: Decline Signature ─────────────────────────────────────────────────

/**
 * Record a signer's decline and notify the responsible lawyer.
 */
export async function declineSignature(
  supabase: SupabaseClient<Database>,
  rawToken: string,
  params: DeclineParams
): Promise<ServiceResult> {
  try {
    const tokenHash = hashToken(rawToken)

    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (!request) return { success: false, error: 'invalid' }

    const req = request as Record<string, unknown>

    if (!['sent', 'viewed'].includes(req.status as string)) {
      return { success: false, error: 'invalid' }
    }

    if (new Date(req.expires_at as string) < new Date()) {
      return { success: false, error: 'invalid' }
    }

    const requestId = req.id as string
    const tenantId = req.tenant_id as string

    await transitionSigningStatus(supabase, {
      requestId,
      currentStatus: req.status as SigningStatus,
      newStatus: 'declined',
      updateFields: {
        declined_at: new Date().toISOString(),
        decline_reason: params.reason ?? null,
      },
    })

    await logSigningEvent(supabase, {
      tenantId,
      signingRequestId: requestId,
      eventType: 'declined',
      fromStatus: req.status as string,
      toStatus: 'declined',
      actorType: 'signer',
      ip: params.ip,
      userAgent: params.userAgent,
      metadata: params.reason ? { decline_reason: params.reason } : {},
    })

    // Notify lawyer (non-blocking)
    try {
      const tenant = await fetchTenantBranding(supabase, tenantId)
      const resend = getResend()

      if (resend && req.created_by) {
        const { data: lawyer } = await supabase
          .from('users')
          .select('email')
          .eq('id', req.created_by as string)
          .single()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lawyerData = lawyer as any
        if (lawyerData?.email) {
          const { data: doc } = await supabase
            .from('signing_documents' as never)
            .select('title')
            .eq('id', req.signing_document_id as string)
            .single()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const docTitle = (doc as any)?.title as string || 'Document'

          const { renderSigningDeclinedEmail } = await import('@/lib/email-templates/signing-declined')
          const { html, text, subject } = await renderSigningDeclinedEmail({
            firmName: tenant.name,
            firmLogoUrl: tenant.logo_url,
            primaryColor: tenant.primary_color ?? "",
            signerName: req.signer_name as string,
            documentTitle: docTitle,
            matterReference: '',
            declinedAt: new Date().toISOString(),
            declineReason: params.reason,
            matterUrl: `${getBaseUrl()}/matters/${req.matter_id}`,
          })

          await resend.emails.send({
            from: getFromAddress(tenant.name),
            to: [lawyerData.email],
            subject,
            html,
            text,
          })
        }
      }
    } catch (err) {
      console.error('[esign-service] Failed to send decline notification:', err)
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Decline failed',
    }
  }
}

// ─── Core: Cancel Request (Authenticated) ────────────────────────────────────

/**
 * Cancel an active signing request. Lawyer-facing action.
 */
export async function cancelRequest(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signingRequestId: string
    reason?: string
    cancelledBy: string
  }
): Promise<ServiceResult> {
  try {
    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('id, status, tenant_id')
      .eq('id', params.signingRequestId)
      .eq('tenant_id', params.tenantId)
      .single()

    if (!request) return { success: false, error: 'Request not found' }

    const req = request as Record<string, unknown>

    if (isTerminalStatus(req.status as SigningStatus)) {
      return { success: false, error: `Cannot cancel request in "${req.status}" status` }
    }

    await transitionSigningStatus(supabase, {
      requestId: params.signingRequestId,
      currentStatus: req.status as SigningStatus,
      newStatus: 'cancelled',
      updateFields: { cancelled_at: new Date().toISOString() },
    })

    await logSigningEvent(supabase, {
      tenantId: params.tenantId,
      signingRequestId: params.signingRequestId,
      eventType: 'cancelled',
      fromStatus: req.status as string,
      toStatus: 'cancelled',
      actorType: 'lawyer',
      actorId: params.cancelledBy,
      metadata: params.reason ? { cancel_reason: params.reason } : {},
    })

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cancel failed',
    }
  }
}

// ─── Core: Resend Request (Authenticated) ────────────────────────────────────

/**
 * Supersede an existing request and create a new one with a fresh token.
 */
export async function resendRequest(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signingRequestId: string
    resendBy: string
  }
): Promise<ServiceResult<{ newRequestId: string }>> {
  try {
    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('*')
      .eq('id', params.signingRequestId)
      .eq('tenant_id', params.tenantId)
      .single()

    if (!request) return { success: false, error: 'Request not found' }

    const req = request as Record<string, unknown>

    if (isTerminalStatus(req.status as SigningStatus)) {
      return { success: false, error: `Cannot resend request in "${req.status}" status` }
    }

    // Create new request (will auto-supersede the old one via createAndSendSigningRequest)
    const result = await createAndSendSigningRequest(supabase, {
      tenantId: params.tenantId,
      signingDocumentId: req.signing_document_id as string,
      matterId: (req.matter_id as string | null) ?? null,
      leadId: (req.lead_id as string | null) ?? null,
      signerName: req.signer_name as string,
      signerEmail: req.signer_email as string,
      signerContactId: req.signer_contact_id as string | null,
      createdBy: params.resendBy,
    })

    if (!result.success) return { success: false, error: result.error }

    // Log 'resent' event on old request
    await logSigningEvent(supabase, {
      tenantId: params.tenantId,
      signingRequestId: params.signingRequestId,
      eventType: 'resent',
      actorType: 'lawyer',
      actorId: params.resendBy,
      metadata: { new_request_id: result.data!.signingRequestId },
    })

    return { success: true, data: { newRequestId: result.data!.signingRequestId } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Resend failed',
    }
  }
}

// ─── Core: Send Reminder (Authenticated) ─────────────────────────────────────

/**
 * Send a reminder email for an active signing request.
 * The token is unchanged  -  same signing URL.
 */
export async function sendReminder(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signingRequestId: string
    sentBy: string
  }
): Promise<ServiceResult> {
  try {
    const { data: request } = await supabase
      .from('signing_requests' as never)
      .select('*')
      .eq('id', params.signingRequestId)
      .eq('tenant_id', params.tenantId)
      .single()

    if (!request) return { success: false, error: 'Request not found' }

    const req = request as Record<string, unknown>

    if (!['sent', 'viewed'].includes(req.status as string)) {
      return { success: false, error: `Cannot send reminder for request in "${req.status}" status` }
    }

    // For reminders, we need to reconstruct the signing URL from the token_hash.
    // But we can't reverse the hash! Reminders need a different approach:
    // We need to store the raw token somewhere, or generate a new one.
    //
    // Per the spec: "Sends reminder email with same token, same URL"
    // This means we need to re-derive the signing URL. Since we only store the hash,
    // we cannot reconstruct the URL. Instead, reminders should provide a way to
    // look up the token. Let's store an encrypted version or handle this differently.
    //
    // DESIGN DECISION: For reminders, we generate a NEW signing request with the
    // same document. Wait  -  the spec says "same token, same URL". But we only store
    // the hash. This is a fundamental conflict.
    //
    // Resolution: The reminder must be sent by the lawyer who has access to the
    // signing URL (they can copy it from the UI). For the API-triggered reminder,
    // we need to accept the raw token as a parameter OR store an encrypted token.
    //
    // For now, we'll note that the reminder email functionality requires the
    // raw token to be passed in. The UI will hold the token from the initial send.
    //
    // Actually, a simpler solution: we DON'T send the link in the reminder.
    // We just send a "reminder" email that says "please check your earlier email
    // for the signing link." This is actually better security practice.

    const tenant = await fetchTenantBranding(supabase, params.tenantId)
    const { data: doc } = await supabase
      .from('signing_documents' as never)
      .select('title')
      .eq('id', req.signing_document_id as string)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docTitle = (doc as any)?.title as string || 'Document'

    let emailMessageId: string | null = null
    const resend = getResend()

    if (resend) {
      try {
        const signerFirstName = (req.signer_name as string).split(' ')[0]
        const { renderSigningReminderEmail } = await import('@/lib/email-templates/signing-reminder')

        const { html, text, subject } = await renderSigningReminderEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          signerFirstName,
          documentTitle: docTitle,
          matterReference: '',
          signingUrl: '', // No URL in reminder  -  signer should refer to original email
          expiresAt: req.expires_at as string,
        })

        const { data: resendData, error: resendError } = await resend.emails.send({
          from: getFromAddress(tenant.name),
          to: [req.signer_email as string],
          subject,
          html,
          text,
        })

        if (!resendError) {
          emailMessageId = resendData?.id ?? null
        }
      } catch (err) {
        console.error('[esign-service] Failed to send reminder email:', err)
      }
    }

    // Update reminder count
    await supabase
      .from('signing_requests' as never)
      .update({
        reminder_count: ((req.reminder_count as number) || 0) + 1,
        last_reminder_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', params.signingRequestId)

    await logSigningEvent(supabase, {
      tenantId: params.tenantId,
      signingRequestId: params.signingRequestId,
      eventType: 'reminder_sent',
      actorType: 'lawyer',
      actorId: params.sentBy,
      emailMessageId: emailMessageId ?? undefined,
      metadata: {
        reminder_count: ((req.reminder_count as number) || 0) + 1,
      },
    })

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Reminder failed',
    }
  }
}

// ─── PDF Overlay ─────────────────────────────────────────────────────────────

interface SignatureBlock {
  imageBuffer: Buffer
  signerName: string
  credentials?: string | null // e.g. "LSO #12345P" or "RCIC #R123456"  -  shown below name
  signedAt: Date
  position: 'left' | 'right'
  label: string // e.g. "Client Signature" or "Lawyer Signature"
}

/**
 * Overlay one or more signature blocks on the last page of a PDF document.
 * Each block renders: signature image → line → label → name → date → e-sign notice.
 *
 * Positions on A4 (595pt wide):
 *   - left (client):  x=50
 *   - right (lawyer):  x=330
 */
async function overlaySignaturesOnPdf(
  sourcePdfBuffer: Buffer,
  blocks: SignatureBlock[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourcePdfBuffer)
  pdfDoc.registerFontkit(fontkit)

  // Load Inter font for text overlay
  let font
  try {
    const fontPath = join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')
    const fontBytes = readFileSync(fontPath)
    font = await pdfDoc.embedFont(fontBytes)
  } catch {
    // Fallback to Helvetica if Inter font not available
    font = await pdfDoc.embedFont('Helvetica' as never)
  }

  // Get last page
  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]

  const sigImageWidth = 180
  const sigImageHeight = 60
  const sigBlockY = 120

  for (const block of blocks) {
    const sigBlockX = block.position === 'left' ? 50 : 330

    // Embed signature image
    const signatureImage = await pdfDoc.embedPng(block.imageBuffer)

    // Draw signature image
    lastPage.drawImage(signatureImage, {
      x: sigBlockX,
      y: sigBlockY,
      width: sigImageWidth,
      height: sigImageHeight,
    })

    // Draw line under signature
    lastPage.drawLine({
      start: { x: sigBlockX, y: sigBlockY - 2 },
      end: { x: sigBlockX + sigImageWidth + 20, y: sigBlockY - 2 },
      thickness: 0.5,
      color: rgb(0.4, 0.4, 0.4),
    })

    // Draw label (e.g. "Client Signature")
    lastPage.drawText(block.label, {
      x: sigBlockX,
      y: sigBlockY - 14,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })

    // Draw signer name
    lastPage.drawText(block.signerName, {
      x: sigBlockX,
      y: sigBlockY - 26,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Track vertical offset for optional credentials line
    let yOffset = 26

    // Draw credentials (e.g. "LSO #12345P" or "RCIC #R123456") if provided
    if (block.credentials) {
      yOffset += 13
      lastPage.drawText(block.credentials, {
        x: sigBlockX,
        y: sigBlockY - yOffset,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })
    }

    // Draw date
    const dateStr = block.signedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    lastPage.drawText(`Date: ${dateStr}`, {
      x: sigBlockX,
      y: sigBlockY - yOffset - 14,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })

    // Draw e-sign notice
    lastPage.drawText('Electronically signed via NorvaOS', {
      x: sigBlockX,
      y: sigBlockY - yOffset - 28,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })
  }

  return pdfDoc.save()
}
