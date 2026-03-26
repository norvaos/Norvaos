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
 * Uses admin client to bypass RLS  -  requires settings:edit permission.
 */
async function handlePatch(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const {
      name, primary_color, secondary_color, accent_color, timezone, currency, date_format, home_province,
      matter_number_prefix, matter_number_separator, matter_number_padding, matter_number_include_year, matter_naming_template,
      address_line1, office_phone,
    } =
      body as {
        name?: string
        primary_color?: string
        secondary_color?: string
        accent_color?: string
        timezone?: string
        currency?: string
        date_format?: string
        home_province?: string
        matter_number_prefix?: string
        matter_number_separator?: string
        matter_number_padding?: number
        matter_number_include_year?: boolean
        matter_naming_template?: string | null
        address_line1?: string
        office_phone?: string
      }

    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (primary_color !== undefined) update.primary_color = primary_color
    if (secondary_color !== undefined) update.secondary_color = secondary_color
    if (accent_color !== undefined) update.accent_color = accent_color
    if (timezone !== undefined) update.timezone = timezone
    if (currency !== undefined) update.currency = currency
    if (date_format !== undefined) update.date_format = date_format
    if (home_province !== undefined) update.home_province = home_province

    // --- Matter naming configuration fields with validation ---
    if (matter_number_prefix !== undefined) {
      if (!/^[A-Za-z0-9]{1,10}$/.test(matter_number_prefix)) {
        return NextResponse.json(
          { error: 'matter_number_prefix must be 1-10 alphanumeric characters' },
          { status: 400 },
        )
      }
      update.matter_number_prefix = matter_number_prefix
    }
    if (matter_number_separator !== undefined) {
      if (!['-', '/', '.'].includes(matter_number_separator)) {
        return NextResponse.json(
          { error: "matter_number_separator must be one of '-', '/', '.'" },
          { status: 400 },
        )
      }
      update.matter_number_separator = matter_number_separator
    }
    if (matter_number_padding !== undefined) {
      if (!Number.isInteger(matter_number_padding) || matter_number_padding < 3 || matter_number_padding > 8) {
        return NextResponse.json(
          { error: 'matter_number_padding must be an integer between 3 and 8' },
          { status: 400 },
        )
      }
      update.matter_number_padding = matter_number_padding
    }
    if (matter_number_include_year !== undefined) {
      update.matter_number_include_year = matter_number_include_year
    }
    if (matter_naming_template !== undefined) {
      if (matter_naming_template !== null) {
        const validTokens = ['{YYYY}', '{YY}', '{MM}', '{PREFIX}', '{CLIENT_LAST}', '{TYPE_CODE}', '{INC_NUM}', '{RANDOM_HEX}', '{SEP}']
        // Strip all valid tokens, then check remaining text is only literal characters
        let remaining = matter_naming_template
        for (const token of validTokens) {
          remaining = remaining.split(token).join('')
        }
        // Remaining text must be plain literal text (alphanumeric, spaces, hyphens, slashes, dots, underscores)
        if (!/^[A-Za-z0-9 \-/._]*$/.test(remaining)) {
          return NextResponse.json(
            { error: 'matter_naming_template contains invalid tokens or characters. Valid tokens: {YYYY}, {YY}, {MM}, {PREFIX}, {CLIENT_LAST}, {TYPE_CODE}, {INC_NUM}, {RANDOM_HEX}, {SEP}' },
            { status: 400 },
          )
        }
      }
      update.matter_naming_template = matter_naming_template
    }

    // Address and phone are stored in the settings JSONB column
    const hasSettingsUpdate = address_line1 !== undefined || office_phone !== undefined
    if (hasSettingsUpdate) {
      // Read current settings to merge
      const { data: currentTenant } = await admin
        .from('tenants')
        .select('settings')
        .eq('id', auth.tenantId)
        .single()

      const existingSettings =
        typeof currentTenant?.settings === 'object' && currentTenant?.settings !== null
          ? (currentTenant.settings as Record<string, unknown>)
          : {}

      const settingsPatch: Record<string, unknown> = { ...existingSettings }
      if (address_line1 !== undefined) settingsPatch.address = address_line1
      if (office_phone !== undefined) settingsPatch.phone = office_phone
      update.settings = settingsPatch
    }

    const namingFields = ['matter_number_prefix', 'matter_number_separator', 'matter_number_padding', 'matter_number_include_year', 'matter_naming_template'] as const
    const hasNamingChange = namingFields.some((f) => update[f] !== undefined)

    if (Object.keys(update).length === 0 && !hasSettingsUpdate) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // If home_province or naming fields are changing, capture old values for audit
    let oldHomeProvince: string | null = null
    let oldNamingConfig: Record<string, unknown> | null = null
    if (update.home_province !== undefined || hasNamingChange) {
      const selectFields = ['home_province', 'matter_number_prefix', 'matter_number_separator', 'matter_number_padding', 'matter_number_include_year', 'matter_naming_template'].join(',')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current } = await (admin as any)
        .from('tenants')
        .select(selectFields)
        .eq('id', auth.tenantId)
        .single()
      oldHomeProvince = current?.home_province as string | null
      if (hasNamingChange && current) {
        oldNamingConfig = {}
        for (const f of namingFields) {
          if (update[f] !== undefined) {
            oldNamingConfig[f] = current[f]
          }
        }
      }
    }

    const { error } = await admin
      .from('tenants')
      .update(update)
      .eq('id', auth.tenantId)

    if (error) throw error

    // Audit log (fire-and-forget)
    const auditMetadata: Record<string, unknown> = { updated_fields: Object.keys(update) }
    // Enhanced audit for regulatory body changes
    if (update.home_province !== undefined) {
      auditMetadata.regulatory_change = {
        old_value: oldHomeProvince,
        new_value: update.home_province,
        changed_at: new Date().toISOString(),
      }
    }
    // Enhanced audit for matter naming config changes
    if (hasNamingChange) {
      const newNamingConfig: Record<string, unknown> = {}
      for (const f of namingFields) {
        if (update[f] !== undefined) {
          newNamingConfig[f] = update[f]
        }
      }
      auditMetadata.naming_config_change = {
        old_values: oldNamingConfig,
        new_values: newNamingConfig,
        changed_at: new Date().toISOString(),
      }
    }

    let auditAction = 'firm_settings_updated'
    if (hasNamingChange) auditAction = 'matter_naming_config_updated'
    if (update.home_province !== undefined) auditAction = 'regulatory_body_changed'

    admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action: auditAction,
        entity_type: 'tenant',
        entity_id: auth.tenantId,
        metadata: auditMetadata as never,
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
