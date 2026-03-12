import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'

// 30 requests per minute per IP — prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/portal/[token]/questionnaire
 * Check if a questionnaire response already exists for this portal link.
 */
async function handleGet(
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
    const admin = createAdminClient()

    // Validate token
    const { data: link, error: linkError } = await admin
      .from('portal_links')
      .select('id, matter_id, metadata, expires_at, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    const metadata = (link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata))
      ? link.metadata as Record<string, unknown>
      : {}

    const intakeFormId = metadata.intake_form_id as string | undefined
    if (!intakeFormId) {
      return NextResponse.json({ has_questionnaire: false })
    }

    // Check for existing submission linked to this portal link
    const existingResponses = metadata.questionnaire_responses as Record<string, unknown> | undefined
    const submittedAt = metadata.questionnaire_submitted_at as string | undefined

    return NextResponse.json({
      has_questionnaire: true,
      submitted: !!submittedAt,
      submitted_at: submittedAt ?? null,
      responses: existingResponses ?? null,
    })
  } catch (error) {
    console.error('[portal-questionnaire] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/portal/[token]/questionnaire
 * Save questionnaire responses for this portal link.
 *
 * Body: { responses: Record<string, unknown> }
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
    const admin = createAdminClient()

    // Validate token
    const { data: link, error: linkError } = await admin
      .from('portal_links')
      .select('id, matter_id, tenant_id, metadata, expires_at, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    // Parse body
    const body = await request.json()
    const { responses } = body as { responses: Record<string, unknown> }

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'responses object is required' }, { status: 400 })
    }

    // Store responses in portal link metadata
    const existingMetadata = (link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata))
      ? link.metadata as Record<string, unknown>
      : {}

    const updatedMetadata = {
      ...existingMetadata,
      questionnaire_responses: responses,
      questionnaire_submitted_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>

    const { error: updateError } = await admin
      .from('portal_links')
      .update({ metadata: updatedMetadata as unknown as import('@/lib/types/database').Json })
      .eq('id', link.id)

    if (updateError) {
      console.error('[portal-questionnaire] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to save responses' }, { status: 500 })
    }

    // Also create an activity on the matter for tracking
    admin
      .from('activities')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        activity_type: 'portal_questionnaire_submitted',
        title: 'Client submitted portal questionnaire',
        description: `Client completed the intake questionnaire via the document portal.`,
      })
      .then(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-questionnaire] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/questionnaire')
export const POST = withTiming(handlePost, 'POST /api/portal/[token]/questionnaire')
