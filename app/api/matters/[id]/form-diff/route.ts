import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeFormDataDiff } from '@/lib/services/form-diff-engine'
import { logDataMismatchWarning } from '@/lib/services/sentinel-audit'

/**
 * GET /api/matters/[id]/form-diff
 *
 * History-Diff Engine — compares current matter data against the frozen
 * input_snapshot from the last form pack version. Returns field-level
 * mismatches for display in the IRCC forms tab.
 *
 * Query params:
 *   ?form_code=IMM5257E — optional filter by specific form code
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const { id: matterId } = await params
    const url = new URL(request.url)
    const formCode = url.searchParams.get('form_code') ?? undefined

    const supabase = createAdminClient()

    const diff = await computeFormDataDiff(
      supabase,
      matterId,
      auth.tenantId,
      formCode,
    )

    if (!diff) {
      return NextResponse.json({
        hasMismatches: false,
        mismatches: [],
        message: 'No previous form version found for comparison.',
      })
    }

    // If mismatches detected, fire SENTINEL warning (fire-and-forget)
    if (diff.hasMismatches) {
      logDataMismatchWarning({
        tenantId: auth.tenantId,
        userId: auth.userId,
        matterId,
        formCode: diff.formCode,
        mismatches: diff.mismatches.map((m) => ({
          field: m.field,
          current: m.currentValue,
          snapshot: m.snapshotValue,
        })),
      }).catch(() => {})
    }

    return NextResponse.json(diff)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[form-diff] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/form-diff')
