import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import { randomUUID } from 'crypto'
import type { Json } from '@/lib/types/database'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * Check if the user has at least one of the given permissions.
 * Throws AuthError (403) if none match.
 */
function requireAnyPermission(
  auth: Parameters<typeof requirePermission>[0],
  checks: Array<[string, string]>,
) {
  for (const [entity, action] of checks) {
    try {
      requirePermission(auth, entity, action)
      return // first match wins
    } catch {
      // try next
    }
  }
  throw new AuthError(`Permission denied: ${checks.map(([e, a]) => `${e}:${a}`).join(' or ')}`, 403)
}

/**
 * GET /api/settings/kiosk
 *
 * Get kiosk configuration and any existing kiosk tokens.
 * Requires settings:view OR front_desk:view permission.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requireAnyPermission(auth, [['settings', 'view'], ['front_desk', 'view']])
    const admin = createAdminClient()

    // Parallel fetch: tenant settings + kiosk tokens (independent queries)
    const [tenantResult, linksResult] = await Promise.all([
      admin
        .from('tenants')
        .select('name, settings')
        .eq('id', auth.tenantId)
        .single(),
      admin
        .from('portal_links')
        .select('id, token, expires_at, is_active, last_accessed_at, access_count, created_at')
        .eq('tenant_id', auth.tenantId)
        .eq('link_type', 'kiosk')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const settings = (tenantResult.data?.settings ?? {}) as Record<string, unknown>
    const kioskConfig = (settings.kiosk_config ?? {}) as Record<string, unknown>

    return NextResponse.json({
      config: kioskConfig,
      tokens: linksResult.data ?? [],
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-kiosk] GET error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/settings/kiosk
 *
 * Update kiosk configuration and/or generate a new kiosk token.
 *
 * - Config changes require settings:edit.
 * - Token generation requires settings:edit OR front_desk:create
 *   (so front desk staff can launch the kiosk from their console).
 *
 * Body: { config?: KioskConfig, generateToken?: boolean }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const body = await request.json()
    const { config, generateToken } = body as {
      config?: Record<string, unknown>
      generateToken?: boolean
    }

    // Config edits require settings:edit (admin-level).
    // Token-only requests also accept front_desk:create.
    if (config) {
      requirePermission(auth, 'settings', 'edit')
    } else {
      requireAnyPermission(auth, [['settings', 'edit'], ['front_desk', 'create']])
    }

    // Update kiosk config in tenant settings
    if (config) {
      const { data: tenant } = await admin
        .from('tenants')
        .select('settings')
        .eq('id', auth.tenantId)
        .single()

      const currentSettings = (tenant?.settings ?? {}) as Record<string, unknown>

      await admin
        .from('tenants')
        .update({
          settings: {
            ...currentSettings,
            kiosk_config: config,
          } as unknown as Json,
        })
        .eq('id', auth.tenantId)
    }

    // Generate a new kiosk token
    let newToken: string | null = null
    if (generateToken) {
      const token = randomUUID()
      const expiresAt = new Date()
      expiresAt.setTime(expiresAt.getTime() + 24 * 60 * 60 * 1000) // 24-hour expiry (Phase 6A hardening)

      const { data: link, error: linkErr } = await admin
        .from('portal_links')
        .insert({
          tenant_id: auth.tenantId,
          token,
          link_type: 'kiosk',
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_by: auth.userId,
          permissions: { check_in: true } as unknown as Json,
          metadata: { created_from: 'settings' } as unknown as Json,
        })
        .select('id, token, expires_at')
        .single()

      if (linkErr) {
        log.error('[settings-kiosk] Token generation error', {
          error_message: linkErr.message,
        })
        return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
      }

      newToken = link.token

      // Log audit event
      admin
        .from('audit_logs')
        .insert({
          tenant_id: auth.tenantId,
          user_id: auth.userId,
          action: 'kiosk_token_generated',
          entity_type: 'portal_link',
          entity_id: link.id,
          metadata: { expires_at: expiresAt.toISOString() } as unknown as Json,
        })
        .then(() => {})
    }

    return NextResponse.json({
      success: true,
      token: newToken,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-kiosk] POST error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/kiosk
 *
 * Revoke a kiosk token (soft deactivation).
 * Requires settings:edit permission.
 *
 * Body: { tokenId: string }
 */
async function handleDelete(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const { tokenId } = body as { tokenId: string }

    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId required' }, { status: 400 })
    }

    await admin
      .from('portal_links')
      .update({ is_active: false })
      .eq('id', tokenId)
      .eq('tenant_id', auth.tenantId)
      .eq('link_type', 'kiosk')

    // Log audit event
    admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action: 'kiosk_token_revoked',
        entity_type: 'portal_link',
        entity_id: tokenId,
      })
      .then(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-kiosk] DELETE error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/settings/kiosk')
export const POST = withTiming(handlePost, 'POST /api/settings/kiosk')
export const DELETE = withTiming(handleDelete, 'DELETE /api/settings/kiosk')
