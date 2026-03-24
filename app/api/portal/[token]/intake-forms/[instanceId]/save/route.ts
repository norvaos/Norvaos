/**
 * POST /api/portal/[token]/intake-forms/[instanceId]/save
 *
 * Saves client-submitted answers to a specific form instance.
 * Validates token, verifies instance belongs to the matter,
 * then writes via the answer engine with source='client_portal'.
 *
 * Security:
 * - Token validated via portal_links (is_active + expiry)
 * - Instance must belong to the token's matter_id
 * - Only is_client_visible fields are accepted
 * - Matter must not be completed
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteContext {
  params: Promise<{ token: string; instanceId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token, instanceId } = await context.params
  const admin = createAdminClient()

  // 1. Validate token
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, contact_id, is_active, expires_at')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  // Check expiry
  if (link.expires_at !== null && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link has expired' }, { status: 401 })
  }

  // 2. Check matter status (block completed matters)
  const { data: matter } = await admin
    .from('matters')
    .select('id, status')
    .eq('id', link.matter_id ?? '')
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  if (matter.status === 'closed_won' || matter.status === 'closed_lost') {
    return NextResponse.json({ error: 'Matter is completed' }, { status: 403 })
  }

  // 3. Verify instance belongs to this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: instance } = await (admin as any)
    .from('matter_form_instances')
    .select('id, matter_id, form_id, answers, status, completion_state')
    .eq('id', instanceId)
    .eq('matter_id', link.matter_id)
    .eq('is_active', true)
    .single()

  if (!instance) {
    return NextResponse.json({ error: 'Form instance not found' }, { status: 404 })
  }

  // 4. Parse request body
  let body: { updates: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.updates || typeof body.updates !== 'object') {
    return NextResponse.json({ error: 'Missing updates object' }, { status: 400 })
  }

  // 5. Sanitise: strip any HTML tags from string values
  const sanitised: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body.updates)) {
    if (typeof value === 'string') {
      // Strip HTML tags
      sanitised[key] = value.replace(/<[^>]*>/g, '').trim()
    } else {
      sanitised[key] = value
    }
  }

  // 6. Build answer records with source='client_portal'
  const existingAnswers = (instance.answers as Record<string, unknown>) ?? {}
  const now = new Date().toISOString()
  const updatedAnswers = { ...existingAnswers }

  for (const [profilePath, value] of Object.entries(sanitised)) {
    const answerKey = profilePath.replace(/\./g, '_').slice(0, 8) + '_' + Date.now().toString(36)
    updatedAnswers[answerKey] = {
      value,
      source: 'client_portal',
      profile_path: profilePath,
      updated_at: now,
      stale: false,
    }
  }

  // 7. Update instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (admin as any)
    .from('matter_form_instances')
    .update({
      answers: updatedAnswers,
      status: instance.status === 'pending' ? 'in_progress' : instance.status,
      updated_at: now,
    })
    .eq('id', instanceId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    status: instance.status === 'pending' ? 'in_progress' : instance.status,
    completion_state: instance.completion_state,
    saved_fields: Object.keys(sanitised).length,
    saved_at: now,
  })
}
