import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/form-generation-jobs/[jobId]/retry
 *
 * Manual retry for a failed or stalled form generation job.
 *
 * Auth: Lawyer, Admin, or Paralegal.
 * Ownership: matter must belong to tenant; job must belong to matter.
 *
 * Rules:
 *  - Job status must be 'failed' or 'pending' (not 'completed' or 'processing')
 *  - Resets status → 'pending', increments retry_count, clears error_message
 *  - Re-dispatches to Python sidecar (fire-and-forget)
 *
 * Returns 202 { success: true, job_id, status: 'pending', retry_count }
 *
 * Sprint 6, Week 3 — 2026-03-17
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: matterId, jobId } = await params

    // 1. Auth + role check
    const auth = await authenticateRequest()
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin', 'Paralegal'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer, Admin, or Paralegal role required' },
        { status: 403 }
      )
    }

    // 2. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 3. Fetch the job — must belong to this matter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: jobErr } = await (auth.supabase as any)
      .from('form_generation_log')
      .select('id, matter_id, form_template_id, generation_key, status, retry_count, metadata')
      .eq('id', jobId)
      .eq('matter_id', matterId)
      .maybeSingle()

    if (jobErr || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }

    // 4. Status guard
    const currentStatus = job.status as string

    if (currentStatus === 'completed') {
      return NextResponse.json(
        { error: 'Job already completed' },
        { status: 409 }
      )
    }

    if (currentStatus === 'processing') {
      return NextResponse.json(
        { error: 'Job is currently processing — wait for completion or timeout' },
        { status: 409 }
      )
    }

    // At this point status is 'failed' or 'pending'
    const newRetryCount = (job.retry_count ?? 0) + 1
    const now = new Date().toISOString()

    // 5. Reset job to pending
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (auth.supabase as any)
      .from('form_generation_log')
      .update({
        status:                'pending',
        retry_count:           newRetryCount,
        error_message:         null,
        processing_started_at: null,
        updated_at:            now,
      })
      .eq('id', jobId)

    if (updateErr) {
      console.error('[form-generation-jobs/retry] Update error:', updateErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to reset job status' },
        { status: 500 }
      )
    }

    // 6. Re-dispatch to sidecar (fire-and-forget)
    const sidecarUrl = process.env['PYTHON_SIDECAR_URL']
    if (sidecarUrl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata = job.metadata as Record<string, any> | null
      const fieldOverrides =
        metadata && typeof metadata === 'object'
          ? (metadata['field_overrides'] ?? {})
          : {}

      Promise.resolve().then(async () => {
        try {
          const sidecarPayload = {
            job_id:           jobId,
            tenant_id:        auth.tenantId,
            matter_id:        matterId,
            form_template_id: job.form_template_id as string,
            generation_key:   job.generation_key as string,
            field_overrides:  fieldOverrides,
            callback_url:     `${process.env['NEXTAUTH_URL'] ?? ''}/api/internal/form-generation-callback`,
          }

          const res = await fetch(`${sidecarUrl}/generate-form`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-Job-ID': jobId },
            body:    JSON.stringify(sidecarPayload),
            signal:  AbortSignal.timeout(5000),
          })

          if (!res.ok) {
            console.error('[form-generation-jobs/retry] Sidecar returned error:', res.status)
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (auth.supabase as any)
            .from('form_generation_log')
            .update({
              status:                'processing',
              processing_started_at: new Date().toISOString(),
            })
            .eq('id', jobId)
            .eq('status', 'pending')
        } catch (err) {
          console.error('[form-generation-jobs/retry] Sidecar dispatch error:', err)
        }
      }).catch((e: unknown) => {
        console.error('[form-generation-jobs/retry] Sidecar promise chain error:', e)
      })
    }

    // 7. Return 202
    return NextResponse.json(
      { success: true, job_id: jobId, status: 'pending', retry_count: newRetryCount },
      { status: 202 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[form-generation-jobs/retry] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/form-generation-jobs/[jobId]/retry')
