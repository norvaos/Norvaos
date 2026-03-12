import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkKioskRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/kiosk/[token]/matter/[matterId]
 *
 * Returns client-visible detail for a specific matter:
 *   - Client-facing tasks (category='client_facing', not deleted)
 *   - Document slots (is_active=true)
 *
 * Security: only client-facing tasks and document slot metadata exposed.
 * No legal content, internal notes, or billing data returned. (Rule #8)
 * Rule #7: Token validated first. Rule #17: Multi-tenant isolation.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string; matterId: string }> },
) {
  const { token, matterId } = await params

  const rateLimitResponse = checkKioskRateLimit(request, token)
  if (rateLimitResponse) return rateLimitResponse

  const result = await validateKioskToken(token)
  if (result.error) return result.error
  const { link } = result

  const tenantId = link!.tenant_id
  const admin = createAdminClient()

  // Verify matter belongs to this tenant
  const { data: matter } = await admin
    .from('matters')
    .select('id, tenant_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  // Fetch client-facing tasks in parallel with document slots
  const [tasksResult, slotsResult] = await Promise.all([
    admin
      .from('tasks')
      .select('id, title, description, status, priority, due_date, category')
      .eq('matter_id', matterId)
      .eq('is_deleted', false)
      .in('category', ['client_facing'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),

    admin
      .from('document_slots')
      .select('id, slot_name, description, category, person_role, is_required, status, accepted_file_types, max_file_size_bytes, current_version, latest_review_reason')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('is_required', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    tasks: tasksResult.data ?? [],
    documentSlots: slotsResult.data ?? [],
  })
}

export const GET = withTiming(handleGet, 'GET /api/kiosk/[token]/matter/[matterId]')
