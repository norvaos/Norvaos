import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSentinelHandshake } from '@/lib/services/sentinel-handshake'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

/**
 * POST /api/admin/sentinel-handshake
 *
 * Directive 26.2  -  Trigger the Sentinel-Handshake welcome broadcast.
 *
 * Sends a Global 15 localised welcome email with a Safe-Link to
 * the client contact. The Safe-Link initiates the Biometric Handshake
 * (identity verification + intake portal).
 *
 * Body: { contactId, matterId, locale?, portalToken? }
 *
 * If portalToken is not provided, the system will look up the active
 * portal link for the matter, or create one if none exists.
 */

const handshakeSchema = z.object({
  contactId: z.string().uuid(),
  matterId: z.string().uuid(),
  locale: z.string().min(2).max(5).optional(),
  portalToken: z.string().optional(),
})

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const body = await request.json()
    const parsed = handshakeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { contactId, matterId, locale } = parsed.data
    let { portalToken } = parsed.data
    const admin = createAdminClient()

    // Verify the matter belongs to this tenant
    const { data: matter } = await (admin as any)
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // If no portal token provided, look up or create one
    if (!portalToken) {
      const { data: existingLink } = await (admin as any)
        .from('portal_links')
        .select('token, expires_at')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingLink && new Date(existingLink.expires_at) > new Date()) {
        portalToken = existingLink.token
      } else {
        // Create a new portal link (30-day expiry)
        const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        const { error: linkError } = await (admin as any)
          .from('portal_links')
          .insert({
            matter_id: matterId,
            contact_id: contactId,
            tenant_id: auth.tenantId,
            token,
            expires_at: expiresAt,
            is_active: true,
          })

        if (linkError) {
          log.error('[sentinel-handshake] Failed to create portal link', { error: linkError.message })
          return NextResponse.json({ error: 'Failed to create portal link' }, { status: 500 })
        }

        portalToken = token
      }
    }

    // Resolve locale  -  prefer explicit param, then contact.preferred_language
    let effectiveLocale = locale ?? 'en'
    if (!locale) {
      const { data: contact } = await (admin as any)
        .from('contacts')
        .select('preferred_language')
        .eq('id', contactId)
        .single()
      if (contact?.preferred_language) {
        effectiveLocale = contact.preferred_language
      }
    }

    // Fire-and-forget the email (non-blocking)
    sendSentinelHandshake({
      supabase: admin,
      tenantId: auth.tenantId,
      contactId,
      matterId,
      locale: effectiveLocale as any,
      portalToken: portalToken!,
    }).catch((err) => {
      log.error('[sentinel-handshake] Background send failed', { error: String(err) })
    })

    return NextResponse.json({
      success: true,
      portalToken,
      locale: effectiveLocale,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[sentinel-handshake] Route error', { error: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/admin/sentinel-handshake')
