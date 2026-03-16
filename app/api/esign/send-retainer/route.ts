import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  freezeDocument,
  createAndSendSigningRequest,
} from '@/lib/services/esign-service'
import { recalculateLeadSummary } from '@/lib/services/lead-summary-recalculator'
import { advanceLeadStage } from '@/lib/services/lead-stage-engine'

// ── POST /api/esign/send-retainer ───────────────────────────────────────────
// Sends a lead-level retainer package for e-signature.
// Unlike /api/esign/send (invoice-based, matter-scoped), this operates on
// lead_retainer_packages and uses leadId instead of matterId.

async function handlePost(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>

  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  requirePermission(auth, 'leads', 'edit')

  const { supabase, tenantId, userId } = auth

  try {
    const body = await request.json()
    const {
      retainerPackageId,
      leadId,
      signerName,
      signerEmail,
      signerContactId,
      documentTitle,
    } = body as {
      retainerPackageId: string
      leadId: string
      signerName: string
      signerEmail: string
      signerContactId?: string
      documentTitle?: string
    }

    // ── Validate required params ──────────────────────────────────
    if (!retainerPackageId || !leadId || !signerName || !signerEmail) {
      return NextResponse.json(
        { error: 'retainerPackageId, leadId, signerName, and signerEmail are required' },
        { status: 400 },
      )
    }

    // ── Verify lead exists and belongs to this tenant ─────────────
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, tenant_id')
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { error: 'Lead not found or access denied' },
        { status: 404 },
      )
    }

    // ── Verify retainer package exists and belongs to this lead ───
    const { data: retainerPkg, error: pkgErr } = await supabase
      .from('lead_retainer_packages')
      .select('id, lead_id, status')
      .eq('id', retainerPackageId)
      .eq('tenant_id', tenantId)
      .single()

    if (pkgErr || !retainerPkg) {
      return NextResponse.json(
        { error: 'Retainer package not found' },
        { status: 404 },
      )
    }

    if (retainerPkg.lead_id !== leadId) {
      return NextResponse.json(
        { error: 'Retainer package does not belong to the specified lead' },
        { status: 400 },
      )
    }

    // ── Fetch lawyer's saved signature (if any) for pre-signing ──
    let lawyerSignature: {
      imageBuffer: Buffer
      lawyerName: string
      credentials?: string | null
    } | null = null

    try {
      const admin = createAdminClient()
      const { data: lawyerUser } = await admin
        .from('users')
        .select('first_name, last_name, settings')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lu = lawyerUser as any
      if (lu) {
        const settings = (lu.settings ?? {}) as Record<string, unknown>
        const sig = settings.signature as Record<string, unknown> | undefined
        if (sig?.storage_path) {
          const { data: sigFile } = await admin.storage
            .from('documents')
            .download(sig.storage_path as string)

          if (sigFile) {
            // Use display_name from credentials if set, else first/last
            const creds = (settings.professional_credentials ?? {}) as Record<string, string>
            const lawyerName = creds.display_name
              || [lu.first_name, lu.last_name].filter(Boolean).join(' ')
              || 'Lawyer'

            // Build credentials line: prefer LSO, fall back to RCIC
            let credentialsLine: string | null = null
            if (creds.lso_number) {
              credentialsLine = `LSO #${creds.lso_number}`
            } else if (creds.rcic_number) {
              credentialsLine = `RCIC #${creds.rcic_number}`
            }
            // Append title if set
            if (creds.title && credentialsLine) {
              credentialsLine = `${credentialsLine} · ${creds.title}`
            } else if (creds.title) {
              credentialsLine = creds.title
            }

            lawyerSignature = {
              imageBuffer: Buffer.from(await sigFile.arrayBuffer()),
              lawyerName,
              credentials: credentialsLine,
            }
          }
        }
      }
    } catch (err) {
      // Non-blocking: if signature fetch fails, proceed without pre-signing
      console.warn('[esign-send-retainer] Could not fetch lawyer signature:', err)
    }

    // ── Freeze the source document (with optional lawyer pre-signature)
    const freezeResult = await freezeDocument(supabase as never, {
      tenantId,
      sourceEntityType: 'retainer_package',
      sourceEntityId: retainerPackageId,
      leadId,
      contactId: signerContactId ?? null,
      documentType: 'retainer_agreement',
      title: documentTitle ?? 'Retainer Agreement',
      createdBy: userId,
      lawyerSignature,
    })

    if (!freezeResult.success || !freezeResult.data) {
      return NextResponse.json(
        { error: freezeResult.error || 'Failed to freeze document' },
        { status: 500 },
      )
    }

    // ── Create and send the signing request ───────────────────────
    const sendResult = await createAndSendSigningRequest(supabase as never, {
      tenantId,
      signingDocumentId: freezeResult.data.signingDocumentId,
      leadId,
      signerName,
      signerEmail,
      signerContactId,
      createdBy: userId,
    })

    if (!sendResult.success || !sendResult.data) {
      return NextResponse.json(
        { error: sendResult.error || 'Failed to send signing request' },
        { status: 500 },
      )
    }

    // ── Update retainer package status ────────────────────────────
    await supabase
      .from('lead_retainer_packages')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        signing_document_id: freezeResult.data.signingDocumentId,
        signing_request_id: sendResult.data.signingRequestId,
      })
      .eq('id', retainerPackageId)
      .eq('tenant_id', tenantId)

    // ── Recalculate lead summary ──────────────────────────────────
    await recalculateLeadSummary(supabase, leadId, tenantId)

    // ── Best-effort stage advance to retainer_sent ────────────────
    try {
      await advanceLeadStage({
        supabase,
        leadId,
        tenantId,
        targetStage: 'retainer_sent',
        actorUserId: userId,
        actorType: 'system',
        reason: 'Retainer package sent for e-signature',
      })
    } catch (stageErr) {
      // Non-blocking: stage advance failure should not fail the send
      console.warn('[esign-send-retainer] Stage advance failed (non-blocking):', stageErr)
    }

    return NextResponse.json({
      signingRequestId: sendResult.data.signingRequestId,
      signingDocumentId: freezeResult.data.signingDocumentId,
    })
  } catch (error) {
    console.error('[esign-send-retainer] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
