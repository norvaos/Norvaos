import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkKioskRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/kiosk/[token]/lookup
 *
 * Search today's appointments by name, email, or phone.
 *
 * Rule #7: Kiosk token security  -  validated first.
 * Rule #8: Only shows booker_name before identity verification.
 *          No matter/lawyer details exposed.
 * Rule #17: Multi-tenant isolation  -  tenant_id from token.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Rate limit: 30 req/min per token+IP
    const rateLimitResponse = await checkKioskRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    // 1. Validate kiosk token
    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    // 2. Parse search input
    const body = await request.json()
    const { searchQuery, searchType = 'name' } = body as {
      searchQuery?: string
      searchType?: 'name' | 'email' | 'phone'
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 },
      )
    }

    // 3. Search today's appointments
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    let query = admin
      .from('appointments')
      .select('id, booking_page_id, user_id, guest_name, guest_email, guest_phone, start_time, end_time, duration_minutes, status, appointment_date')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', todayStr)
      .in('status', ['confirmed', 'pending'])
      .order('start_time', { ascending: true })
      .limit(10)

    // Apply search filter based on type
    const term = searchQuery.trim()
    switch (searchType) {
      case 'name':
        query = query.ilike('guest_name', `%${term}%`)
        break
      case 'email':
        query = query.ilike('guest_email', `%${term}%`)
        break
      case 'phone':
        query = query.ilike('guest_phone', `%${term}%`)
        break
    }

    const { data: appointments, error: queryErr } = await query

    if (queryErr) {
      log.error('[kiosk-lookup] Query error', { error_message: queryErr.message })
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // 4. Batch-resolve booking page titles (no N+1  -  Rule #19)
    const pageIds = [...new Set((appointments ?? []).map((a) => a.booking_page_id).filter(Boolean))]
    let pagesMap: Record<string, string> = {}
    if (pageIds.length > 0) {
      const { data: pages } = await admin
        .from('booking_pages')
        .select('id, title')
        .in('id', pageIds)
      pagesMap = Object.fromEntries((pages ?? []).map((p) => [p.id, p.title]))
    }

    // 5. Return sanitised results
    // Rule #8: Only guest_name, time, and booking page title. NO lawyer names, matter details.
    const sanitised = (appointments ?? []).map((a) => ({
      id: a.id,
      booking_page_id: a.booking_page_id,
      guest_name: a.guest_name,
      guest_email: a.guest_email,
      start_time: a.start_time,
      end_time: a.end_time,
      duration_minutes: a.duration_minutes,
      status: a.status,
      booking_page_title: a.booking_page_id ? pagesMap[a.booking_page_id] ?? null : null,
    }))

    return NextResponse.json({ appointments: sanitised })
  } catch (error) {
    log.error('[kiosk-lookup] Unexpected error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/kiosk/[token]/lookup
 *
 * Start a check-in session for a selected appointment.
 * Creates a check_in_sessions record and returns the sessionId.
 */
async function handlePut(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Rate limit: 30 req/min per token+IP
    const rateLimitResponse = await checkKioskRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    const body = await request.json()
    const { appointmentId } = body as { appointmentId: string }

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })
    }

    // Verify appointment belongs to this tenant
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, contact_id, guest_name')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Create check-in session
    const { data: session, error: sessionErr } = await admin
      .from('check_in_sessions')
      .insert({
        tenant_id: tenantId,
        contact_id: appointment.contact_id,
        kiosk_token: token,
        status: 'started',
        current_step: 'appointment_found',
        metadata: { appointment_id: appointmentId, guest_name: appointment.guest_name } as unknown as Json,
      })
      .select('id')
      .single()

    if (sessionErr) {
      log.error('[kiosk-lookup] Session creation error', { error_message: sessionErr.message })
      return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
    }

    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    log.error('[kiosk-lookup] PUT error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/kiosk/[token]/lookup')
export const PUT = withTiming(handlePut, 'PUT /api/kiosk/[token]/lookup')
