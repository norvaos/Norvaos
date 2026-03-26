import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { runConflictScan } from '@/lib/services/conflict-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { TriggerType } from '@/lib/services/conflict-engine'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const admin = createAdminClient()
    requirePermission(auth, 'conflicts', 'create')

    // 2. Parse optional body
    let triggerType: TriggerType = 'manual'
    let leadId: string | undefined
    try {
      const body = await request.json()
      if (body.triggerType) triggerType = body.triggerType
      if (body.leadId) leadId = body.leadId
    } catch {
      // No body or invalid JSON  -  use defaults
    }

    // 3. Verify the contact belongs to this tenant
    const { data: contact, error: contactErr } = await admin
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
    const result = await runConflictScan(admin, {
      contactId,
      tenantId: auth.tenantId,
      triggeredBy: auth.userId,
      triggerType,
    })

    // 5. If a leadId was provided, sync lead.conflict_status with the scan result
    if (leadId) {
      const newStatus = result.scan.status === 'completed'
        ? (result.matches.length === 0
            ? 'auto_scan_complete'
            : (result.scan.score ?? 0) >= 50
              ? 'review_required'
              : 'review_suggested')
        : undefined

      if (newStatus) {
        await admin
          .from('leads')
          .update({ conflict_status: newStatus })
          .eq('id', leadId)
          .eq('tenant_id', auth.tenantId)
      }
    }

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

const admin = createAdminClient()