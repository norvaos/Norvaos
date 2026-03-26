import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import type { WizardAnswers, TenantOnboardingWizardRow, TypedOnboardingWizardRow } from '@/lib/types/database'

/**
 * GET /api/onboarding/wizard
 *
 * Returns the tenant's onboarding wizard row.
 * Creates a blank draft row (mode=draft, step=0) on first call  -  idempotent.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Fetch or create the wizard row
    const { data: existing } = await admin
      .from('tenant_onboarding_wizard')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ wizard: existing as TenantOnboardingWizardRow })
    }

    // First access  -  seed a blank draft
    const { data: created, error } = await admin
      .from('tenant_onboarding_wizard')
      .insert({ tenant_id: auth.tenantId, mode: 'draft', status: 'draft', current_step: 0, answers: {} as never } as never)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ wizard: created as unknown as TypedOnboardingWizardRow })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/onboarding/wizard
 *
 * Saves wizard progress (partial answers + current step).
 * Idempotent  -  safe to call on every step navigation.
 *
 * Body:
 *   current_step: number           -  0-based step index the user just completed
 *   step_key:     string           -  answers key (e.g. "firmProfile")
 *   step_data:    WizardAnswers[key]  -  the step's collected data
 *   mode?:        'custom' | 'default'
 */
async function handlePut(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const body = await request.json() as {
      current_step: number
      step_key: keyof WizardAnswers
      step_data: unknown
      mode?: 'custom' | 'default'
    }

    const { current_step, step_key, step_data, mode } = body

    if (typeof current_step !== 'number' || !step_key) {
      return NextResponse.json({ error: 'current_step and step_key are required' }, { status: 400 })
    }

    // Fetch existing row to merge answers
    const { data: existing } = await admin
      .from('tenant_onboarding_wizard')
      .select('answers, status')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle() as { data: { answers: unknown; status: string } | null }

    // If already activated, do not allow modifying answers
    if (existing?.status === 'activated' || existing?.status === 'default_applied') {
      return NextResponse.json({ error: 'Wizard is already activated.' }, { status: 409 })
    }

    const existingAnswers = (existing?.answers ?? {}) as WizardAnswers
    const mergedAnswers: WizardAnswers = {
      ...existingAnswers,
      [step_key]: step_data,
    }

    const upsertPayload = {
      tenant_id:    auth.tenantId,
      answers:      mergedAnswers as never,
      current_step,
      ...(mode ? { mode } : {}),
    }

    const { error } = await admin
      .from('tenant_onboarding_wizard')
      .upsert(upsertPayload as never, { onConflict: 'tenant_id' })

    if (error) throw error

    return NextResponse.json({ success: true, current_step, step_key })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/onboarding/wizard')
export const PUT = withTiming(handlePut, 'PUT /api/onboarding/wizard')
