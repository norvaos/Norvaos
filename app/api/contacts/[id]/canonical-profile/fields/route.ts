import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { updateCanonicalField } from '@/lib/services/canonical-profile'
import type { CanonicalDomain, FieldSource } from '@/lib/services/canonical-profile'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/contacts/[id]/canonical-profile/fields
 *
 * Returns canonical profile fields, optionally filtered by domain.
 * Query params: ?domain=identity
 * Requires contacts:read permission.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'contacts', 'read')

    const url = new URL(request.url)
    const domain = url.searchParams.get('domain')

    // Get profile for this contact
    const { data: profile, error: profileErr } = await admin
      .from('canonical_profiles')
      .select('id')
      .eq('contact_id', contactId)
      .maybeSingle()

    if (profileErr) throw profileErr

    if (!profile) {
      return NextResponse.json({ success: true, fields: [] })
    }

    let query = admin
      .from('canonical_profile_fields')
      .select('*')
      .eq('profile_id', profile.id)
      .is('effective_to', null)
      .order('domain')
      .order('field_key')

    if (domain) {
      query = query.eq('domain', domain)
    }

    const { data: fields, error: fieldsErr } = await query
    if (fieldsErr) throw fieldsErr

    return NextResponse.json({ success: true, fields })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Get canonical fields error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/contacts/[id]/canonical-profile/fields
 *
 * Update a canonical profile field.
 * Body: { profileId, domain, fieldKey, value, source, effectiveFrom?, sourceDocumentId? }
 * Requires contacts:update permission.
 */
async function handlePut(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'contacts', 'update')

    // Verify contact belongs to this tenant
    const { data: contact, error: contactErr } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (contactErr || !contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found or access denied' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { profileId, domain, fieldKey, value, source, effectiveFrom, sourceDocumentId } = body

    if (!profileId || !domain || !fieldKey || value === undefined || !source) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: profileId, domain, fieldKey, value, source' },
        { status: 400 }
      )
    }

    const result = await updateCanonicalField(
      admin,
      profileId,
      domain as CanonicalDomain,
      fieldKey,
      value,
      source as FieldSource,
      { effectiveFrom, sourceDocumentId },
    )

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Update canonical field error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/canonical-profile/fields')
export const PUT = withTiming(handlePut, 'PUT /api/contacts/[id]/canonical-profile/fields')
