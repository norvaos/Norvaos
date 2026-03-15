import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/contacts/[id]/status-records
 *
 * List all immigration status records (permits, visas, PR) for a contact.
 * Includes expiry dates and countdown information.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')
    const { id: contactId } = await params

    // Verify contact belongs to tenant
    const { data: contact, error: contactError } = await auth.supabase
      .from('contacts')
      .select('id, tenant_id')
      .eq('id', contactId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (contactError || !contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      )
    }

    const { data: records, error: recordsError } = await auth.supabase
      .from('contact_status_records')
      .select('*')
      .eq('contact_id', contactId)
      .order('expiry_date', { ascending: false })

    if (recordsError) {
      return NextResponse.json(
        { error: recordsError.message },
        { status: 500 }
      )
    }

    // Annotate with days_until_expiry
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const annotated = (records ?? []).map((r) => ({
      ...r,
      days_until_expiry: Math.ceil(
        (new Date(r.expiry_date).getTime() - today.getTime()) / 86400000
      ),
    }))

    return NextResponse.json({ records: annotated })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    console.error('Status records error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/status-records')
