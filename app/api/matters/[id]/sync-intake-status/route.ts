import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'

/**
 * POST /api/matters/[id]/sync-intake-status
 *
 * Manually triggers a full immigration intake status re-computation and sync.
 * Use this to recover matters that are stuck (e.g. completion_pct was 0 despite
 * portal forms being completed, or status was not advanced after questionnaire
 * was filled via the new per-form portal system).
 *
 * Also recomputes completion_pct from ircc_questionnaire_sessions.progress
 * before running the sync, so the status engine has accurate questionnaire data.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const supabase = await createServerSupabaseClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    // Authenticate caller
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Verify matter belongs to caller's tenant
    const { data: matter } = await supabase
      .from('matters')
      .select('id, tenant_id, matter_type_id')
      .eq('id', matterId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // ── Step 1a: Fix program_category if null ────────────────────────────────
    // If matter_intake.program_category is null the status engine can't find a
    // playbook and always returns 'not_issued', creating an infinite self-heal loop.
    // Recover by looking up program_category_key from the matter's matter_type.
    const { data: currentIntake } = await admin
      .from('matter_intake')
      .select('program_category')
      .eq('matter_id', matterId)
      .maybeSingle()

    if (!currentIntake?.program_category && matter.matter_type_id) {
      const { data: matterType } = await admin
        .from('matter_types')
        .select('program_category_key')
        .eq('id', matter.matter_type_id)
        .maybeSingle()

      if (matterType?.program_category_key) {
        await admin
          .from('matter_intake')
          .update({ program_category: matterType.program_category_key })
          .eq('matter_id', matterId)
      }
    }

    // ── Step 1b: Recompute completion_pct from portal session progress ────────
    // The new per-form portal system stores form completion in
    // ircc_questionnaire_sessions.progress.forms but doesn't update
    // matter_intake.completion_pct. Fix that now.
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('progress, status')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (session) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsData = (session.progress as any)?.forms as Record<string, any> | undefined
      let newCompletionPct = 0

      if (session.status === 'completed') {
        newCompletionPct = 100
      } else if (formsData && Object.keys(formsData).length > 0) {
        const formEntries = Object.values(formsData) as Array<Record<string, unknown>>
        const completedCount = formEntries.filter((f) => f?.status === 'completed').length
        newCompletionPct = formEntries.length > 0
          ? Math.round((completedCount / formEntries.length) * 100)
          : 0
      }

      if (newCompletionPct > 0) {
        await admin
          .from('matter_intake')
          .update({ completion_pct: newCompletionPct })
          .eq('matter_id', matterId)
      }
    }

    // ── Step 2: Run full status sync ──────────────────────────────────────────
    const transition = await syncImmigrationIntakeStatus(admin, matterId, user.id)

    return NextResponse.json({
      success: true,
      previous_status: transition.previousStatus,
      new_status: transition.newStatus,
      changed: transition.changed,
      blocked_reasons: transition.blockedReasons,
    })
  } catch (error) {
    console.error('[sync-intake-status] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
