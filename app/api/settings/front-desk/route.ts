import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import type { Json } from '@/lib/types/database'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/settings/front-desk
 *
 * Get front desk configuration from tenant settings.
 * Requires settings:view permission.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: tenant } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', auth.tenantId)
      .single()

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>
    const fdConfig = (settings.front_desk_config ?? {}) as Record<string, unknown>

    return NextResponse.json({ config: fdConfig })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-front-desk] GET error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/settings/front-desk
 *
 * Update front desk configuration in tenant settings.
 * Requires settings:edit permission.
 *
 * Body: { config: FrontDeskConfig }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const { config } = body as { config: Record<string, unknown> }

    if (!config) {
      return NextResponse.json({ error: 'config required' }, { status: 400 })
    }

    // Get current tenant settings and merge
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
          front_desk_config: config,
        } as unknown as Json,
      })
      .eq('id', auth.tenantId)

    // Log audit event
    admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action: 'front_desk_config_updated',
        entity_type: 'tenant',
        entity_id: auth.tenantId,
        metadata: { config } as unknown as Json,
      })
      .then(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-front-desk] POST error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/settings/front-desk')
export const POST = withTiming(handlePost, 'POST /api/settings/front-desk')
