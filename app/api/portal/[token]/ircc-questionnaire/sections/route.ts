import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { buildClientQuestionnaireFromDB } from '@/lib/ircc/questionnaire-engine-db'
import type { IRCCProfile } from '@/lib/types/ircc-profile'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/portal/[token]/ircc-questionnaire/sections
 *
 * Returns pre-built questionnaire sections from DB client-visible fields.
 * Used when the portal detects `use_db_questionnaire: true`.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
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
      .select('id, matter_id, tenant_id, expires_at, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    const matterId = link.matter_id

    // Get the matter's matter_type_id
    const { data: matter } = await admin
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter?.matter_type_id) {
      return NextResponse.json({ sections: [], form_codes: [] })
    }

    // Get form IDs from stream forms
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: streamForms } = await (admin as any)
      .from('ircc_stream_forms')
      .select('form_id')
      .eq('matter_type_id', matter.matter_type_id)
      .order('sort_order', { ascending: true })

    if (!streamForms || streamForms.length === 0) {
      return NextResponse.json({ sections: [], form_codes: [] })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formIds = (streamForms as any[]).map((sf: any) => sf.form_id as string)

    // Get contact's existing profile
    let contactId: string | null = null
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('contact_id')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    contactId = session?.contact_id ?? null

    if (!contactId) {
      const { data: primaryPerson } = await admin
        .from('matter_people')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('person_role', 'client')
        .limit(1)
        .maybeSingle()

      contactId = primaryPerson?.contact_id ?? null
    }

    let existingProfile: Partial<IRCCProfile> = {}
    if (contactId) {
      const { data: contact } = await admin
        .from('contacts')
        .select('immigration_data')
        .eq('id', contactId)
        .single()

      existingProfile = (contact?.immigration_data as Partial<IRCCProfile>) ?? {}
    }

    // Build the questionnaire from DB fields
    const questionnaire = await buildClientQuestionnaireFromDB(
      formIds,
      existingProfile,
      admin,
    )

    return NextResponse.json(questionnaire)
  } catch (error) {
    console.error('[portal-ircc-sections] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/ircc-questionnaire/sections')
