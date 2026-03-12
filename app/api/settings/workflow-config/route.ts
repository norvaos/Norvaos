import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { workflowConfigUpdateSchema } from '@/lib/schemas/workflow-config'
import type { Json } from '@/lib/types/database'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/workflow-config
 * Returns the current kiosk_config and front_desk_config from tenants.settings.
 *
 * Requires: authenticated user.
 */
async function handleGet(): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: tenant, error } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', auth.tenantId)
      .single()

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const settings = (tenant.settings ?? {}) as Record<string, unknown>

    return NextResponse.json({
      kiosk_config: settings.kiosk_config ?? {},
      front_desk_config: settings.front_desk_config ?? {},
      feature_flags: settings.feature_flags ?? {},
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/workflow-config
 * Updates kiosk_config and/or front_desk_config in tenants.settings.
 *
 * Requires: admin role.
 * Rule #18: Feature flags hide surfaces, never bypass server checks.
 */
async function handlePut(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    requirePermission(auth, 'settings', 'edit')

    // Parse and validate body
    const body = await request.json()
    const parsed = workflowConfigUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid configuration', details: parsed.error.issues },
        { status: 400 }
      )
    }

    // Get current settings
    const { data: tenant, error: fetchErr } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', auth.tenantId)
      .single()

    if (fetchErr || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const currentSettings = (tenant.settings ?? {}) as Record<string, unknown>

    // Merge in new configs
    const updatedSettings: Record<string, unknown> = { ...currentSettings }

    if (parsed.data.kiosk_config) {
      updatedSettings.kiosk_config = parsed.data.kiosk_config
    }

    if (parsed.data.front_desk_config) {
      updatedSettings.front_desk_config = parsed.data.front_desk_config
    }

    // Save
    const { error: updateErr } = await admin
      .from('tenants')
      .update({ settings: updatedSettings as unknown as Json })
      .eq('id', auth.tenantId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
    }

    // Audit log
    await admin.from('audit_logs').insert({
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      action: 'workflow_config_updated',
      entity_type: 'tenant',
      entity_id: auth.tenantId,
      metadata: {
        updated_sections: [
          parsed.data.kiosk_config ? 'kiosk_config' : null,
          parsed.data.front_desk_config ? 'front_desk_config' : null,
        ].filter(Boolean),
      } as unknown as Json,
    })

    return NextResponse.json({
      success: true,
      kiosk_config: updatedSettings.kiosk_config ?? {},
      front_desk_config: updatedSettings.front_desk_config ?? {},
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/settings/workflow-config')
export const PUT = withTiming(handlePut, 'PUT /api/settings/workflow-config')
