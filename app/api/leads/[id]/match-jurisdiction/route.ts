import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { prefillJurisdiction } from '@/lib/services/jurisdiction-matcher'

/**
 * POST /api/leads/[id]/match-jurisdiction
 *
 * Smart-prefill: map a raw jurisdiction string to a structured UUID.
 * Uses 3-tier matching: exact → alias → fuzzy (pg_trgm).
 * Flags fuzzy matches (confidence < 80%) for human review.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const rawInput = body?.raw_input

    if (!rawInput || typeof rawInput !== 'string') {
      return NextResponse.json(
        { success: false, error: 'raw_input is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Verify lead belongs to tenant (lean: 2 columns)
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .select('id, tenant_id')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const result = await prefillJurisdiction(admin, leadId, auth.tenantId, rawInput)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to match jurisdiction'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
