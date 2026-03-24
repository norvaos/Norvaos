import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  freezeDocument,
  createAndSendSigningRequest,
} from '@/lib/services/esign-service'

// ── POST /api/esign/send ─────────────────────────────────────────────────────

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

  requirePermission(auth, 'documents', 'edit')

  const { supabase, tenantId, userId } = auth

  try {
    const body = await request.json()
    const {
      invoiceId,
      matterId,
      signerName,
      signerEmail,
      signerContactId,
      documentTitle,
    } = body as {
      invoiceId: string
      matterId: string
      signerName: string
      signerEmail: string
      signerContactId?: string
      documentTitle?: string
    }

    if (!invoiceId || !matterId || !signerName || !signerEmail) {
      return NextResponse.json(
        { error: 'invoiceId, matterId, signerName, and signerEmail are required' },
        { status: 400 },
      )
    }

    // Admin client for all write operations
    const admin = createAdminClient()

    // 0. Fetch lawyer's saved signature (if any) for pre-signing
    let lawyerSignature: { imageBuffer: Buffer; lawyerName: string; credentials?: string | null } | null = null
    try {
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
      console.warn('[esign-send] Could not fetch lawyer signature:', err)
    }

    // 1. Freeze the source document (with optional lawyer pre-signature)
    const freezeResult = await freezeDocument(admin as never, {
      tenantId,
      sourceEntityType: 'invoice',
      sourceEntityId: invoiceId,
      matterId,
      documentType: 'retainer_agreement',
      title: documentTitle || 'Retainer Agreement',
      createdBy: userId,
      lawyerSignature,
    })

    if (!freezeResult.success || !freezeResult.data) {
      return NextResponse.json(
        { error: freezeResult.error || 'Failed to freeze document' },
        { status: 500 },
      )
    }

    // 2. Create and send the signing request
    const sendResult = await createAndSendSigningRequest(admin as never, {
      tenantId,
      signingDocumentId: freezeResult.data.signingDocumentId,
      matterId,
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

    return NextResponse.json({
      signingRequestId: sendResult.data.signingRequestId,
    })
  } catch (error) {
    console.error('E-sign send error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
