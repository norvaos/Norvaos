import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'
import { withTiming } from '@/lib/middleware/request-timing'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * GET /api/portal/[token]/field-verifications
 *
 * Returns field verification statuses for the matter linked to this portal token.
 * Used by the Client Portal to render verified fields as read-only and rejected
 * fields with correction highlights.
 *
 * Also returns document slot verification statuses.
 */
async function handleGet(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const { token } = await params
    const link = await validatePortalToken(token)
    const admin = createAdminClient()

    // Fetch field verifications (verification_status + rejection_reason added in migration 149)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fieldVerifications, error: fvErr } = await (admin as any)
      .from('field_verifications')
      .select('id, profile_path, verification_status, rejection_reason, verified_at')
      .eq('matter_id', link.matter_id)
      .eq('tenant_id', link.tenant_id)

    if (fvErr) throw fvErr

    // Fetch document slot verification statuses (columns added in migration 149)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docSlots, error: dsErr } = await (admin as any)
      .from('document_slots')
      .select('id, slot_name, verification_status, verification_rejection_reason, verified_at')
      .eq('matter_id', link.matter_id)
      .eq('is_active', true)

    if (dsErr) throw dsErr

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldRows = (fieldVerifications ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docRows = (docSlots ?? []) as any[]

    return NextResponse.json({
      success: true,
      fieldVerifications: fieldRows,
      documentVerifications: docRows.map((s: Record<string, unknown>) => ({
        slot_id: s.id,
        slot_name: s.slot_name,
        verification_status: s.verification_status || 'pending',
        rejection_reason: s.verification_rejection_reason || null,
        verified_at: s.verified_at,
      })),
    })
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('[portal/field-verifications] error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/field-verifications')
