import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/pii/reveal
 *
 * Logs a PII reveal event to the SENTINEL audit log.
 * Called when a user clicks "Reveal" on a masked PII field and selects a reason.
 *
 * Includes AI-Behavior Sentry rate-limit check:
 *   - 50 reveals in 60 seconds → request blocked + user locked by DB trigger
 *
 * Body:
 *   { fieldName: string, reason: string, matterId?: string, entityType?: string, entityId?: string }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()

    const body = await request.json()
    const { fieldName, reason, matterId, entityType, entityId } = body as {
      fieldName: string
      reason: string
      matterId?: string
      entityType?: string
      entityId?: string
    }

    if (!fieldName || !reason) {
      return NextResponse.json(
        { error: 'fieldName and reason are required' },
        { status: 400 },
      )
    }

    // ── AI-Behavior Sentry: app-layer rate check ──────────────────────────
    // The DB trigger (migration 175) also enforces this, but checking here
    // lets us return a clear 429 response before the INSERT.
    let clientIp: string | null = null
    try {
      const h = await headers()
      clientIp = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
    } catch {
      // headers() may fail outside request context
    }

    const admin = createAdminClient()
    // RPC not yet in generated types  -  cast through unknown
    const { data: rateCheck } = await (admin.rpc as any)('sentinel_pii_rate_check', {
      p_auth_user_id: auth.authUserId,
      p_ip_address: clientIp,
      p_window_secs: 60,
      p_threshold: 50,
    }) as { data: unknown }

    const rateRows = rateCheck as Record<string, unknown>[] | Record<string, unknown> | null
    const rateResult = Array.isArray(rateRows) ? rateRows[0] : rateRows
    if (rateResult?.is_blocked) {
      return NextResponse.json(
        {
          error: 'SENTINEL-SENTRY: PII reveal rate limit exceeded. Your session has been flagged.',
          blocked: true,
          reveal_count: rateResult.reveal_count,
        },
        { status: 429 },
      )
    }

    // Log to SENTINEL immutable audit log
    await logSentinelEvent({
      eventType: 'DATA_MASKING_BYPASS',
      severity: 'warning',
      tenantId: auth.tenantId,
      userId: auth.userId,
      authUserId: auth.authUserId,
      tableName: entityType ?? 'matter_immigration',
      recordId: matterId ?? entityId ?? undefined,
      details: {
        action: 'pii_reveal',
        field_name: fieldName,
        reason,
        matter_id: matterId ?? null,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        auto_mask_seconds: 60,
        ip_address: clientIp,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[pii/reveal] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/pii/reveal')
