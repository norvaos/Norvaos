import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/internal/job-worker
 *
 * Scheduled worker for form generation job reliability.
 * Called by Vercel Cron every 2 minutes (see vercel.json).
 *
 * Auth: X-Worker-Key header must match WORKER_SECRET env var.
 *
 * Logic:
 *   a. Stale-job detection: Find pending jobs older than 10 minutes → mark failed.
 *   b. Retry dispatch: Find pending jobs 2–10 minutes old with retry_count < 3 → re-dispatch.
 *
 * Returns: { processed: N, retried: N, timed_out: N }
 *
 * Sprint 6, Week 3 — 2026-03-17
 */
async function handleGet(request: Request) {
  // Auth: X-Worker-Key must match WORKER_SECRET
  const workerKey = request.headers.get('x-worker-key') ?? ''
  const workerSecret = process.env['WORKER_SECRET'] ?? ''

  if (!workerSecret || workerKey !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  let timedOut = 0
  let retried = 0

  // ── a. Stale-job detection ──────────────────────────────────────────────────
  // Find pending jobs older than 10 minutes → mark failed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staleJobs, error: staleErr } = await (admin as any)
    .from('form_generation_log')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

  if (staleErr) {
    console.error('[job-worker] Stale-job query error:', staleErr.message)
    return NextResponse.json({ error: 'Worker query failed' }, { status: 500 })
  }

  if (staleJobs && staleJobs.length > 0) {
    const staleIds = (staleJobs as { id: string }[]).map((j) => j.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: failErr } = await (admin as any)
      .from('form_generation_log')
      .update({
        status: 'failed',
        error_message: 'Job timed out: no response from form generation service within 10 minutes',
        completed_at: now,
        updated_at: now,
      })
      .in('id', staleIds)
      .eq('status', 'pending') // Guard: only update if still pending

    if (failErr) {
      console.error('[job-worker] Stale-job update error:', failErr.message)
    } else {
      timedOut = staleIds.length
      console.log(`[job-worker] Marked ${timedOut} stale job(s) as failed.`)
    }
  }

  // ── b. Retry dispatch ───────────────────────────────────────────────────────
  // Find pending jobs 2–10 minutes old with retry_count < 3 → re-dispatch.
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: retryJobs, error: retryErr } = await (admin as any)
    .from('form_generation_log')
    .select('id, tenant_id, matter_id, form_template_id, generation_key, retry_count, metadata')
    .eq('status', 'pending')
    .gte('created_at', tenMinutesAgo)
    .lt('created_at', twoMinutesAgo)
    .lt('retry_count', 3)

  if (retryErr) {
    console.error('[job-worker] Retry-job query error:', retryErr.message)
    // Non-fatal — return what we have so far
    return NextResponse.json({ processed: timedOut, retried, timed_out: timedOut }, { status: 200 })
  }

  const sidecarUrl = process.env['PYTHON_SIDECAR_URL']

  if (retryJobs && retryJobs.length > 0) {
    for (const job of retryJobs as {
      id: string
      tenant_id: string
      matter_id: string
      form_template_id: string
      generation_key: string
      retry_count: number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: Record<string, any> | null
    }[]) {
      // Increment retry_count in DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: retryUpdateErr } = await (admin as any)
        .from('form_generation_log')
        .update({
          retry_count: (job.retry_count ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', job.id)
        .eq('status', 'pending') // Only update if still pending

      if (retryUpdateErr) {
        console.error(`[job-worker] Retry update error for job ${job.id}:`, retryUpdateErr.message)
        continue
      }

      // Fire-and-forget re-dispatch to sidecar
      if (sidecarUrl) {
        Promise.resolve().then(async () => {
          try {
            const fieldOverrides =
              job.metadata && typeof job.metadata === 'object'
                ? (job.metadata['field_overrides'] ?? {})
                : {}

            const sidecarPayload = {
              job_id:           job.id,
              tenant_id:        job.tenant_id,
              matter_id:        job.matter_id,
              form_template_id: job.form_template_id,
              generation_key:   job.generation_key,
              field_overrides:  fieldOverrides,
              callback_url:     `${process.env['NEXTAUTH_URL'] ?? ''}/api/internal/form-generation-callback`,
            }

            const res = await fetch(`${sidecarUrl}/generate-form`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'X-Job-ID': job.id },
              body:    JSON.stringify(sidecarPayload),
              signal:  AbortSignal.timeout(5000),
            })

            if (!res.ok) {
              console.error(`[job-worker] Sidecar returned ${res.status} for job ${job.id}`)
            }
          } catch (err) {
            console.error(`[job-worker] Sidecar dispatch error for job ${job.id}:`, err)
          }
        }).catch((e: unknown) => {
          console.error('[job-worker] Sidecar promise chain error:', e)
        })
      } else {
        console.warn(`[job-worker] PYTHON_SIDECAR_URL not configured — job ${job.id} retry skipped`)
      }

      retried++
    }
  }

  const processed = timedOut + retried
  console.log(`[job-worker] Done. processed=${processed}, retried=${retried}, timed_out=${timedOut}`)

  return NextResponse.json({ processed, retried, timed_out: timedOut }, { status: 200 })
}

export const GET = withTiming(handleGet, 'GET /api/internal/job-worker')
