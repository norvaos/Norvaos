import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * GET /api/contacts/[id]/identity-verification
 *
 * Fetch identity verification status for a contact.
 *
 * POST /api/contacts/[id]/identity-verification
 *
 * Initiate a new identity verification for a contact.
 * Currently supports 'manual' provider. Third-party providers
 * (Onfido, Jumio, Veriff) require vendor SDK integration.
 *
 * Body: {
 *   method: 'document' | 'manual_review'
 *   documentType: 'passport' | 'drivers_licence' | 'national_id' | 'pr_card'
 *   documentCountry: string
 *   documentNumber: string  // Will be hashed, never stored raw
 *   matterId?: string
 * }
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    const { id: contactId } = await params
    const supabase = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verifications, error } = await (supabase as any)
      .from('identity_verifications')
      .select('id, provider, method, status, confidence_score, document_type, document_country, verified_at, created_at, failure_reason')
      .eq('contact_id', contactId)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error

    // Determine overall verification status
    const latestVerified = (verifications ?? []).find((v: { status: string }) => v.status === 'verified')

    return NextResponse.json({
      contactId,
      isVerified: !!latestVerified,
      latestVerification: latestVerified ?? null,
      verifications: verifications ?? [],
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[identity-verification] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'edit')

    const { id: contactId } = await params
    const body = await request.json()
    const {
      method = 'manual_review',
      documentType,
      documentCountry,
      documentNumber,
      matterId,
    } = body as {
      method: string
      documentType?: string
      documentCountry?: string
      documentNumber?: string
      matterId?: string
    }

    const supabase = createAdminClient()

    // Hash the document number — never store raw PII
    const documentNumberHash = documentNumber
      ? createHash('sha256').update(documentNumber).digest('hex')
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verification, error: insertError } = await (supabase as any)
      .from('identity_verifications')
      .insert({
        tenant_id: auth.tenantId,
        contact_id: contactId,
        matter_id: matterId ?? null,
        provider: 'manual',
        method,
        status: method === 'manual_review' ? 'verified' : 'pending',
        confidence_score: method === 'manual_review' ? 85.00 : null,
        document_type: documentType ?? null,
        document_country: documentCountry ?? null,
        document_number_hash: documentNumberHash,
        initiated_by: auth.userId,
        verified_at: method === 'manual_review' ? new Date().toISOString() : null,
      })
      .select('id, status, method, document_type, created_at')
      .single()

    if (insertError) {
      console.error('[identity-verification] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create verification' }, { status: 500 })
    }

    const verificationRecord = verification as { id: string; status: string; method: string; document_type: string; created_at: string }

    // Log to SENTINEL
    logSentinelEvent({
      eventType: 'IDENTITY_VERIFICATION',
      severity: 'info',
      tenantId: auth.tenantId,
      userId: auth.userId,
      tableName: 'identity_verifications',
      recordId: verificationRecord.id,
      details: {
        contact_id: contactId,
        method,
        provider: 'manual',
        document_type: documentType,
        status: verificationRecord.status,
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      verification: verificationRecord,
      message: method === 'manual_review'
        ? 'Identity verified via manual review'
        : 'Verification initiated — awaiting provider response',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[identity-verification] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/identity-verification')
export const POST = withTiming(handlePost, 'POST /api/contacts/[id]/identity-verification')
