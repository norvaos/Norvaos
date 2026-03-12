import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { apiFetchSchema } from '@/lib/schemas/data-import'
import { apiFetchData } from '@/lib/services/import/api-import-engine'
import type { Json } from '@/lib/types/database'
import type { ImportEntityType } from '@/lib/services/import/types'

/**
 * POST /api/import/api-fetch
 *
 * Fetch data from a connected platform API.
 * Creates an import batch and returns preview rows + auto-mapped columns.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = apiFetchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { platform, entityType } = parsed.data

    const result = await apiFetchData({
      admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      platform,
      entityType: entityType as ImportEntityType,
    })

    // Audit log
    admin
      .from('audit_logs')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action: 'import_api_fetch',
        entity_type: 'import_batch',
        entity_id: result.batchId,
        metadata: { platform, entityType, totalRows: result.totalRows } as unknown as Json,
      })
      .then(() => {})

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[import-api-fetch] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/import/api-fetch')
