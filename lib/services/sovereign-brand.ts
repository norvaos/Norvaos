/**
 * Directive 033: Sovereign Brand Service
 *
 * Fetches and manages firm branding data for the Sovereign Letterhead Engine.
 * Handles logo/signature byte loading from Supabase Storage.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SovereignBranding, LetterheadLayout } from '@/lib/utils/sovereign-header'
import { brandingFromTenant } from '@/lib/utils/sovereign-header'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrandingUpdate {
  letterhead_layout?: LetterheadLayout
  legal_disclaimer?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
}

// ── Fetch Full Branding (for PDF generation) ─────────────────────────────────

/**
 * Loads the complete SovereignBranding for a tenant, including logo and
 * signature image bytes from Supabase Storage.
 *
 * Used by all PDF generators before calling drawSovereignHeader().
 */
export async function loadSovereignBranding(tenantId: string): Promise<SovereignBranding> {
  const admin = createAdminClient()

  // Fetch tenant row (cast to any  -  select with string columns doesn't narrow types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant, error } = await (admin as any)
    .from('tenants')
    .select(
      'name, address_line1, address_line2, city, province, postal_code, country, ' +
      'office_phone, office_fax, primary_color, secondary_color, accent_color, ' +
      'logo_url, letterhead_layout, legal_disclaimer, signature_url'
    )
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    // Fallback  -  Norva Default Prestige
    return {
      firmName: 'Law Office',
      letterheadLayout: 'classic',
    }
  }

  const t = tenant as Record<string, unknown>

  // Load logo bytes from Storage (if URL is set)
  let logoBytes: Uint8Array | null = null
  let logoMimeType: 'image/png' | 'image/jpeg' | null = null
  if (t.logo_url) {
    const result = await downloadAssetBytes(admin, t.logo_url as string)
    if (result) {
      logoBytes = result.bytes
      logoMimeType = result.mimeType as 'image/png' | 'image/jpeg'
    }
  }

  // Load signature bytes from Storage (if URL is set)
  let signatureBytes: Uint8Array | null = null
  if (t.signature_url) {
    const result = await downloadAssetBytes(admin, t.signature_url as string)
    if (result) {
      signatureBytes = result.bytes
    }
  }

  return brandingFromTenant(
    tenant as Parameters<typeof brandingFromTenant>[0],
    { logoBytes, logoMimeType, signatureBytes },
  )
}

// ── Asset Download Helper ────────────────────────────────────────────────────

async function downloadAssetBytes(
  admin: ReturnType<typeof createAdminClient>,
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    // URL format: firm-assets/<tenant_id>/<filename>
    // Extract the storage path from the full URL or just use as-is if it's a path
    const storagePath = url.includes('firm-assets/')
      ? url.split('firm-assets/')[1]
      : url

    const { data, error } = await admin.storage
      .from('firm-assets')
      .download(storagePath)

    if (error || !data) return null

    const arrayBuffer = await data.arrayBuffer()
    const mimeType = data.type || 'image/png'

    return { bytes: new Uint8Array(arrayBuffer), mimeType }
  } catch {
    return null
  }
}

// ── Update Branding Fields ───────────────────────────────────────────────────

/**
 * Updates branding-specific fields on the tenant row.
 * Used by the Brand Identity settings page.
 */
export async function updateBranding(
  tenantId: string,
  userId: string,
  update: BrandingUpdate,
): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('tenants')
    .update(update)
    .eq('id', tenantId)

  if (error) throw error

  // Audit log
  admin
    .from('audit_logs')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'sovereign_brand_updated',
      entity_type: 'tenant',
      entity_id: tenantId,
      metadata: { updated_fields: Object.keys(update) } as never,
    })
    .then(() => {})
}

// ── Activate Brand Identity ──────────────────────────────────────────────────

/**
 * Marks the brand as activated (sets brand_activated_at) and creates/updates
 * the firm_branding_metadata row.
 */
export async function activateBrandIdentity(
  tenantId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient()

  // Set activation timestamp on tenant
  await admin
    .from('tenants')
    .update({ brand_activated_at: new Date().toISOString() })
    .eq('id', tenantId)

  // Upsert branding metadata
  const { error } = await (admin as ReturnType<typeof createAdminClient>)
    .from('firm_branding_metadata' as never)
    .upsert(
      {
        tenant_id: tenantId,
        activated_by: userId,
        letterhead_version: 1,
      } as never,
      { onConflict: 'tenant_id' } as never,
    )

  if (error) {
    console.error('[sovereign-brand] Failed to upsert branding metadata:', error)
  }

  // Audit log
  admin
    .from('audit_logs')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'sovereign_brand_activated',
      entity_type: 'tenant',
      entity_id: tenantId,
      metadata: { activated_at: new Date().toISOString() } as never,
    })
    .then(() => {})
}

// ── Upload Logo / Signature ──────────────────────────────────────────────────

/**
 * Uploads a logo or signature to the firm-assets bucket and updates the
 * tenant's logo_url or signature_url field.
 */
export async function uploadBrandAsset(
  tenantId: string,
  assetType: 'logo' | 'signature',
  fileBuffer: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const admin = createAdminClient()

  const storagePath = `${tenantId}/${assetType}-${Date.now()}-${fileName}`

  // Upload to firm-assets bucket
  const { error: uploadError } = await admin.storage
    .from('firm-assets')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) throw uploadError

  // Get public URL
  const { data: urlData } = admin.storage
    .from('firm-assets')
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  // Update tenant row
  const field = assetType === 'logo' ? 'logo_url' : 'signature_url'
  const { error: updateError } = await admin
    .from('tenants')
    .update({ [field]: storagePath } as never)
    .eq('id', tenantId)

  if (updateError) throw updateError

  return publicUrl
}
