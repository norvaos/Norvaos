import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

const PAGE_SIZE = 50

/**
 * GET /api/leads/import/[batchId]/staging?page=1&filter=all
 *
 * Paginated staging rows for the Import Sandbox review screen.
 * filter: all | valid | conflict | needs_review | invalid
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
    const filter = url.searchParams.get('filter') ?? 'all'

    const admin = createAdminClient()

    // Verify batch belongs to tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchErr } = await (admin as any)
      .from('import_batches')
      .select('id')
      .eq('id', batchId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 })
    }

    // Build query  -  lean columns for the review table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
      .from('lead_import_staging')
      .select(
        'id, row_number, first_name, last_name, email, phone, raw_jurisdiction, matched_jurisdiction_id, jurisdiction_match_type, jurisdiction_match_confidence, jurisdiction_needs_review, user_jurisdiction_override, validation_status, conflict_status, conflict_details, validation_errors, user_conflict_override, committed',
        { count: 'exact' }
      )
      .eq('batch_id', batchId)
      .order('row_number', { ascending: true })

    // Apply status filter
    if (filter !== 'all') {
      query = query.eq('validation_status', filter)
    }

    // Paginate
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data: rows, count, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      rows: rows ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch staging rows'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/leads/import/[batchId]/staging
 *
 * Update a single staging row (user overrides for conflict or jurisdiction).
 * Body: { rowId, user_conflict_override?, user_jurisdiction_override? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { rowId, user_conflict_override, user_jurisdiction_override } = body

    if (!rowId) {
      return NextResponse.json({ success: false, error: 'rowId is required' }, { status: 400 })
    }

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

    // Build update payload
    const updates: Record<string, unknown> = {}
    if (user_conflict_override !== undefined) {
      updates.user_conflict_override = user_conflict_override // 'skip' | 'merge' | 'create_new'
    }
    if (user_jurisdiction_override !== undefined) {
      updates.user_jurisdiction_override = user_jurisdiction_override // jurisdiction UUID
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from('lead_import_staging')
      .update(updates)
      .eq('id', rowId)
      .eq('batch_id', batchId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update staging row'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
