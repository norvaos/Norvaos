import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  createCanonicalProfile,
  getCanonicalProfile,
} from '@/lib/services/canonical-profile'

/**
 * GET /api/contacts/[id]/canonical-profile
 *
 * Returns the canonical profile with all current fields for a contact.
 * Requires contacts:read permission.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'read')

    // Verify contact belongs to this tenant
    const { data: contact, error: contactErr } = await auth.supabase
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

    const profile = await getCanonicalProfile(auth.supabase, contactId)

    return NextResponse.json({ success: true, profile })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Get canonical profile error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/contacts/[id]/canonical-profile
 *
 * Creates a canonical profile for the contact. Idempotent.
 * Requires contacts:update permission.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'update')

    // Verify contact belongs to this tenant
    const { data: contact, error: contactErr } = await auth.supabase
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

    const profileId = await createCanonicalProfile(
      auth.supabase,
      auth.tenantId,
      contactId,
    )

    return NextResponse.json(
      { success: true, profileId },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Create canonical profile error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/canonical-profile')
export const POST = withTiming(handlePost, 'POST /api/contacts/[id]/canonical-profile')
