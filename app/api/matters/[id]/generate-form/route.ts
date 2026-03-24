import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import type { FormGenerationLogInsert } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/generate-form
 *
 * Dispatches a PDF form generation job to the Python sidecar.
 *
 * Steps:
 *  1. Auth + role check (Lawyer, Admin, Paralegal)
 *  2. Verify matter belongs to tenant
 *  3. Validate body: form_template_id required
 *  4. Idempotency: check for pending/processing row with same
 *     (matter_id, form_template_id, generation_key). Return existing if found.
 *  5. Write form_generation_log row with status='pending'
 *  6. Dispatch to Python sidecar (fire-and-forget HTTP POST to PYTHON_SIDECAR_URL)
 *  7. Return 202 { job_id, status: 'pending' }
 *
 * Auth: Lawyer, Admin, or Paralegal.
 *
 * Body: {
 *   form_template_id: string   — template slug (e.g. 'IMM5257E', 'IMM1294E')
 *   generation_key?:  string   — caller-supplied idempotency key (UUID)
 *   field_overrides?: Record<string, unknown>  — optional field value overrides
 * }
 *
 * Sprint 6, Week 2 — 2026-03-17
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate + role check
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin', 'Paralegal'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer, Admin, or Paralegal role required' },
        { status: 403 }
      )
    }

    // 2. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, matter_type_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 3. Parse + validate body
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 422 }
      )
    }

    const form_template_id = typeof body['form_template_id'] === 'string'
      ? body['form_template_id'].trim()
      : ''

    if (!form_template_id) {
      return NextResponse.json(
        { success: false, error: 'form_template_id is required', field: 'form_template_id' },
        { status: 422 }
      )
    }

    const generation_key = typeof body['generation_key'] === 'string'
      ? body['generation_key'].trim()
      : crypto.randomUUID()

    const field_overrides =
      body['field_overrides'] && typeof body['field_overrides'] === 'object'
        ? body['field_overrides'] as Record<string, unknown>
        : {}

    // 4. Idempotency check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (admin as any)
      .from('form_generation_log')
      .select('id, status, output_path')
      .eq('matter_id', matterId)
      .eq('form_template_id', form_template_id)
      .eq('generation_key', generation_key)
      .maybeSingle()

    if (existing) {
      // Job already exists — return it (idempotent)
      return NextResponse.json(
        {
          success: true,
          job_id: existing.id,
          status: existing.status,
          output_path: existing.output_path ?? null,
          idempotent: true,
        },
        { status: 200 }
      )
    }

    // 5. Write form_generation_log row with status='pending'
    const logInsert: FormGenerationLogInsert = {
      tenant_id:        auth.tenantId,
      matter_id:        matterId,
      form_template_id,
      generation_key,
      status:           'pending',
      requested_by:     auth.userId,
      metadata: {
        field_overrides,
        matter_type_id: matter.matter_type_id ?? null,
        requested_at:   new Date().toISOString(),
      } as unknown as import('@/lib/types/database').Json,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logRow, error: logErr } = await (admin as any)
      .from('form_generation_log')
      .insert(logInsert)
      .select('id')
      .single()

    if (logErr || !logRow) {
      console.error('[generate-form] Log insert error:', logErr?.message)
      return NextResponse.json(
        { success: false, error: 'Failed to create form generation job' },
        { status: 500 }
      )
    }

    const jobId = logRow.id as string

    // 6. Dispatch to Python sidecar (fire-and-forget)
    // The sidecar URL is configured via PYTHON_SIDECAR_URL env var.
    // If not configured, the job stays in 'pending' state and will be
    // picked up by the scheduled worker poll.
    const sidecarUrl = process.env['PYTHON_SIDECAR_URL']
    if (sidecarUrl) {
      Promise.resolve().then(async () => {
        try {
          const sidecarPayload = {
            job_id:           jobId,
            tenant_id:        auth.tenantId,
            matter_id:        matterId,
            form_template_id,
            generation_key,
            field_overrides,
            callback_url:     `${process.env['NEXTAUTH_URL'] ?? ''}/api/internal/form-generation-callback`,
          }

          const res = await fetch(`${sidecarUrl}/generate-form`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-Job-ID': jobId },
            body:    JSON.stringify(sidecarPayload),
            signal:  AbortSignal.timeout(5000),
          })

          if (!res.ok) {
            console.error('[generate-form] Sidecar returned error:', res.status)
            // Mark job as processing_started even if sidecar gave non-200;
            // sidecar may still process it.
          }

          // Update log: set status='processing' + processing_started_at
          // Only update if still 'pending' — the sidecar may have already
          // called back with 'completed' before this fire-and-forget resumes.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from('form_generation_log')
            .update({
              status:                'processing',
              processing_started_at: new Date().toISOString(),
            })
            .eq('id', jobId)
            .eq('status', 'pending')
        } catch (sidecarErr) {
          console.error('[generate-form] Sidecar dispatch error:', sidecarErr)
          // Non-fatal — job stays pending; scheduled worker will pick it up.
        }
      }).catch((e: unknown) => {
        console.error('[generate-form] Sidecar promise chain error:', e)
      })
    }

    // 7. Return 202 Accepted
    return NextResponse.json(
      { success: true, job_id: jobId, status: 'pending' },
      { status: 202 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[generate-form] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/generate-form')

const admin = createAdminClient()