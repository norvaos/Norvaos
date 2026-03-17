import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/onboarding/wizard/complete
 *
 * Marks the tenant's onboarding wizard as activated.
 * Called by the 7-step simplified onboarding wizard on the final step.
 * Safe to call multiple times (idempotent).
 */
async function handlePost() {
  try {
    const auth  = await authenticateRequest()
    const admin = createAdminClient()

    // Upsert: create row if not exists, mark activated if exists
    const { error } = await admin
      .from('tenant_onboarding_wizard')
      .upsert(
        {
          tenant_id:    auth.tenantId,
          status:       'activated',
          mode:         'custom',
          activated_at: new Date().toISOString(),
          activated_by: auth.userId,
        } as never,
        { onConflict: 'tenant_id' }
      )

    if (error) throw error

    // Fire-and-forget audit log
    admin
      .from('audit_logs')
      .insert({
        tenant_id:   auth.tenantId,
        user_id:     auth.userId,
        action:      'onboarding_wizard_completed',
        entity_type: 'tenant',
        entity_id:   auth.tenantId,
        metadata:    { wizard: '7-step-simple' } as never,
      } as never)
      .then(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/wizard/complete')
