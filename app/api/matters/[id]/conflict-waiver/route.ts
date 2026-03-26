/**
 * Directive 067: Conflict Waiver Generation + Portal Sync API
 *
 * POST /api/matters/[id]/conflict-waiver
 * 1. Generates the Conflict Waiver PDF using pdf-lib
 * 2. Stores it in Supabase storage (documents bucket)
 * 3. Creates a document record linked to the matter
 * 4. Creates a signing request for client e-signature
 * 5. Sends portal notification to client
 * 6. Returns { success, documentId, signingRequestId }
 *
 * GET /api/matters/[id]/conflict-waiver
 * Returns the current waiver status (pending_signature, signed, none)
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateConflictWaiverPdf, conflictWaiverFilename } from '@/lib/utils/conflict-waiver-pdf'
import { logAuditEvent } from '@/lib/services/sovereign-audit-engine'

// ── POST: Generate + Push Waiver ─────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matterId } = await params
  const body = await request.json()
  const { conflictDescription } = body as { conflictDescription?: string }

  const supabase = await createServerSupabaseClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id, first_name, last_name, email')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Fetch matter with contact
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('id, title, matter_number, tenant_id, contact_id, conflict_status, contacts(id, first_name, last_name, email_primary)')
    .eq('id', matterId)
    .eq('tenant_id', appUser.tenant_id)
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  // Fetch tenant for firm info
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, settings')
    .eq('id', appUser.tenant_id)
    .single()

  const firmName = (tenant as any)?.name ?? 'Law Firm'
  const firmAddress = (tenant as any)?.settings?.address ?? null
  const contact = (matter as any).contacts as { id: string; first_name: string; last_name: string; email_primary: string } | null
  const clientName = contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : 'Client'
  const lawyerName = `${appUser.first_name ?? ''} ${appUser.last_name ?? ''}`.trim()

  try {
    // 1. Generate the PDF
    const pdfBytes = await generateConflictWaiverPdf({
      firmName,
      firmAddress,
      clientName,
      clientEmail: contact?.email_primary ?? null,
      caseName: (matter as any).title ?? 'Untitled Matter',
      matterNumber: (matter as any).matter_number ?? null,
      conflictDescription: conflictDescription || 'To be specified',
      lawyerName,
      date: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    })

    // 2. Upload to Supabase storage
    const fileName = conflictWaiverFilename(clientName)
    const storagePath = `${appUser.tenant_id}/conflict-waivers/${matterId}/${fileName}`

    const admin = createAdminClient()
    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('[conflict-waiver] Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to store waiver PDF' }, { status: 500 })
    }

    // 3. Compute SHA-256 checksum
    const checksum = crypto.createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex')

    // 4. Create document record
    const { data: doc, error: docError } = await (admin as any)
      .from('documents')
      .insert({
        tenant_id: appUser.tenant_id,
        matter_id: matterId,
        file_name: fileName,
        file_type: 'application/pdf',
        file_size: pdfBytes.length,
        storage_path: storagePath,
        category: 'conflict_waiver',
        status: 'pending_signature',
        uploaded_by: appUser.id,
        source: 'system_generated',
        checksum_sha256: checksum,
      })
      .select('id')
      .single()

    if (docError) {
      console.error('[conflict-waiver] Document record error:', docError)
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    const documentId = (doc as any)?.id

    // 5. Update matter with waiver document reference
    await (admin as any)
      .from('matters')
      .update({
        conflict_status: 'waiver_pending',
        conflict_waiver_document_id: documentId,
        conflict_notes: conflictDescription || null,
      })
      .eq('id', matterId)

    // 6. Create signing request if client has email
    let signingRequestId: string | null = null
    if (contact?.email_primary) {
      // Generate a signing token
      const rawToken = crypto.randomUUID()
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days

      const { data: sigReq } = await (admin as any)
        .from('signing_requests')
        .insert({
          tenant_id: appUser.tenant_id,
          document_id: documentId,
          matter_id: matterId,
          signer_name: clientName,
          signer_email: contact.email_primary,
          signer_contact_id: contact.id,
          token_hash: tokenHash,
          status: 'pending',
          expires_at: expiresAt,
          created_by: appUser.id,
          document_type: 'conflict_waiver',
        })
        .select('id')
        .single()

      signingRequestId = (sigReq as any)?.id ?? null

      // 7. Send notification to client portal
      try {
        await (admin as any).from('client_notifications').insert({
          tenant_id: appUser.tenant_id,
          contact_id: contact.id,
          matter_id: matterId,
          type: 'general',
          title: 'Action Required - Conflict Waiver',
          message: 'A Conflict Waiver requires your signature to begin your case. Please review and sign the document in your portal.',
          status: 'pending',
          metadata: {
            document_id: documentId,
            signing_request_id: signingRequestId,
            notification_type: 'conflict_waiver_signature',
          },
        })
      } catch {
        // Non-blocking
      }

      // 8. Send email notification
      try {
        const { Resend } = await import('resend')
        const apiKey = process.env.RESEND_API_KEY
        if (apiKey) {
          const resend = new Resend(apiKey)
          const fromDomain = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'
          const fromAddress = fromDomain === 'resend.dev'
            ? 'onboarding@resend.dev'
            : `${firmName} <notifications@${fromDomain}>`

          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

          // Find active portal token
          const { data: portalLink } = await (admin as any)
            .from('portal_links')
            .select('token')
            .eq('matter_id', matterId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const portalUrl = portalLink?.token
            ? `${baseUrl}/portal/${portalLink.token}`
            : baseUrl

          await resend.emails.send({
            from: fromAddress,
            to: contact.email_primary,
            subject: `Action Required - Conflict Waiver for ${(matter as any).title}`,
            html: `
              <div style="font-family: Inter, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 32px 24px; background: #0a0a0a; border-radius: 16px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; padding: 6px 16px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 9999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #ef4444;">
                      Action Required
                    </div>
                  </div>
                  <h1 style="color: #ffffff; font-size: 20px; font-weight: 600; text-align: center; margin: 0 0 8px 0;">
                    Conflict Waiver - Signature Required
                  </h1>
                  <p style="color: rgba(255,255,255,0.5); font-size: 13px; text-align: center; margin: 0 0 24px 0;">
                    ${firmName} requires your signed consent to proceed with your case.
                  </p>
                  <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px; line-height: 1.6; margin: 0;">
                      Dear ${clientName},<br/><br/>
                      A potential conflict of interest has been identified in connection with your case
                      <strong style="color: #ffffff;">${(matter as any).title}</strong>.
                      As required by the Law Society Rules of Professional Conduct, we need your informed consent before we can proceed.<br/><br/>
                      Please review and sign the Conflict Waiver document in your client portal.
                    </p>
                  </div>
                  <div style="text-align: center;">
                    <a href="${portalUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 12px; letter-spacing: 0.05em;">
                      Open Portal & Sign
                    </a>
                  </div>
                </div>
                <p style="color: #666; font-size: 11px; text-align: center; margin-top: 16px;">
                  This is an automated message from ${firmName} via NorvaOS.
                </p>
              </div>
            `,
          })
        }
      } catch (emailErr) {
        console.error('[conflict-waiver] Email send error:', emailErr)
        // Non-blocking
      }
    }

    // 9. Audit log
    await logAuditEvent({
      tenantId: appUser.tenant_id,
      userId: appUser.id,
      eventType: 'CONFLICT_DETECTED' as any,
      severity: 'warning',
      tableName: 'documents',
      recordId: documentId,
      metadata: {
        after: {
          action: 'waiver_generated',
          matter_id: matterId,
          matter_title: (matter as any).title,
          client_name: clientName,
          document_id: documentId,
          signing_request_id: signingRequestId,
          checksum_sha256: checksum,
        },
      },
    })

    return NextResponse.json({
      success: true,
      documentId,
      signingRequestId,
      fileName,
      storagePath,
    })
  } catch (err) {
    console.error('[conflict-waiver] Generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate waiver' },
      { status: 500 },
    )
  }
}

// ── GET: Check Waiver Status ─────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matterId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get matter conflict info
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('id, conflict_status, conflict_waiver_document_id')
    .eq('id', matterId)
    .eq('tenant_id', appUser.tenant_id)
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  // If there's a waiver document, check signing status
  let signingStatus: string | null = null
  if ((matter as any).conflict_waiver_document_id) {
    const { data: sigReq } = await (supabase as any)
      .from('signing_requests')
      .select('id, status')
      .eq('document_id', (matter as any).conflict_waiver_document_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    signingStatus = (sigReq as any)?.status ?? null
  }

  return NextResponse.json({
    conflictStatus: (matter as any).conflict_status,
    waiverDocumentId: (matter as any).conflict_waiver_document_id,
    signingStatus,
    isCleared: (matter as any).conflict_status === 'cleared' || (matter as any).conflict_status === 'waiver_approved',
    isWaiverSigned: signingStatus === 'signed' || signingStatus === 'completed',
  })
}
