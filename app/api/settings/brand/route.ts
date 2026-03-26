import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  updateBranding,
  activateBrandIdentity,
  uploadBrandAsset,
} from '@/lib/services/sovereign-brand'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/settings/brand
 *
 * Directive 033: Fetch current branding state for the Brand Identity settings page.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant, error } = await (admin as any)
      .from('tenants')
      .select(
        'name, logo_url, signature_url, letterhead_layout, legal_disclaimer, ' +
        'primary_color, secondary_color, accent_color, brand_activated_at, ' +
        'address_line1, address_line2, city, province, postal_code, country, ' +
        'office_phone, office_fax'
      )
      .eq('id', auth.tenantId)
      .single()

    if (error) throw error

    const t = tenant as Record<string, unknown> | null

    // Get public URLs for assets
    let logoPublicUrl: string | null = null
    let signaturePublicUrl: string | null = null

    if (t?.logo_url) {
      const { data } = admin.storage
        .from('firm-assets')
        .getPublicUrl(t.logo_url as string)
      logoPublicUrl = data.publicUrl
    }

    if (t?.signature_url) {
      const { data } = admin.storage
        .from('firm-assets')
        .getPublicUrl(t.signature_url as string)
      signaturePublicUrl = data.publicUrl
    }

    return NextResponse.json({
      ...(t || {}),
      logoPublicUrl,
      signaturePublicUrl,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[settings-brand] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/settings/brand
 *
 * Directive 033: Update branding fields (layout, disclaimer, colours).
 */
async function handlePatch(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const { letterhead_layout, legal_disclaimer, primary_color, secondary_color, accent_color } =
      body as {
        letterhead_layout?: 'classic' | 'modern' | 'minimal'
        legal_disclaimer?: string | null
        primary_color?: string | null
        secondary_color?: string | null
        accent_color?: string | null
      }

    const update: Record<string, unknown> = {}
    if (letterhead_layout !== undefined) update.letterhead_layout = letterhead_layout
    if (legal_disclaimer !== undefined) update.legal_disclaimer = legal_disclaimer
    if (primary_color !== undefined) update.primary_color = primary_color
    if (secondary_color !== undefined) update.secondary_color = secondary_color
    if (accent_color !== undefined) update.accent_color = accent_color

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await updateBranding(auth.tenantId, auth.userId, update)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[settings-brand] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/settings/brand
 *
 * Directive 033: Upload logo or signature, or activate brand identity.
 *
 * Body (FormData):
 *   - action: 'upload-logo' | 'upload-signature' | 'activate'
 *   - file: File (for upload actions)
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const contentType = request.headers.get('content-type') || ''

    // JSON body for activation
    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body.action === 'activate') {
        await activateBrandIdentity(auth.tenantId, auth.userId)
        return NextResponse.json({ success: true, activated: true })
      }
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // FormData body for file uploads
    const formData = await request.formData()
    const action = formData.get('action') as string
    const file = formData.get('file') as File | null

    if (!action || !file) {
      return NextResponse.json({ error: 'action and file are required' }, { status: 400 })
    }

    if (action !== 'upload-logo' && action !== 'upload-signature') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
    }

    // Validate mime type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Allowed types: PNG, JPEG, SVG, WebP' },
        { status: 400 },
      )
    }

    const assetType = action === 'upload-logo' ? 'logo' : 'signature'
    const buffer = Buffer.from(await file.arrayBuffer())

    const publicUrl = await uploadBrandAsset(
      auth.tenantId,
      assetType as 'logo' | 'signature',
      buffer,
      file.name,
      file.type,
    )

    return NextResponse.json({ success: true, publicUrl })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[settings-brand] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/settings/brand')
export const PATCH = withTiming(handlePatch, 'PATCH /api/settings/brand')
export const POST = withTiming(handlePost, 'POST /api/settings/brand')
