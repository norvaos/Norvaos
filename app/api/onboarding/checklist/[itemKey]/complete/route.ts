import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { log } from '@/lib/utils/logger'

// Only these keys can be manually completed — auto-detected items are read-only
const MANUAL_ITEM_KEYS = new Set(['billing_configured', 'firm_profile_reviewed'])

/**
 * POST /api/onboarding/checklist/[itemKey]/complete
 *
 * Mark a manual checklist item as completed.
 * Idempotent: second call returns 200 with existing completion data.
 * Auto-detected items are rejected with 422.
 * Requires: settings:edit permission.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ itemKey: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const { itemKey } = await params

    if (!MANUAL_ITEM_KEYS.has(itemKey)) {
      return NextResponse.json(
        {
          error: MANUAL_ITEM_KEYS.has(itemKey)
            ? 'Unknown checklist item.'
            : `"${itemKey}" is auto-detected and cannot be manually completed.`,
        },
        { status: 422 },
      )
    }

    // Upsert — idempotent; UNIQUE(tenant_id, item_key) prevents duplicates
    const { data, error } = await admin
      .from('tenant_onboarding_checklist')
      .upsert(
        {
          tenant_id: auth.tenantId,
          item_key: itemKey,
          completed_by: auth.userId,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,item_key', ignoreDuplicates: false },
      )
      .select('item_key, completed_at, completed_by')
      .single()

    if (error) {
      log.error('[onboarding-checklist] Failed to upsert completion', {
        error_message: error.message,
        tenant_id: auth.tenantId,
        item_key: itemKey,
      })
      return NextResponse.json({ error: 'Failed to save completion.' }, { status: 500 })
    }

    // Fire-and-forget audit — do not block response
    logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'onboarding_checklist',
      entityId: itemKey,
      action: 'checklist_item_completed',
      changes: { item_key: itemKey },
    }).catch(() => {})

    return NextResponse.json({
      item_key: data.item_key,
      completed: true,
      completed_at: data.completed_at,
      completed_by: data.completed_by,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[onboarding-checklist] Error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/checklist/[itemKey]/complete')
