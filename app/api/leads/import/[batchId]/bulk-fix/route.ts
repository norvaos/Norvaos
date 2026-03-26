import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/import/[batchId]/bulk-fix
 *
 * Bulk-fix jurisdiction or conflict overrides for multiple staging rows.
 * Body: { action: 'fix_jurisdiction' | 'resolve_conflicts', jurisdictionId?, conflictOverride?, rowIds? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { action, jurisdictionId, conflictOverride, rowIds } = body

    const admin = createAdminClient()

    // Verify batch ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch } = await (admin as any)
      .from('import_batches')
      .select('id')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    let updatedCount = 0

    if (action === 'fix_jurisdiction') {
      if (!jurisdictionId) {
        return NextResponse.json({ success: false, error: 'jurisdictionId is required' }, { status: 400 })
      }

      // Update all rows that need jurisdiction review, or specific rowIds
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (admin as any)
        .from('lead_import_staging')
        .update({
          user_jurisdiction_override: jurisdictionId,
          jurisdiction_needs_review: false,
          validation_status: 'valid',
        })
        .eq('batch_id', batchId)

      if (rowIds && rowIds.length > 0) {
        query = query.in('id', rowIds)
      } else {
        query = query.eq('jurisdiction_needs_review', true)
      }

      const { error, count } = await query.select('id', { count: 'exact', head: true })
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      updatedCount = count ?? 0
    } else if (action === 'resolve_conflicts') {
      if (!conflictOverride) {
        return NextResponse.json({ success: false, error: 'conflictOverride is required (skip | merge | create_new)' }, { status: 400 })
      }

      // Recalculate validation_status based on override
      const newStatus = conflictOverride === 'skip' ? 'conflict' : 'valid'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (admin as any)
        .from('lead_import_staging')
        .update({
          user_conflict_override: conflictOverride,
          validation_status: newStatus,
        })
        .eq('batch_id', batchId)
        .in('validation_status', ['conflict'])

      if (rowIds && rowIds.length > 0) {
        query = query.in('id', rowIds)
      }

      const { error, count } = await query.select('id', { count: 'exact', head: true })
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      updatedCount = count ?? 0
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, updatedCount })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bulk fix failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
