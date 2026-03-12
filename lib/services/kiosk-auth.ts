/**
 * Kiosk Token Authentication
 * ═══════════════════════════
 *
 * Validates kiosk tokens for the Check-In Kiosk (Rule #7).
 *
 * Kiosk tokens are portal_links with link_type='kiosk', no matter_id,
 * tenant-scoped, and time-bounded. No logged-in session is required.
 *
 * Token validation is step one in every kiosk route.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'

export interface KioskLink {
  id: string
  tenant_id: string
  token: string
  expires_at: string
  is_active: boolean
  metadata: Json
  permissions: Json
}

export interface KioskValidationResult {
  link?: KioskLink
  error?: NextResponse
}

/**
 * Validate a kiosk token from portal_links.
 *
 * Returns { link } on success or { error: NextResponse } on failure.
 */
export async function validateKioskToken(token: string): Promise<KioskValidationResult> {
  const admin = createAdminClient()

  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, tenant_id, token, expires_at, is_active, metadata, permissions')
    .eq('token', token)
    .eq('is_active', true)
    .eq('link_type', 'kiosk')
    .single()

  if (linkError || !link) {
    log.warn('[kiosk-auth] Invalid kiosk token', { token: token.slice(0, 8) + '...' })
    return {
      error: NextResponse.json({ error: 'Invalid kiosk token' }, { status: 404 }),
    }
  }

  if (new Date(link.expires_at) < new Date()) {
    log.warn('[kiosk-auth] Expired kiosk token', {
      token: token.slice(0, 8) + '...',
      tenant_id: link.tenant_id,
    })
    return {
      error: NextResponse.json({ error: 'Kiosk token expired' }, { status: 410 }),
    }
  }

  // Fire-and-forget: update access tracking
  admin
    .from('portal_links')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: ((link as Record<string, unknown>).access_count as number ?? 0) + 1,
    })
    .eq('id', link.id)
    .then(() => {})

  return { link: link as KioskLink }
}

/**
 * Get tenant branding settings for the kiosk display.
 */
export async function getKioskBranding(tenantId: string) {
  const admin = createAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, settings')
    .eq('id', tenantId)
    .single()

  if (!tenant) return null

  const settings = (tenant.settings ?? {}) as Record<string, unknown>
  const kioskConfig = (settings.kiosk_config ?? {}) as Record<string, unknown>

  return {
    firmName: tenant.name,
    logoUrl: kioskConfig.logo_url as string | null ?? null,
    primaryColor: kioskConfig.primary_color as string | null ?? '#0f172a',
    welcomeMessage: kioskConfig.welcome_message as string | null ?? 'Welcome! Please check in for your appointment.',
    inactivityTimeout: kioskConfig.inactivity_timeout as number | null ?? 120, // seconds
    dataSafetyNotice: kioskConfig.data_safety_notice as string | null ?? null,
    enableIdScan: kioskConfig.enable_id_scan !== false, // default true
    enableIdentityVerify: kioskConfig.enable_identity_verify !== false, // default true
  }
}
