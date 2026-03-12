import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * PATCH /api/settings/firm
 *
 * Update firm name, branding colours, and regional settings.
 * Uses admin client to bypass RLS — requires settings:edit permission.
 */
async function handlePatch(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const { name, primary_color, secondary_color, accent_color, timezone, currency, date_format } =
      body as {
        name?: string
        primary_color?: string
        secondary_color?: string
        accent_color?: string
        timezone?: string
        currency?: string
        date_format?: string
      }

    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (primary_color !== undefined) update.primary_color = primary_color
    if (secondary_color !== undefined) update.secondary_color = secondary_color
    if (accent_color !== undefined) update.accent_color = accent_color
    if (timezone !== undefined) update.timezone = timezone
    if (currency !== undefined) update.currency = currency
    if (date_format !== undefined) update.date_format = date_format

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await admin
      .from('tenants')
      .update(update)
      .eq('id', auth.tenantId)

    if (error) throw error

    // Audit log (fire-and-forget)
    admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action: 'firm_settings_updated',
        entity_type: 'tenant',
        entity_id: auth.tenantId,
        metadata: { updated_fields: Object.keys(update) } as never,
      })
      .then(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-firm] PATCH error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/settings/firm')
