import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { logAuditServer } from '@/lib/queries/audit-logs'

const IANA_TZ_REGEX = /^[A-Za-z_]+\/[A-Za-z_/]+$/

const officeSettingsSchema = z.object({
  firm_name: z.string().min(1, 'Firm name is required').max(200).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  timezone: z
    .string()
    .regex(IANA_TZ_REGEX, 'Must be a valid IANA timezone (e.g. America/Toronto)')
    .optional(),
  currency: z
    .string()
    .length(3, 'Currency must be a 3-character ISO code')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase (e.g. CAD)')
    .optional(),
})

/**
 * PATCH /api/settings/office
 *
 * Update tenant-level office settings: firm name, address, phone,
 * timezone, and default currency.
 *
 * Requires settings:edit permission.
 * Address and phone are stored inside the tenant's settings JSONB column.
 * Firm name, timezone, and currency are top-level tenant columns.
 */
async function handlePatch(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const parsed = officeSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { firm_name, address, phone, timezone, currency } = parsed.data

    if (!firm_name && !address && !phone && !timezone && !currency) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Read current tenant for audit delta + settings merge
    const { data: current, error: readErr } = await admin
      .from('tenants')
      .select('name, timezone, currency, settings')
      .eq('id', auth.tenantId)
      .single()

    if (readErr || !current) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
    }

    // Build top-level column update
    const topLevelUpdate: Record<string, unknown> = {}
    if (firm_name !== undefined) topLevelUpdate.name = firm_name
    if (timezone !== undefined) topLevelUpdate.timezone = timezone
    if (currency !== undefined) topLevelUpdate.currency = currency

    // Merge address/phone into settings JSONB
    const existingSettings =
      typeof current.settings === 'object' && current.settings !== null
        ? (current.settings as Record<string, unknown>)
        : {}

    const settingsPatch: Record<string, unknown> = { ...existingSettings }
    if (address !== undefined) settingsPatch.address = address
    if (phone !== undefined) settingsPatch.phone = phone

    const updatePayload: Record<string, unknown> = { ...topLevelUpdate }
    if (address !== undefined || phone !== undefined) {
      updatePayload.settings = settingsPatch
    }

    const { error: updateErr } = await admin
      .from('tenants')
      .update(updatePayload)
      .eq('id', auth.tenantId)

    if (updateErr) {
      log.error('[settings/office] Failed to update office settings', {
        error_code: updateErr.code,
      })
      return NextResponse.json({ error: 'Failed to save office settings.' }, { status: 500 })
    }

    // Audit (fire-and-forget)
    const changes: Record<string, unknown> = {}
    if (firm_name !== undefined) changes.name = { from: current.name, to: firm_name }
    if (timezone !== undefined) changes.timezone = { from: current.timezone, to: timezone }
    if (currency !== undefined) changes.currency = { from: current.currency, to: currency }
    if (address !== undefined)
      changes.address = {
        from: (existingSettings.address as string | undefined) ?? null,
        to: address,
      }
    if (phone !== undefined)
      changes.phone = {
        from: (existingSettings.phone as string | undefined) ?? null,
        to: phone,
      }

    logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'tenant',
      entityId: auth.tenantId,
      action: 'office_settings_updated',
      changes,
    }).catch(() => {})

    log.info('[settings/office] Office settings updated', { tenant_id: auth.tenantId })

    return NextResponse.json({ error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings/office] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/settings/office')
