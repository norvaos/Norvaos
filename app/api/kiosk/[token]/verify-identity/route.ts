import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkVerifyRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/kiosk/[token]/verify-identity
 *
 * Verify client identity using date of birth.
 *
 * Rule #8: Identity verification required for returning clients.
 *          DOB (or equivalent) before revealing any matter/appointment details.
 *
 * Rate-limited: 10 req/min per IP + contact-level DOB lockout (5 attempts → 15 min).
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Rate limit: 10 req/min per token+IP (stricter for identity verification)
    const rateLimitResponse = checkVerifyRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    // 1. Validate kiosk token
    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    // 2. Parse input
    const body = await request.json()
    const { sessionId, dateOfBirth } = body as {
      sessionId: string
      dateOfBirth: string // YYYY-MM-DD
    }

    if (!sessionId || !dateOfBirth) {
      return NextResponse.json(
        { error: 'sessionId and dateOfBirth are required' },
        { status: 400 },
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return NextResponse.json(
        { error: 'Date must be in YYYY-MM-DD format' },
        { status: 400 },
      )
    }

    // 3. Look up the session
    const { data: session, error: sessionErr } = await admin
      .from('check_in_sessions')
      .select('id, contact_id, status, metadata')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single()

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if already verified
    if (session.status === 'identity_verified' || session.status === 'completed') {
      return NextResponse.json({ verified: true, alreadyVerified: true })
    }

    // 4. Contact-level DOB lockout (Phase 6 hardening)
    // Tracks attempts by contact_id, not session  -  prevents session restart bypass
    const metadata = (session.metadata ?? {}) as Record<string, unknown>

    if (session.contact_id) {
      // Check for active lockout
      const { data: lockout } = await admin
        .from('dob_lockouts')
        .select('attempts, locked_until')
        .eq('tenant_id', tenantId)
        .eq('contact_id', session.contact_id)
        .single()

      if (lockout?.locked_until) {
        const lockedUntil = new Date(lockout.locked_until)
        if (lockedUntil > new Date()) {
          const remainingMs = lockedUntil.getTime() - Date.now()
          const remainingMins = Math.ceil(remainingMs / 60_000)
          return NextResponse.json(
            { error: `Too many verification attempts. Please try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}, or ask the front desk for help.` },
            { status: 429 },
          )
        }
      }
    }

    // 5. Look up contact's DOB
    if (!session.contact_id) {
      // New client  -  no contact record, skip verification
      await admin
        .from('check_in_sessions')
        .update({
          status: 'identity_verified',
          current_step: 'identity_verified',
          dob_verified: true,
          metadata: { ...metadata, verify_skipped: 'no_contact_record' } as unknown as Json,
        })
        .eq('id', sessionId)

      return NextResponse.json({ verified: true, skipped: true })
    }

    const { data: contact } = await admin
      .from('contacts')
      .select('id, immigration_data')
      .eq('id', session.contact_id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Extract DOB from immigration_data or direct field
    const immigrationData = (contact.immigration_data ?? {}) as Record<string, unknown>
    const personalInfo = (immigrationData.personal_information ?? {}) as Record<string, unknown>
    const storedDob = (personalInfo.date_of_birth as string)
      ?? (immigrationData.date_of_birth as string)
      ?? null

    if (!storedDob) {
      // No DOB on file  -  auto-verify (new/incomplete profile)
      await admin
        .from('check_in_sessions')
        .update({
          status: 'identity_verified',
          current_step: 'identity_verified',
          dob_verified: true,
          metadata: { ...metadata, verify_skipped: 'no_dob_on_file' } as unknown as Json,
        })
        .eq('id', sessionId)

      return NextResponse.json({ verified: true, skipped: true })
    }

    // 6. Compare DOB
    const normalizedInput = dateOfBirth.trim()
    const normalizedStored = storedDob.trim().slice(0, 10) // Handle datetime strings

    if (normalizedInput !== normalizedStored) {
      // Track attempt at contact level (not session) to prevent session restart bypass
      if (session.contact_id) {
        const { data: existing } = await admin
          .from('dob_lockouts')
          .select('id, attempts')
          .eq('tenant_id', tenantId)
          .eq('contact_id', session.contact_id)
          .single()

        const newAttempts = (existing?.attempts ?? 0) + 1
        const lockoutData: Record<string, unknown> = {
          attempts: newAttempts,
          last_attempt_at: new Date().toISOString(),
        }

        // Lock out after 5 failed attempts for 15 minutes
        if (newAttempts >= 5) {
          const lockedUntil = new Date(Date.now() + 15 * 60_000)
          lockoutData.locked_until = lockedUntil.toISOString()

          // Audit the lockout
          await admin.from('audit_logs').insert({
            tenant_id: tenantId,
            action: 'dob_lockout_triggered',
            entity_type: 'contact',
            entity_id: session.contact_id,
            metadata: { attempts: newAttempts, locked_until: lockedUntil.toISOString(), session_id: sessionId } as unknown as Json,
          })
        }

        if (existing) {
          await admin
            .from('dob_lockouts')
            .update(lockoutData)
            .eq('id', existing.id)
        } else {
          await admin.from('dob_lockouts').insert({
            tenant_id: tenantId,
            contact_id: session.contact_id,
            ...lockoutData,
          })
        }
      }

      log.warn('[kiosk-verify] DOB mismatch', {
        session_id: sessionId,
        tenant_id: tenantId,
        contact_id: session.contact_id,
      })

      return NextResponse.json(
        { error: 'Date of birth does not match our records. Please try again.' },
        { status: 403 },
      )
    }

    // 7. Verification passed  -  update session
    await admin
      .from('check_in_sessions')
      .update({
        status: 'identity_verified',
        current_step: 'identity_verified',
        dob_verified: true,
        metadata: { ...metadata, identity_verified_at: new Date().toISOString() } as unknown as Json,
      })
      .eq('id', sessionId)

    log.info('[kiosk-verify] Identity verified', {
      session_id: sessionId,
      tenant_id: tenantId,
    })

    return NextResponse.json({ verified: true })
  } catch (error) {
    log.error('[kiosk-verify] Unexpected error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/kiosk/[token]/verify-identity')
