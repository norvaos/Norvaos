import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { runConflictScan } from '@/lib/services/conflict-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { TriggerType } from '@/lib/services/conflict-engine'

/**
 * POST /api/contacts/[id]/conflict-scan
 *
 * Runs a conflict scan for the given contact.
 * Requires conflicts:create permission.
 *
 * Body: { triggerType?: TriggerType }
 * Returns: { success: true, scan, matches }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params

    // 1. Authenticate & authorize
    const auth = await authenticateRequest()
    requirePermission(auth, 'conflicts', 'create')

    // 2. Parse optional body
    let triggerType: TriggerType = 'manual'
    try {
      const body = await request.json()
      if (body.triggerType) triggerType = body.triggerType
    } catch {
      // No body or invalid JSON — use defaults
    }

    // 3. Verify the contact belongs to this tenant
    const { data: contact, error: contactErr } = await auth.supabase
      .from('contacts')
      .select('id, tenant_id')
      .eq('id', contactId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (contactErr || !contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found or access denied' },
        { status: 404 }
      )
    }

    // 4. Run the scan
    const result = await runConflictScan(auth.supabase, {
      contactId,
      tenantId: auth.tenantId,
      triggeredBy: auth.userId,
      triggerType,
    })

    return NextResponse.json(
      {
        success: true,
        scan: result.scan,
        matches: result.matches,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Conflict scan error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/contacts/[id]/conflict-scan')
