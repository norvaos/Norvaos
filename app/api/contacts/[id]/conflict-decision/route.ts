import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { recordConflictDecision } from '@/lib/services/conflict-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { DecisionType } from '@/lib/services/conflict-engine'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_DECISIONS: DecisionType[] = [
  'no_conflict',
  'proceed_with_caution',
  'conflict_confirmed',
  'waiver_required',
  'waiver_obtained',
  'block_matter_opening',
]

/**
 * POST /api/contacts/[id]/conflict-decision
 *
 * Records a lawyer's conflict review decision.
 * Requires conflicts:approve permission (lawyers/admins only).
 *
 * Body: {
 *   scanId?: string,
 *   decision: DecisionType,
 *   decisionScope?: 'contact' | 'matter_type_specific',
 *   matterTypeId?: string,
 *   notes?: string,
 *   internalNote?: string,
 * }
 * Returns: { success: true, decision, contactStatus }
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
    requirePermission(auth, 'conflicts', 'approve')

    // 2. Parse and validate body
    const body = await request.json()
    const { scanId, decision, decisionScope, matterTypeId, notes, internalNote } = body as {
      scanId?: string
      decision?: DecisionType
      decisionScope?: string
      matterTypeId?: string
      notes?: string
      internalNote?: string
    }

    if (!decision || !VALID_DECISIONS.includes(decision)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid decision. Must be one of: ${VALID_DECISIONS.join(', ')}`,
        },
        { status: 400 }
      )
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

    // 4. Record the decision
    await recordConflictDecision(admin, {
      tenantId: auth.tenantId,
      contactId,
      scanId,
      decidedBy: auth.userId,
      decision,
      decisionScope,
      matterTypeId,
      notes,
      internalNote,
    })

    // 5. Fetch updated contact status
    const { data: updated } = await admin
      .from('contacts')
      .select('conflict_status, conflict_score')
      .eq('id', contactId)
      .single()

    return NextResponse.json(
      {
        success: true,
        decision,
        contactStatus: updated?.conflict_status ?? 'unknown',
        conflictScore: updated?.conflict_score ?? 0,
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

    console.error('Conflict decision error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/contacts/[id]/conflict-decision')
